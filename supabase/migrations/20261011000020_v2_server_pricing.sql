-- =====================================================================
--  Revnu v2 — the server prices every deal (audit S3, second half) and
--  re-queues the buyer's e-mail after an edit (audit B13). Additive.
--
--  private.deal_prices(p) is the wizard's computeDeal + buildOrderPayloadMulti in SQL: the same catalogue
--  look-ups, skip flags, feature switches and JavaScript arithmetic (double precision, Math.round =
--  floor(x + 0.5), VAT per line = round(n × 115 / 100)). A deferred check on every new order compares the
--  unit price and each extras line with it; a gap larger than 3 SAR per unit is refused (PRICE_MISMATCH).
--  The slack absorbs a rep whose browser still runs the previous rounding until it reloads.
-- =====================================================================
begin;

-- JavaScript truthiness of a JSON value (false, 0, "" and null are false).
create or replace function private.jflag(v jsonb)
returns boolean language sql immutable as $$
  select v is not null and v not in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb);
$$;

-- JavaScript Number(v) || 0.
create or replace function private.jnum(v jsonb)
returns float8 language sql immutable as $$
  select case jsonb_typeof(v)
    when 'number' then (v #>> '{}')::float8
    when 'string' then case when btrim(v #>> '{}') ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?$' then btrim(v #>> '{}')::float8 else 0 end
    when 'boolean' then case when v = 'true'::jsonb then 1 else 0 end
    else 0 end;
$$;

-- D.withVat: VAT-inclusive whole riyals for one line.
create or replace function private.vat(n float8)
returns float8 language sql immutable as $$
  select floor(coalesce(n, 0) * 115 / 100 + 0.5);
$$;

-- D.boqTotal: Σ qty × unitPrice, in line order.
create or replace function private.boq_total(boq jsonb)
returns float8 language sql immutable as $$
  select coalesce(sum(private.jnum(l->'qty') * private.jnum(l->'unitPrice') order by o), 0)::float8
  from jsonb_array_elements(case when jsonb_typeof(boq) = 'array' then boq else '[]'::jsonb end) with ordinality as t(l, o);
$$;

-- D.kitchenTotalPrice: the scope's price for the unit type, plus the chosen optional items (0 when not offered).
create or replace function private.kitchen_net(k public.kitchens, p_scope text, p_type text, p_ids jsonb)
returns float8 language plpgsql stable as $$
declare sc text := coalesce(nullif(p_scope, ''), 'cabinets'); base float8; extra float8 := 0; id jsonb; a jsonb;
begin
  if k.id is null or jsonb_typeof(k.scopes) is distinct from 'object' then return 0; end if;
  base := case when jsonb_typeof(k.scopes->sc) = 'object' and jsonb_typeof(k.scopes->sc->'pricing') = 'object'
               then private.jnum(k.scopes->sc->'pricing'->p_type) else 0 end;
  if base <= 0 then return 0; end if;
  for id in select value from jsonb_array_elements(case when jsonb_typeof(p_ids) = 'array' then p_ids else '[]'::jsonb end) loop
    select x into a from jsonb_array_elements(case when jsonb_typeof(k.addons) = 'array' then k.addons else '[]'::jsonb end) with ordinality as t(x, o)
    where x->'id' = id
      and (jsonb_typeof(x->'scopes') is distinct from 'array' or jsonb_array_length(x->'scopes') = 0 or x->'scopes' ? sc)
    order by o limit 1;
    if a is not null then extra := extra + private.jnum(a->'price'); end if;
  end loop;
  return base + extra;
end $$;

-- D.acTotalPrice: per cooling point the smallest tier covering its BTU (else the largest), + install per point,
-- + chosen optional items (0 when the system does not fit the unit type or the type has no points).
create or replace function private.ac_net(a public.ac_systems, p_project text, p_type text, p_ids jsonb)
returns float8 language plpgsql stable as $$
declare pts jsonb; base float8 := 0; p jsonb; keys float8[]; hit float8; extra float8;
begin
  if a.id is null then return 0; end if;
  if not (a.fits is null or cardinality(a.fits) = 0 or p_type = any(a.fits)) then return 0; end if;
  select points into pts from public.cooling_points where project_id = p_project and type_id = p_type;
  if pts is null or jsonb_typeof(pts) <> 'array' or jsonb_array_length(pts) = 0 then return 0; end if;
  select array_agg(k::float8 order by k::float8) into keys
  from jsonb_each(case when jsonb_typeof(a.tiers) = 'object' then a.tiers else '{}'::jsonb end) as t(k, v)
  where k ~ '^(0|[1-9][0-9]{0,8})$' and private.jnum(v) > 0;
  for p in select value from jsonb_array_elements(pts) with ordinality as t(value, o) order by o loop
    if keys is null then continue; end if;
    select min(x) into hit from unnest(keys) as x where x >= private.jnum(p->'btu');
    if hit is null then hit := keys[array_length(keys, 1)]; end if;
    base := base + private.jnum(a.tiers->((hit::bigint)::text));
  end loop;
  base := base + coalesce(a.install, 0)::float8 * jsonb_array_length(pts);
  if base <= 0 then return 0; end if;
  select coalesce(sum(private.jnum(x->'price') order by o), 0) into extra
  from jsonb_array_elements(case when jsonb_typeof(a.addons) = 'array' then a.addons else '[]'::jsonb end) with ordinality as t(x, o)
  where jsonb_typeof(p_ids) = 'array' and p_ids @> jsonb_build_array(x->'id');
  return base + extra;
end $$;

-- D.flooringPrice: Σ over the unit type's zones of round(m² × uplift of the chosen size) for upgraded zones.
create or replace function private.flooring_net(p_project text, p_type text, p_sel jsonb)
returns float8 language plpgsql stable as $$
declare zs jsonb; z jsonb; pick jsonb; f public.flooring_finishes; sz jsonb; total float8 := 0;
begin
  select zones into zs from public.flooring_zones where project_id = p_project and type_id = p_type;
  if zs is null or jsonb_typeof(zs) <> 'array' then return 0; end if;
  for z in select value from jsonb_array_elements(zs) with ordinality as t(value, o) order by o loop
    pick := case when jsonb_typeof(p_sel) = 'object' and z ? 'zone' then p_sel->(z->>'zone') else null end;
    f := null; sz := null;
    if jsonb_typeof(pick) = 'object' and private.jflag(pick->'finishId') then
      select * into f from public.flooring_finishes where id = pick->>'finishId' and project_id = p_project;
    end if;
    if f.id is not null and not f.standard and (f.zones is null or cardinality(f.zones) = 0 or (z->>'zone') = any(f.zones)) then
      select x into sz from jsonb_array_elements(case when jsonb_typeof(f.sizes) = 'array' then f.sizes else '[]'::jsonb end) with ordinality as t(x, o)
      where x->'id' = pick->'sizeId' order by o limit 1;
      if sz is null then
        select x into sz from jsonb_array_elements(case when jsonb_typeof(f.sizes) = 'array' then f.sizes else '[]'::jsonb end) with ordinality as t(x, o) order by o limit 1;
      end if;
      total := total + floor(private.jnum(z->'area') * (case when sz is null then 0 else private.jnum(sz->'uplift') end) + 0.5);
    end if;
  end loop;
  return total;
end $$;

-- D.layoutTotal: one option per area (first in catalogue order), flat price or wall m × rate + doors × rate.
create or replace function private.layout_net(p_proj public.projects, p_type text, p_ids jsonb)
returns float8 language plpgsql stable as $$
declare o public.layout_options; seen text[] := '{}'; k text; total float8 := 0; wall float8; door float8;
begin
  if jsonb_typeof(p_ids) is distinct from 'array' or jsonb_array_length(p_ids) = 0 then return 0; end if;
  wall := case when jsonb_typeof(p_proj.layout_rates) = 'object' and p_proj.layout_rates ? 'wallPerM' then private.jnum(p_proj.layout_rates->'wallPerM') else 950 end;
  door := case when jsonb_typeof(p_proj.layout_rates) = 'object' and p_proj.layout_rates ? 'doorPrice' then private.jnum(p_proj.layout_rates->'doorPrice') else 1800 end;
  for o in select * from public.layout_options where project_id = p_proj.id and type_id = p_type order by created_at, id loop
    if not (p_ids @> jsonb_build_array(o.id)) then continue; end if;
    k := coalesce(nullif(o.area, ''), o.id);
    if k = any(seen) then continue; end if;
    seen := seen || k;
    total := total + case when o.flat_price is not null then greatest(0, o.flat_price::float8)
                          else greatest(0, floor(coalesce(o.wall_m, 0)::float8 * wall + coalesce(o.doors, 0)::float8 * door + 0.5)) end;
  end loop;
  return total;
end $$;

-- The prices of a deal, from an order payload (the create_order shape): per unit the configuration it was sold
-- with (perUnit in per-unit mode, else the order's own columns), priced exactly as the wizard prices it.
create or replace function private.deal_prices(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare proj public.projects; f jsonb; base jsonb; cfg jsonb; skip jsonb; u record; n int := 0; ben boolean;
  pk public.packages; sm public.smart_home; kt public.kitchens; ac public.ac_systems;
  pkg_price float8; smart_price float8; k_net float8; a_net float8; fl_net float8; lay_net float8; fo_net float8;
  t_unit float8 := 0; t_furnish float8 := 0; t_k float8 := 0; t_a float8 := 0; t_fl float8 := 0; t_lay float8 := 0; t_fo float8 := 0;
  stray text[] := '{}';
begin
  select * into proj from public.projects where id = p->>'projectId';
  if proj.id is null then return null; end if;
  f := coalesce(proj.features, '{}'::jsonb);
  ben := private.jflag(p->'customer'->'beneficiary');
  base := jsonb_build_object('packageId', p->'packageId', 'smartId', p->'smartId', 'kitchenId', p->'kitchenId', 'kitchenScope', p->'kitchenScope',
            'kitchenAddons', p->'kitchenAddons', 'acId', p->'acId', 'acAddons', p->'acAddons', 'flooring', p->'flooring',
            'layoutIds', p->'layoutIds', 'fitout', p->'fitout', 'opsId', p->'opsId');
  for u in select x.num, x.ord, un.type_id, un.price_adj, un.price_ben, t.base_price
           from jsonb_array_elements_text(case when jsonb_typeof(p->'unitNumbers') = 'array' then p->'unitNumbers' else '[]'::jsonb end) with ordinality as x(num, ord)
           join public.units un on un.number = x.num and un.project_id = proj.id
           left join public.unit_types t on t.id = un.type_id
           order by x.ord loop
    n := n + 1;
    t_unit := t_unit + case when ben and u.price_ben is not null then u.price_ben else coalesce(u.base_price, 0) + coalesce(u.price_adj, 0) end;
    cfg := case when private.jflag(p->'perUnitMode') and jsonb_typeof(p->'perUnit'->u.num) = 'object' then p->'perUnit'->u.num else base end;
    skip := case when jsonb_typeof(cfg->'skip') = 'object' then cfg->'skip' else '{}'::jsonb end;
    pk := null; sm := null; kt := null; ac := null;
    if not private.jflag(skip->'furnishing') and private.jflag(cfg->'packageId') then
      select * into pk from public.packages where id = cfg->>'packageId' and project_id = proj.id; end if;
    if not private.jflag(skip->'smartHome') and private.jflag(cfg->'smartId') then
      select * into sm from public.smart_home where id = cfg->>'smartId' and project_id = proj.id; end if;
    if not private.jflag(skip->'kitchens') and private.jflag(cfg->'kitchenId') then
      if not private.jflag(f->'kitchens') then stray := stray || 'kitchen'; else
        select * into kt from public.kitchens where id = cfg->>'kitchenId' and project_id = proj.id; end if; end if;
    if not private.jflag(skip->'cooling') and private.jflag(cfg->'acId') then
      if not private.jflag(f->'cooling') then stray := stray || 'cooling'; else
        select * into ac from public.ac_systems where id = cfg->>'acId' and project_id = proj.id; end if; end if;
    pkg_price := case when pk.id is not null and u.type_id is not null and jsonb_typeof(pk.pricing) = 'object' then private.jnum(pk.pricing->u.type_id) else 0 end;
    smart_price := case when sm.id is not null then coalesce(sm.price, 0)::float8 else 0 end;
    k_net := greatest(0, case when kt.id is not null then private.kitchen_net(kt, cfg->>'kitchenScope', u.type_id, cfg->'kitchenAddons') else 0 end);
    a_net := greatest(0, case when ac.id is not null then private.ac_net(ac, proj.id, u.type_id, cfg->'acAddons') else 0 end);
    fl_net := case when private.jflag(f->'flooring') and not private.jflag(skip->'flooring') and u.type_id is not null
                   then private.flooring_net(proj.id, u.type_id, cfg->'flooring') else 0 end;
    lay_net := case when private.jflag(f->'layout') and not private.jflag(skip->'layout') and u.type_id is not null
                    then private.layout_net(proj, u.type_id, cfg->'layoutIds') else 0 end;
    fo_net := case when private.jflag(f->'fitout') and pk.id is not null and private.jflag(pk.fitout) and private.jflag(cfg->'fitout')
                   then private.boq_total(pk.fitout->'boq') else 0 end;
    t_k := t_k + private.vat(k_net); t_a := t_a + private.vat(a_net); t_fl := t_fl + private.vat(fl_net);
    t_lay := t_lay + private.vat(lay_net); t_fo := t_fo + private.vat(fo_net);
    t_furnish := t_furnish + private.vat(pkg_price + smart_price) + private.vat(fo_net) + private.vat(k_net) + private.vat(a_net) + private.vat(fl_net) + private.vat(lay_net);
  end loop;
  return jsonb_build_object('units', n, 'unitPrice', t_unit, 'furnishCost', t_furnish, 'kitchenCost', t_k, 'acCost', t_a,
           'flooringCost', t_fl, 'layoutCost', t_lay, 'fitoutCost', t_fo, 'stray', to_jsonb(stray));
end $$;

-- Every new order: the unit price and every extras line must be the catalogue's (within 3 SAR per unit), and no
-- kitchen / cooling is sold on a project that does not offer it. Deferred: order_units exist by commit time.
create or replace function private.orders_check_prices() returns trigger
language plpgsql security definer set search_path = public as $$
declare p jsonb; e jsonb; tol numeric; k text; got numeric;
begin
  p := jsonb_build_object('projectId', new.project_id, 'customer', new.customer, 'perUnitMode', new.per_unit_mode, 'perUnit', new.per_unit,
         'packageId', new.package_id, 'smartId', new.smart_id, 'kitchenId', new.kitchen_id, 'kitchenScope', new.kitchen_scope,
         'kitchenAddons', new.kitchen_addons, 'acId', new.ac_id, 'acAddons', new.ac_addons, 'flooring', new.flooring,
         'layoutIds', to_jsonb(coalesce(new.layout_ids, '{}'::text[])), 'fitout', new.fitout, 'opsId', new.ops_id,
         'unitNumbers', (select coalesce(jsonb_agg(ou.unit_number order by ou.sort), '[]'::jsonb) from public.order_units ou where ou.order_id = new.id));
  e := private.deal_prices(p);
  if e is null or (e->>'units')::int = 0 then return null; end if;
  if abs(coalesce(new.unit_price, 0) - round((e->>'unitPrice')::numeric)) > 1 then
    raise exception 'PRICE_MISMATCH:unit price % expected %', new.unit_price, round((e->>'unitPrice')::numeric) using errcode = 'check_violation';
  end if;
  if jsonb_array_length(e->'stray') > 0 then
    raise exception 'PRICE_MISMATCH:% not offered on this project', e->'stray'->>0 using errcode = 'check_violation';
  end if;
  tol := 3 * (e->>'units')::int;
  foreach k in array array['furnishCost', 'kitchenCost', 'acCost', 'flooringCost', 'layoutCost', 'fitoutCost'] loop
    got := case k when 'furnishCost' then new.furnish_cost when 'kitchenCost' then new.kitchen_cost when 'acCost' then new.ac_cost
                  when 'flooringCost' then new.flooring_cost when 'layoutCost' then new.layout_cost else new.fitout_cost end;
    if abs(coalesce(got, 0) - (e->>k)::numeric) > tol then
      raise exception 'PRICE_MISMATCH:% % expected %', k, got, e->>k using errcode = 'check_violation';
    end if;
  end loop;
  return null;
end $$;
-- (switched on in 021, after the parity test against the wizard)

-- B13
create or replace function public.update_order_customer(p_order text, p jsonb)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders; c jsonb; changed text[]; v_prev_email text;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'order not found' using errcode = 'no_data_found'; end if;
  if not coalesce(private.can_act_on_order(o.developer_id) and (o.rep_id = auth.uid() or private.dev_has('team') or private.revnu_has('orders')), false) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  if o.status not in ('active','issued') or exists (select 1 from public.signatures where order_id = o.id) then
    raise exception 'BUYER_LOCKED' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'NAME_REQUIRED' using errcode = 'check_violation'; end if;
  v_prev_email := o.customer_email;
  c := private.clean_customer(coalesce(o.customer, '{}'::jsonb) || p);
  select coalesce(array_agg(k order by k), '{}') into changed
  from jsonb_object_keys(c) k where (c->k) is distinct from (coalesce(o.customer, '{}'::jsonb)->k);
  if array_length(changed, 1) is null then return o; end if;
  update public.orders set customer = c, customer_name = c->>'fullName', customer_national_id = c->>'nationalId',
         customer_email = nullif(trim(coalesce(c->>'email', '')), '')
  where id = o.id returning * into o;
  if o.status = 'issued' then
    update public.orders set contract_hash = private.deal_fingerprint(o.id) where id = o.id returning * into o;
  end if;
  perform private.log_activity(o.id, 'customer_edit', jsonb_build_object('fields', to_jsonb(changed), 'reissued', o.status = 'issued'));
  -- B13: a new or corrected e-mail on an issued agreement gets the "ready to sign" e-mail (the first had no address
  -- or went to the wrong one); the browser dispatches the outbox right after the edit.
  if o.status = 'issued' and o.customer_email is not null and lower(o.customer_email::text) is distinct from lower(coalesce(v_prev_email, '')) then
    perform private.queue_notification(o, 'issued');
  end if;
  return o;
end $$;

revoke all on function private.jflag(jsonb), private.jnum(jsonb), private.vat(float8), private.boq_total(jsonb),
  private.kitchen_net(public.kitchens, text, text, jsonb), private.ac_net(public.ac_systems, text, text, jsonb),
  private.flooring_net(text, text, jsonb), private.layout_net(public.projects, text, jsonb), private.deal_prices(jsonb)
  from public, anon, authenticated;

commit;
