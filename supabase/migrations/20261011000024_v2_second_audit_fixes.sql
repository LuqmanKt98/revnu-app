-- =====================================================================
--  Revnu v2 — fixes from the second independent audit of 11 Oct 2026. Additive.
--   S-A  the caller's IP comes from the edge, never from the caller's own headers
--        (rate limits per IP and the IP on signatures / submissions)
--   S-B  flipping "beneficiary" on an issued order re-prices its units from the inventory
--        (and the rental projection that follows the unit price); the buyer re-reads
--   S-C  "read every page": a page list is exactly p1…pN; reads count per pagination
--        (language + page count), so duplicates, mixed devices and late pagination cannot
--        shorten or block what the buyer must read
--   S-D  unknown codes are counted and capped on every public function (status, read, sign,
--        lead start, submit), not only on the two views
--   S-E  signature / stamp images: this project's media bucket or /brand/ only, no "..", no "%"
--   S-F  only the order's rep, a manager (team) or Revnu staff can (re)issue its signing link
--   B-1  the buyer's beneficiary answer is kept with the buyer's details (old phones stored it
--        with the configuration)
--   B-6  create_order checks everything that can refuse an order BEFORE drawing a REV number
--   B-9  a kitchen / cooling / catalogue item the project does not offer → NOT_OFFERED:<item>
--   B-10 layout options are listed in one deterministic order (created_at, id) everywhere
--   B-11 public_link_status reports a suspended developer's link as paused
--   B-12 the order's own item columns must name what was priced for its first unit
--   B-13 operator fee and monthly net are priced by the server like every other line
--   B-14 customisation deadlines close at the end of the day in Riyadh (the database clock is UTC)
--   +    the buyer signs the version on screen (AGREEMENT_CHANGED if it was re-issued since)
--   +    removing the buyer's e-mail supersedes the "ready to sign" e-mail still queued
--   +    routing only reaches people who can still take inquiries
--   +    an outbox row is claimed ("sending") before it is sent, so two dispatchers never send it twice
--   +    a write that changes nothing does not mark the developer as updated
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- S-A: the caller's IP. Supabase sits behind Cloudflare: cf-connecting-ip is set by the edge (a request
-- that carries its own is refused with 403), and the gateway APPENDS the connecting address to
-- x-forwarded-for — so only that header's LAST entry is the gateway's. Everything else a caller can send
-- (the first x-forwarded-for entries, true-client-ip, x-client-ip, forwarded) is ignored.
-- ---------------------------------------------------------------------
create or replace function private.clean_ip(v text)
returns text language plpgsql immutable as $$
begin
  if v is null or btrim(v) = '' then return null; end if;
  return host(btrim(v)::inet);
exception when others then
  return null;
end $$;

create or replace function private.request_ip()
returns text language sql stable as $$
  select coalesce(private.clean_ip(private.request_header('cf-connecting-ip')),
                  private.clean_ip(regexp_replace(coalesce(private.request_header('x-forwarded-for'), ''), '^.*,', '')));
$$;

-- ---------------------------------------------------------------------
-- B-13: D.opsEconomics(ops, unit, unit.price).annualNet in SQL — the same JavaScript arithmetic as the
-- wizard (double precision; Math.round = floor(x + 0.5)).
-- ---------------------------------------------------------------------
create or replace function private.ops_annual_net(o public.ops_models, p_type text, p_price float8)
returns float8 language plpgsql immutable as $$
declare daily boolean := o.kind = 'daily'; periods float8; fee float8 := coalesce(o.mgmt_fee, 0)::float8; rate float8; occ float8; a jsonb;
begin
  if o.id is null then return 0; end if;
  periods := case when daily then 365 else 12 end;
  rate := case when jsonb_typeof(o.default_rate) = 'object' and private.jflag(o.default_rate->p_type) then private.jnum(o.default_rate->p_type) else 0 end;
  a := case when jsonb_typeof(o.assume) = 'object' and jsonb_typeof(o.assume->p_type) = 'object' then o.assume->p_type else null end;
  occ := case when a is not null and a ? 'occ' and jsonb_typeof(a->'occ') <> 'null' then private.jnum(a->'occ')
              else floor((coalesce(o.occ_low, 0) + coalesce(o.occ_high, 0))::float8 / 2 + 0.5) end;
  if coalesce(o.target_roi, 0) <> 0 and coalesce(p_price, 0) <> 0 and occ <> 0 and fee < 100 then
    rate := (o.target_roi::float8 / 100) * p_price / (periods * (occ / 100) * (1 - fee / 100));
    rate := case when daily then floor(rate + 0.5) else floor(rate / 10 + 0.5) * 10 end;
  end if;
  return rate * periods * (occ / 100) * (1 - fee / 100);
end $$;

-- ---------------------------------------------------------------------
-- The prices of a deal (020/023) plus: the operating projection (B-13), the item columns the wizard writes
-- for this deal (B-12: package, smart home and operating model of the first unit; kitchen and cooling of the
-- first unit in per-unit mode, else of the first unit that prices them), and catalogue ids the project does
-- not have (B-9).
-- ---------------------------------------------------------------------
create or replace function private.deal_prices(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare proj public.projects; f jsonb; base jsonb; cfg jsonb; skip jsonb; u record; n int := 0; ben boolean; per boolean;
  pk public.packages; sm public.smart_home; kt public.kitchens; ac public.ac_systems; op public.ops_models;
  price float8; pkg_price float8; smart_price float8; k_net float8; a_net float8; fl_net float8; lay_net float8; fo_net float8;
  t_unit float8 := 0; t_furnish float8 := 0; t_k float8 := 0; t_a float8 := 0; t_fl float8 := 0; t_lay float8 := 0; t_fo float8 := 0; t_annual float8 := 0;
  stray text[] := '{}'; unknown text[] := '{}'; cols jsonb := '{}'::jsonb; v_fee numeric := 0;
begin
  select * into proj from public.projects where id = p->>'projectId';
  if proj.id is null then return null; end if;
  f := coalesce(proj.features, '{}'::jsonb);
  ben := private.jflag(p->'customer'->'beneficiary');
  per := private.jflag(p->'perUnitMode');
  base := jsonb_build_object('packageId', p->'packageId', 'smartId', p->'smartId', 'kitchenId', p->'kitchenId', 'kitchenScope', p->'kitchenScope',
            'kitchenAddons', p->'kitchenAddons', 'acId', p->'acId', 'acAddons', p->'acAddons', 'flooring', p->'flooring',
            'layoutIds', p->'layoutIds', 'fitout', p->'fitout', 'opsId', p->'opsId');
  for u in select x.num, x.ord, un.type_id, un.price_adj, un.price_ben, t.base_price
           from jsonb_array_elements_text(case when jsonb_typeof(p->'unitNumbers') = 'array' then p->'unitNumbers' else '[]'::jsonb end) with ordinality as x(num, ord)
           join public.units un on un.number = x.num and un.project_id = proj.id
           left join public.unit_types t on t.id = un.type_id
           order by x.ord loop
    n := n + 1;
    price := case when ben and u.price_ben is not null then u.price_ben else coalesce(u.base_price, 0) + coalesce(u.price_adj, 0) end;
    t_unit := t_unit + price;
    cfg := case when per and jsonb_typeof(p->'perUnit'->u.num) = 'object' then p->'perUnit'->u.num else base end;
    skip := case when jsonb_typeof(cfg->'skip') = 'object' then cfg->'skip' else '{}'::jsonb end;
    pk := null; sm := null; kt := null; ac := null; op := null;
    if not private.jflag(skip->'furnishing') and private.jflag(cfg->'packageId') then
      select * into pk from public.packages where id = cfg->>'packageId' and project_id = proj.id;
      if pk.id is null then unknown := array_append(unknown, 'package'); end if;
    end if;
    if not private.jflag(skip->'smartHome') and private.jflag(cfg->'smartId') then
      select * into sm from public.smart_home where id = cfg->>'smartId' and project_id = proj.id;
      if sm.id is null then unknown := array_append(unknown, 'smart'); end if;
    end if;
    if not private.jflag(skip->'kitchens') and private.jflag(cfg->'kitchenId') then
      if not private.jflag(f->'kitchens') then stray := array_append(stray, 'kitchen'); else
        select * into kt from public.kitchens where id = cfg->>'kitchenId' and project_id = proj.id;
        if kt.id is null then unknown := array_append(unknown, 'kitchen'); end if;
      end if;
    end if;
    if not private.jflag(skip->'cooling') and private.jflag(cfg->'acId') then
      if not private.jflag(f->'cooling') then stray := array_append(stray, 'cooling'); else
        select * into ac from public.ac_systems where id = cfg->>'acId' and project_id = proj.id;
        if ac.id is null then unknown := array_append(unknown, 'cooling'); end if;
      end if;
    end if;
    -- D.computeDeal: ops = (!features.operations || skip.operations) ? null : the project's model
    if private.jflag(f->'operations') and not private.jflag(skip->'operations') and private.jflag(cfg->'opsId') then
      select * into op from public.ops_models where id = cfg->>'opsId' and project_id = proj.id;
      if op.id is null then unknown := array_append(unknown, 'operations'); end if;
    end if;
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
    t_annual := t_annual + case when op.id is not null then private.ops_annual_net(op, u.type_id, price) else 0 end;
    -- buildOrderPayloadMulti: package / smart / operations (and the operator fee) follow the first unit; kitchen and
    -- cooling follow the first unit in per-unit mode, else the first unit that prices them
    if n = 1 then
      cols := jsonb_build_object('packageId', pk.id, 'smartId', sm.id, 'opsId', op.id,
                                 'kitchenId', case when k_net > 0 then kt.id end, 'acId', case when a_net > 0 then ac.id end);
      v_fee := case when op.id is not null then coalesce(op.mgmt_fee, 0) else 0 end;
    elsif not per then
      if cols->>'kitchenId' is null and k_net > 0 then cols := cols || jsonb_build_object('kitchenId', kt.id); end if;
      if cols->>'acId' is null and a_net > 0 then cols := cols || jsonb_build_object('acId', ac.id); end if;
    end if;
  end loop;
  return jsonb_build_object('units', n, 'unitPrice', t_unit, 'furnishCost', t_furnish, 'kitchenCost', t_k, 'acCost', t_a,
           'flooringCost', t_fl, 'layoutCost', t_lay, 'fitoutCost', t_fo, 'monthlyNet', floor(t_annual / 12 + 0.5), 'operatorFee', v_fee,
           'columns', cols, 'stray', to_jsonb(stray), 'unknown', to_jsonb(unknown));
end $$;

-- An order row (+ its units in order) priced as the wizard prices it.
create or replace function private.order_deal(o public.orders, p_units text[])
returns jsonb language sql stable security definer set search_path = public as $$
  select private.deal_prices(jsonb_build_object('projectId', o.project_id, 'customer', o.customer, 'perUnitMode', o.per_unit_mode, 'perUnit', o.per_unit,
           'packageId', o.package_id, 'smartId', o.smart_id, 'kitchenId', o.kitchen_id, 'kitchenScope', o.kitchen_scope,
           'kitchenAddons', o.kitchen_addons, 'acId', o.ac_id, 'acAddons', o.ac_addons, 'flooring', o.flooring,
           'layoutIds', to_jsonb(coalesce(o.layout_ids, '{}'::text[])), 'fitout', o.fitout, 'opsId', o.ops_id,
           'unitNumbers', to_jsonb(coalesce(p_units, '{}'::text[]))));
$$;

-- What is wrong with an order's prices, as the error the caller raises (null = nothing). Used before an order
-- draws its reference (create_order_core) and again by the deferred check on every new order.
create or replace function private.order_price_problem(o public.orders, p_units text[])
returns text language plpgsql stable security definer set search_path = public as $$
declare e jsonb; n int; tol numeric; k text; got numeric; got_id text; want text;
begin
  e := private.order_deal(o, p_units);
  n := coalesce((e->>'units')::int, 0);
  if e is null or n = 0 then return null; end if;
  if jsonb_array_length(e->'stray') > 0 then return 'NOT_OFFERED:' || (e->'stray'->>0); end if;
  if jsonb_array_length(e->'unknown') > 0 then return 'NOT_OFFERED:' || (e->'unknown'->>0); end if;
  if abs(coalesce(o.unit_price, 0) - round((e->>'unitPrice')::numeric)) > 1 then
    return format('PRICE_MISMATCH:unit price %s expected %s', o.unit_price, round((e->>'unitPrice')::numeric));
  end if;
  tol := 3 * n;   -- a rep whose browser still runs the previous rounding until it reloads
  foreach k in array array['furnishCost', 'kitchenCost', 'acCost', 'flooringCost', 'layoutCost', 'fitoutCost', 'monthlyNet'] loop
    got := case k when 'furnishCost' then o.furnish_cost when 'kitchenCost' then o.kitchen_cost when 'acCost' then o.ac_cost
                  when 'flooringCost' then o.flooring_cost when 'layoutCost' then o.layout_cost when 'fitoutCost' then o.fitout_cost
                  else o.monthly_net end;
    if abs(coalesce(got, 0) - (e->>k)::numeric) > tol then return format('PRICE_MISMATCH:%s %s expected %s', k, got, e->>k); end if;
  end loop;
  if abs(coalesce(o.operator_fee, 0) - (e->>'operatorFee')::numeric) > 0.01 then
    return format('PRICE_MISMATCH:operatorFee %s expected %s', o.operator_fee, e->>'operatorFee');
  end if;
  foreach k in array array['packageId', 'smartId', 'kitchenId', 'acId', 'opsId'] loop
    got_id := case k when 'packageId' then o.package_id when 'smartId' then o.smart_id when 'kitchenId' then o.kitchen_id
                     when 'acId' then o.ac_id else o.ops_id end;
    want := e->'columns'->>k;
    if got_id is distinct from want then return format('PRICE_MISMATCH:%s %s expected %s', k, coalesce(got_id, 'none'), coalesce(want, 'none')); end if;
  end loop;
  return null;
end $$;

create or replace function private.orders_check_prices() returns trigger
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  v := private.order_price_problem(new, array(select ou.unit_number from public.order_units ou where ou.order_id = new.id order by ou.sort));
  if v is not null then raise exception '%', v using errcode = 'check_violation'; end if;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- B-6: an order is built and checked in full before it draws its REV reference (sequences are not
-- transactional: a refusal after nextval() used up a number). The deferred check stays as the backstop.
-- ---------------------------------------------------------------------
create or replace function private.create_order_core(p jsonb, p_dev text, p_rep uuid, p_source text, p_link text, p_submission uuid)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  proj public.projects;
  v_id text;
  v_units text[];
  v_layout text[];
  v_status text := coalesce(p->>'status', 'active');
  v_seq bigint;
  v_problem text;
  u text; i int := 0;
begin
  if v_status not in ('active','issued') then
    raise exception 'invalid initial status %', v_status using errcode = 'check_violation';
  end if;
  select * into proj from public.projects where id = p->>'projectId' and developer_id = p_dev;
  if proj.id is null then
    raise exception 'project does not belong to your developer' using errcode = 'insufficient_privilege';
  end if;
  if coalesce((p->>'unitPrice')::numeric, 0) < 0 or coalesce((p->>'furnishCost')::numeric, 0) < 0
     or coalesce((p->>'fitoutCost')::numeric, 0) < 0 or coalesce((p->>'monthlyNet')::numeric, 0) < 0
     or coalesce((p->>'operatorFee')::numeric, 0) < 0 or coalesce((p->>'kitchenCost')::numeric, 0) < 0
     or coalesce((p->>'acCost')::numeric, 0) < 0 or coalesce((p->>'flooringCost')::numeric, 0) < 0
     or coalesce((p->>'layoutCost')::numeric, 0) < 0 then
    raise exception 'amounts cannot be negative' using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(x order by ord), '{}') into v_units
  from jsonb_array_elements_text(coalesce(p->'unitNumbers', '[]'::jsonb)) with ordinality as t(x, ord);
  if array_length(v_units, 1) is null or array_length(v_units, 1) = 0 then
    raise exception 'an order needs at least one unit' using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(v_units) n left join public.units un on un.number = n where un.number is null or un.project_id <> proj.id) then
    raise exception 'unit does not belong to this project' using errcode = 'check_violation';
  end if;

  -- Customisation deadlines (the step locks in the wizard; the server is the gate). A deadline is a date in Riyadh:
  -- it closes at the end of that day there (the database clock is UTC).
  select coalesce(array_agg(x), '{}') into v_layout from jsonb_array_elements_text(coalesce(p->'layoutIds', '[]'::jsonb)) t(x);
  if array_length(v_layout, 1) > 0 and proj.layout_deadline is not null and (now() at time zone 'Asia/Riyadh')::date > proj.layout_deadline then
    raise exception 'DEADLINE:layout:%', proj.layout_deadline using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p->'flooring') = 'object' and p->'flooring' <> '{}'::jsonb and proj.flooring_deadline is not null and (now() at time zone 'Asia/Riyadh')::date > proj.flooring_deadline then
    raise exception 'DEADLINE:flooring:%', proj.flooring_deadline using errcode = 'check_violation';
  end if;

  -- B-6: suspension, units already sold (or listed twice) and prices are refused before a reference is drawn.
  if private.dev_suspended(p_dev) then raise exception 'SUSPENDED' using errcode = 'check_violation'; end if;
  select x into u from unnest(v_units) x group by x having count(*) > 1 limit 1;
  if u is not null then raise exception 'UNIT_TAKEN:%', u using errcode = 'unique_violation'; end if;
  foreach u in array v_units loop
    if private.unit_taken(u) then raise exception 'UNIT_TAKEN:%', u using errcode = 'unique_violation'; end if;
  end loop;

  o.developer_id := p_dev; o.project_id := proj.id; o.rep_id := p_rep; o.status := v_status; o.unit_number := v_units[1];
  o.customer_name := p->>'customerName'; o.customer_national_id := p->>'customerId'; o.customer_email := nullif(p->>'customerEmail', '');
  o.customer := coalesce(p->'customer', '{}'::jsonb);
  o.per_unit_mode := coalesce((p->>'perUnitMode')::boolean, false); o.per_unit := p->'perUnit';
  o.package_id := nullif(p->>'packageId', ''); o.design_id := nullif(p->>'designId', ''); o.palette_id := nullif(p->>'paletteId', '');
  o.smart_id := nullif(p->>'smartId', ''); o.ops_id := nullif(p->>'opsId', '');
  o.fitout := coalesce((p->>'fitout')::boolean, false); o.fitout_cost := round(coalesce((p->>'fitoutCost')::numeric, 0));
  o.unit_price := round(coalesce((p->>'unitPrice')::numeric, 0)); o.furnish_cost := round(coalesce((p->>'furnishCost')::numeric, 0));
  o.operator_fee := coalesce((p->>'operatorFee')::numeric, 0); o.monthly_net := round(coalesce((p->>'monthlyNet')::numeric, 0));
  o.kitchen_id := nullif(p->>'kitchenId', ''); o.kitchen_palette_id := nullif(p->>'kitchenPaletteId', ''); o.kitchen_scope := nullif(p->>'kitchenScope', '');
  o.kitchen_addons := case when jsonb_typeof(p->'kitchenAddons') = 'array' then p->'kitchenAddons' else '[]'::jsonb end;
  o.kitchen_cost := round(coalesce((p->>'kitchenCost')::numeric, 0));
  o.ac_id := nullif(p->>'acId', ''); o.ac_addons := case when jsonb_typeof(p->'acAddons') = 'array' then p->'acAddons' else '[]'::jsonb end;
  o.ac_cost := round(coalesce((p->>'acCost')::numeric, 0));
  o.flooring := case when jsonb_typeof(p->'flooring') = 'object' and p->'flooring' <> '{}'::jsonb then p->'flooring' else null end;
  o.flooring_cost := round(coalesce((p->>'flooringCost')::numeric, 0));
  o.layout_ids := v_layout; o.layout_cost := round(coalesce((p->>'layoutCost')::numeric, 0));
  o.agreement := case when jsonb_typeof(p->'agreement') = 'object' then p->'agreement' else null end;
  o.source := p_source; o.sale_link_code := p_link; o.submission_id := p_submission;
  v_problem := private.order_price_problem(o, v_units);
  if v_problem is not null then raise exception '%', v_problem using errcode = 'check_violation'; end if;

  -- The reference must be one issued by reserve_order_id(): REV-26-N with N no higher than the sequence.
  v_id := nullif(p->>'id', '');
  if v_id is not null then
    select last_value into v_seq from public.order_seq;
    if v_id !~ '^REV-26-[0-9]{1,9}$' or substring(v_id from 8)::bigint > v_seq then
      raise exception 'invalid order reference %', v_id using errcode = 'check_violation';
    end if;
  else
    v_id := 'REV-26-' || nextval('public.order_seq')::text;
  end if;
  if exists (select 1 from public.orders where id = v_id) then
    raise exception 'order % already submitted', v_id using errcode = 'unique_violation';
  end if;

  insert into public.orders(id, developer_id, project_id, rep_id, status, unit_number,
      customer_name, customer_national_id, customer_email, customer,
      per_unit_mode, per_unit, package_id, design_id, palette_id, smart_id, ops_id,
      fitout, fitout_cost, unit_price, furnish_cost, operator_fee, monthly_net,
      kitchen_id, kitchen_palette_id, kitchen_scope, kitchen_addons, kitchen_cost,
      ac_id, ac_addons, ac_cost, flooring, flooring_cost, layout_ids, layout_cost,
      agreement, source, sale_link_code, submission_id)
  values (v_id, o.developer_id, o.project_id, o.rep_id, o.status, o.unit_number,
      o.customer_name, o.customer_national_id, o.customer_email, o.customer,
      o.per_unit_mode, o.per_unit, o.package_id, o.design_id, o.palette_id, o.smart_id, o.ops_id,
      o.fitout, o.fitout_cost, o.unit_price, o.furnish_cost, o.operator_fee, o.monthly_net,
      o.kitchen_id, o.kitchen_palette_id, o.kitchen_scope, o.kitchen_addons, o.kitchen_cost,
      o.ac_id, o.ac_addons, o.ac_cost, o.flooring, o.flooring_cost, o.layout_ids, o.layout_cost,
      o.agreement, o.source, o.sale_link_code, o.submission_id)
  returning * into o;

  foreach u in array v_units loop
    i := i + 1;
    begin
      insert into public.order_units(order_id, unit_number, sort, is_live) values (v_id, u, i, true);
    exception when unique_violation then
      raise exception 'UNIT_TAKEN:%', u using errcode = 'unique_violation';
    end;
  end loop;

  perform private.log_activity(v_id, 'created', jsonb_build_object('units', to_jsonb(v_units), 'status', v_status, 'source', p_source));
  if v_status = 'issued' then perform private.queue_notification(o, 'issued'); end if;
  return o;
end $$;

-- ---------------------------------------------------------------------
-- S-B + B13 follow-up: buyer edits before signing.
--   · "beneficiary" is the price basis of the deal: a flip re-prices the units from the inventory (and the
--     rental projection that follows the unit price), exactly as a new order would be priced, and the buyer
--     reads the re-priced agreement again on any open signing link.
--   · a changed or removed e-mail supersedes the "ready to sign" e-mail still queued for the old address.
-- ---------------------------------------------------------------------
create or replace function public.update_order_customer(p_order text, p jsonb)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders; c jsonb; changed text[]; v_prev_email text; e jsonb; v_price bigint; v_net bigint; v_ops boolean; v_repriced jsonb;
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

  if private.jflag(c->'beneficiary') is distinct from private.jflag(o.customer->'beneficiary') then
    o.customer := c;
    e := private.order_deal(o, array(select ou.unit_number from public.order_units ou where ou.order_id = o.id order by ou.sort));
    if e is not null and coalesce((e->>'units')::int, 0) > 0 then
      v_price := round((e->>'unitPrice')::numeric); v_net := round((e->>'monthlyNet')::numeric);
      v_ops := e->'columns'->>'opsId' is not null;   -- the projection is re-priced only when the operating model still prices
      if v_price is distinct from o.unit_price or (v_ops and v_net is distinct from o.monthly_net) then
        v_repriced := jsonb_build_object('unitPrice', jsonb_build_array(o.unit_price, v_price))
                      || case when v_ops then jsonb_build_object('monthlyNet', jsonb_build_array(o.monthly_net, v_net)) else '{}'::jsonb end;
        update public.orders set unit_price = v_price, monthly_net = case when v_ops then v_net else monthly_net end where id = o.id;
        update public.signing_links set read_log = '[]'::jsonb, pages = '{}'::jsonb, sections = '[]'::jsonb
         where order_id = o.id and status in ('live','viewed');
      end if;
    end if;
  end if;

  update public.orders set customer = c, customer_name = c->>'fullName', customer_national_id = c->>'nationalId',
         customer_email = nullif(trim(coalesce(c->>'email', '')), '')
  where id = o.id returning * into o;
  if o.status = 'issued' then
    update public.orders set contract_hash = private.deal_fingerprint(o.id) where id = o.id returning * into o;
  end if;
  perform private.log_activity(o.id, 'customer_edit', jsonb_build_object('fields', to_jsonb(changed), 'reissued', o.status = 'issued')
                                                     || case when v_repriced is not null then jsonb_build_object('repriced', v_repriced) else '{}'::jsonb end);
  if o.status = 'issued' and lower(coalesce(o.customer_email::text, '')) is distinct from lower(coalesce(v_prev_email, '')) then
    update public.notifications set status = 'failed', error = 'superseded: the buyer''s e-mail was corrected'
     where order_id = o.id and kind = 'issued' and status = 'queued';
    if o.customer_email is not null then perform private.queue_notification(o, 'issued'); end if;
  end if;
  return o;
end $$;

-- ---------------------------------------------------------------------
-- S-C: read every page. The phone numbers its sheets p1…pN once pagination has settled; a list is accepted
-- only in exactly that form. Every read records the page count it was made on (n), so reads count only
-- for the pagination they were made on: the same agreement can paginate differently on two devices, and
-- neither a duplicate id nor a list from another device can shorten (or block) what must be read.
-- Signing needs one (language, page count) with N >= agreement_min_pages() and p1…pN all read in it.
-- Reads stored before this change (no n) count for any page count, as reads without a language count for both.
-- ---------------------------------------------------------------------
create or replace function private.read_complete(g public.signing_links, p_min int)
returns boolean language sql stable as $$
  with r as (
    select e->>'id' as id, coalesce(nullif(e->>'lang', ''), 'xx') as lang,
           case when jsonb_typeof(e->'n') = 'number' then (e->>'n')::int end as n
    from jsonb_array_elements(case when jsonb_typeof(g.read_log) = 'array' then g.read_log else '[]'::jsonb end) e
    where jsonb_typeof(e) = 'object'
  ), cand as (
    select distinct lang, n from r where n between 1 and 200
    union
    select pg.lang, jsonb_array_length(pg.ids)
    from jsonb_each(case when jsonb_typeof(g.pages) = 'object' then g.pages else '{}'::jsonb end) as pg(lang, ids)
    where jsonb_typeof(pg.ids) = 'array' and jsonb_array_length(pg.ids) between 1 and 200
  )
  select exists (
    select 1 from cand c
    where c.n >= p_min
      and not exists (
        select 1 from generate_series(1, c.n) as s(i)
        where not exists (select 1 from r
                          where r.id = 'p' || s.i
                            and (r.lang = c.lang or r.lang = 'xx' or c.lang = 'xx')
                            and (r.n is null or r.n = c.n))));
$$;

create or replace function public.public_signing_read(p_code text, p_section text, p_sections jsonb default null, p_lang text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.signing_links; v_lang text := case when p_lang in ('ar', 'en') then p_lang else 'xx' end; v_n int; ok boolean;
begin
  if private.over_limit('miss', 60) then return jsonb_build_object('status', 'not_found'); end if;   -- S-D
  select * into g from public.signing_links where code = private.parse_code(p_code) for update;
  if g.code is null then perform private.hit('miss'); return jsonb_build_object('status', 'not_found'); end if;
  if g.status not in ('live','viewed') then return jsonb_build_object('sections', g.sections, 'read_log', g.read_log, 'pages', g.pages); end if;
  v_n := case when jsonb_typeof(p_sections) = 'array' then jsonb_array_length(p_sections) else 0 end;
  ok := v_n between 1 and 200
        and p_sections = (select jsonb_agg('p' || s.i order by s.i) from generate_series(1, v_n) as s(i));
  if not ok then v_n := null; end if;
  update public.signing_links set
    sections = case when ok then p_sections else sections end,
    pages = case when ok then jsonb_set(case when jsonb_typeof(pages) = 'object' then pages else '{}'::jsonb end, array[v_lang], p_sections) else pages end,
    read_log = case when ok and nullif(p_section, '') is not null and p_section ~ '^p[1-9][0-9]{0,2}$'
                     and substring(p_section from 2)::int <= v_n
                     and not exists (select 1 from jsonb_array_elements(read_log) e
                                     where e->>'id' = p_section and coalesce(e->>'lang', v_lang) = v_lang
                                       and (case when jsonb_typeof(e->'n') = 'number' then (e->>'n')::int end) is not distinct from v_n)
                    then read_log || jsonb_build_array(jsonb_build_object('id', p_section, 'lang', v_lang, 'n', v_n, 'at', now()))
                    else read_log end
  where code = g.code returning * into g;
  return jsonb_build_object('sections', g.sections, 'read_log', g.read_log, 'pages', g.pages);
end $$;

-- S-C + S-D + AGREEMENT_CHANGED: the phone sends the fingerprint of the agreement it shows; a version re-issued
-- since (buyer edit, re-price) is refused and the phone reloads it.
create or replace function public.public_signing_sign(p_code text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.signing_links; o public.orders; sig public.signatures; h text; nm text;
begin
  perform private.throttle('sign', 10);
  if private.over_limit('miss', 60) then return jsonb_build_object('status', 'not_found'); end if;
  select * into g from public.signing_links where code = private.parse_code(p_code) for update;
  if g.code is null then perform private.hit('miss'); return jsonb_build_object('status', 'not_found'); end if;
  if g.status in ('live','viewed') and g.valid_until < now() then
    update public.signing_links set status = 'expired' where code = g.code;
    raise exception 'LINK_CLOSED:expired' using errcode = 'check_violation';
  end if;
  if g.status not in ('live','viewed') then raise exception 'LINK_CLOSED:%', g.status using errcode = 'check_violation'; end if;
  select * into o from public.orders where id = g.order_id for update;
  if o.id is null or o.status <> 'issued' or exists (select 1 from public.signatures where order_id = o.id) then
    raise exception 'NOT_OPEN_FOR_SIGNING' using errcode = 'check_violation';
  end if;
  if nullif(p->>'hash', '') is not null and o.contract_hash is not null and p->>'hash' <> o.contract_hash then
    raise exception 'AGREEMENT_CHANGED' using errcode = 'check_violation';
  end if;
  if coalesce((private.remote_settings(o.project_id)->>'requireReadAll')::boolean, true) then
    if not private.read_complete(g, private.agreement_min_pages(o.id)) then raise exception 'READ_ALL' using errcode = 'check_violation'; end if;
  end if;
  if coalesce((p->>'consent')::boolean, false) is not true then raise exception 'CONSENT_REQUIRED' using errcode = 'check_violation'; end if;
  if coalesce(p->>'signatureData', '') = '' and length(trim(coalesce(p->>'typedName', ''))) < 2 then raise exception 'SIGNATURE_REQUIRED' using errcode = 'check_violation'; end if;
  if coalesce(p->>'signatureData', '') <> '' and ((p->>'signatureData') !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or length(p->>'signatureData') > 600000) then
    raise exception 'SIGNATURE_REQUIRED' using errcode = 'check_violation';
  end if;

  h := private.deal_fingerprint(o.id);
  nm := coalesce(nullif(o.customer->>'fullName', ''), o.customer_name, '');
  insert into public.signatures(order_id, signing_code, signer_name, signer_id_last4, signature_data, typed_name, document_hash, ip, user_agent, consent_at, terms_version, read_sections)
  values (o.id, g.code, nm, right(coalesce(o.customer_national_id, o.customer->>'nationalId', ''), 4),
          nullif(p->>'signatureData', ''), nullif(left(trim(coalesce(p->>'typedName', '')), 120), ''), h,
          private.request_ip(), left(private.request_header('user-agent'), 300), now(), left(p->>'termsVersion', 40), g.read_log)
  returning * into sig;
  update public.orders set status = 'signed', signed_at = coalesce(signed_at, current_date), contract_hash = h where id = o.id returning * into o;
  update public.signing_links set status = 'signed' where code = g.code;
  insert into public.order_activity(order_id, event, by_user_id, by_name, extra)
  values (o.id, 'status', null, nm, jsonb_build_object('from', 'issued', 'to', 'signed')),
         (o.id, 'signed', null, nm, jsonb_build_object('via', 'phone', 'code', g.code, 'hash', h, 'ip', sig.ip));
  perform private.queue_notification(o, 'signed');
  perform private.inbox(o.rep_id, 'signed', nm || ' signed ' || o.id,
    case when coalesce(array_length((select array_agg(ou.unit_number) from public.order_units ou where ou.order_id = o.id), 1), 1) > 1
         then 'Units ' || (select string_agg(ou.unit_number, ', ' order by ou.sort) from public.order_units ou where ou.order_id = o.id)
         else 'Unit ' || coalesce(o.unit_number, '') end || ' · fingerprint ' || left(h, 12) || '…', '/sales');
  return jsonb_build_object('signature', to_jsonb(sig) - 'signature_data', 'orderId', o.id, 'status', o.status);
end $$;

-- ---------------------------------------------------------------------
-- S-D + B-11: the buyer page's poll counts unknown codes and reports a suspended developer's link as paused.
-- ---------------------------------------------------------------------
create or replace function public.public_link_status(p_code text, p_submission uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.sale_links; s public.submissions;
begin
  if private.over_limit('miss', 60) then return jsonb_build_object('status', 'not_found'); end if;
  select * into l from public.sale_links where code = private.parse_code(p_code);
  if l.code is null then perform private.hit('miss'); return jsonb_build_object('status', 'not_found'); end if;
  perform private.expire_sale_link(l.code);
  select * into l from public.sale_links where code = l.code;
  if l.status = 'live' and private.dev_suspended(l.developer_id) then l.status := 'paused'; end if;
  if p_submission is not null then select * into s from public.submissions where id = p_submission and link_code = l.code;
  elsif l.mode <> 'type' then select * into s from public.submissions where link_code = l.code order by created_at desc limit 1; end if;
  return jsonb_build_object('status', l.status, 'validUntil', l.valid_until,
    'submission', case when s.id is null then null else jsonb_build_object('id', s.id, 'link_code', s.link_code, 'mode', s.mode, 'project_id', s.project_id,
       'developer_id', s.developer_id, 'unit_numbers', s.unit_numbers, 'type_id', s.type_id, 'rep_id', s.rep_id, 'status', s.status, 'order_id', s.order_id,
       'decline_reason', s.decline_reason, 'created_at', s.created_at,
       'signing', (select jsonb_build_object('code', g.code, 'slug', g.slug, 'status', g.status, 'order_id', g.order_id, 'valid_until', g.valid_until)
                   from public.signing_links g where g.order_id = s.order_id and g.status in ('live','viewed','signed') order by g.created_at desc limit 1)) end,
    'rep', case when s.id is not null then private.public_rep(s.rep_id) else null end);
end $$;

-- S-D
create or replace function public.public_lead_start(p_code text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.sale_links; ld public.sale_leads; nm text; mob text; v_cc text; rep uuid;
begin
  perform private.throttle('lead', 20);
  if private.over_limit('miss', 60) then return jsonb_build_object('status', 'not_found'); end if;
  select * into l from public.sale_links where code = private.parse_code(p_code);
  if l.code is null then perform private.hit('miss'); return jsonb_build_object('status', 'not_found'); end if;
  perform private.expire_sale_link(l.code);
  select * into l from public.sale_links where code = l.code;
  if l.status <> 'live' then raise exception 'LINK_CLOSED:%', l.status using errcode = 'check_violation'; end if;
  if private.dev_suspended(l.developer_id) then raise exception 'LINK_CLOSED:paused' using errcode = 'check_violation'; end if;
  nm := left(trim(coalesce(p->>'fullName', '')), 120);
  if length(nm) < 2 then raise exception 'NAME_REQUIRED' using errcode = 'check_violation'; end if;
  v_cc := coalesce(nullif(p->>'mobileCode', ''), '+966');
  mob := regexp_replace(coalesce(p->>'mobile', ''), '[^0-9+]', '', 'g');
  if mob = '' or not private.valid_mobile(v_cc, mob) then raise exception 'INVALID_MOBILE' using errcode = 'check_violation'; end if;
  if v_cc = '+966' then mob := regexp_replace(mob, '^(\+?966|0)', ''); end if;
  select * into ld from public.sale_leads where link_code = l.code and customer->>'mobile' = mob and status = 'started' order by created_at desc limit 1;
  if ld.id is not null then
    update public.sale_leads set customer = customer || jsonb_build_object('fullName', nm) where id = ld.id returning * into ld;
  else
    rep := case when l.mode = 'type' then private.pick_rep(l.code) else l.rep_id end;
    insert into public.sale_leads(link_code, developer_id, project_id, rep_id, customer, type_id)
    values (l.code, l.developer_id, l.project_id, rep, jsonb_build_object('fullName', nm, 'mobileCode', v_cc, 'mobile', mob), nullif(p->>'typeId', ''))
    returning * into ld;
    perform private.inbox(rep, 'lead', nm || ' started the journey', 'Public link ' || l.code || ' · call to help them choose', '/sales');
  end if;
  return jsonb_build_object('lead', to_jsonb(ld), 'rep', private.public_rep(ld.rep_id));
end $$;

-- S-D + B-1
create or replace function public.public_link_submit(p_code text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.sale_links; s public.submissions; ld public.sale_leads; chosen text[]; tid text; rep uuid; c jsonb; n text; what text;
begin
  perform private.throttle('submit', 10);
  if private.over_limit('miss', 60) then return jsonb_build_object('status', 'not_found'); end if;
  select * into l from public.sale_links where code = private.parse_code(p_code) for update;
  if l.code is null then perform private.hit('miss'); return jsonb_build_object('status', 'not_found'); end if;
  if l.status = 'live' and l.valid_until < now() then
    update public.sale_links set status = 'expired' where code = l.code returning * into l;
  end if;
  if l.status <> 'live' then raise exception 'LINK_CLOSED:%', l.status using errcode = 'check_violation'; end if;
  if private.dev_suspended(l.developer_id) then raise exception 'LINK_CLOSED:paused' using errcode = 'check_violation'; end if;
  if coalesce((p->>'consent')::boolean, false) is not true then raise exception 'CONSENT_REQUIRED' using errcode = 'check_violation'; end if;
  if length(coalesce(p->>'selections', '')) > 60000 or length(coalesce(p->>'perUnit', '')) > 120000 then raise exception 'payload too large' using errcode = 'check_violation'; end if;

  if l.mode = 'type' then
    tid := p->>'typeId';
    if tid is null or not (tid = any(coalesce(l.type_ids, '{}'))) then raise exception 'PICK_TYPE' using errcode = 'check_violation'; end if;
    chosen := '{}';
  elsif l.mode = 'shortlist' then
    select coalesce(array_agg(distinct x), '{}') into chosen from jsonb_array_elements_text(coalesce(p->'unitNumbers', '[]'::jsonb)) t(x);
    if array_length(chosen, 1) is null or not (chosen <@ l.unit_numbers) then raise exception 'PICK_UNITS' using errcode = 'check_violation'; end if;
  else
    chosen := l.unit_numbers;
  end if;
  foreach n in array chosen loop
    if private.unit_taken(n) then raise exception 'UNIT_TAKEN:%', n using errcode = 'unique_violation'; end if;
  end loop;
  c := private.clean_customer(p->'customer');
  -- B-1: "beneficiary" belongs to the buyer's details; phones loaded before this fix kept the answer with the
  -- configuration (the shared selections, or one unit's choices in per-unit mode).
  if not (c ? 'beneficiary') and (private.jflag(p->'selections'->'beneficiary')
       or exists (select 1 from jsonb_each(case when jsonb_typeof(p->'perUnit') = 'object' then p->'perUnit' else '{}'::jsonb end) as e(k, v)
                  where jsonb_typeof(e.v) = 'object' and private.jflag(e.v->'beneficiary'))) then
    c := c || jsonb_build_object('beneficiary', true);
  end if;

  if nullif(p->>'leadId', '') is not null then
    select * into ld from public.sale_leads where id = (p->>'leadId')::uuid and link_code = l.code;
  end if;
  rep := case when l.mode = 'type' then coalesce(ld.rep_id, private.pick_rep(l.code)) else l.rep_id end;

  insert into public.submissions(link_code, mode, developer_id, project_id, unit_numbers, type_id, per_mode, per_unit, rep_id,
      customer, selections, lead_id, terms_version, ip, user_agent, needs_unit)
  values (l.code, l.mode, l.developer_id, l.project_id, chosen, tid,
      coalesce((p->>'perMode')::boolean, false) and array_length(chosen, 1) > 1,
      case when coalesce((p->>'perMode')::boolean, false) and array_length(chosen, 1) > 1 and jsonb_typeof(p->'perUnit') = 'object'
           then private.apply_locks_per_unit(p->'perUnit', l.selections, l.per_unit, l.locks) else null end,
      rep, c, private.apply_locks(case when jsonb_typeof(p->'selections') = 'object' then p->'selections' else '{}'::jsonb end, l.selections, l.locks), ld.id,
      left(p->>'termsVersion', 40), private.request_ip(), left(private.request_header('user-agent'), 300), l.mode = 'type')
  returning * into s;
  update public.sale_links set submission_count = submission_count + 1, status = case when mode = 'type' then status else 'submitted' end where code = l.code;
  if ld.id is not null then
    update public.sale_leads set status = 'submitted', submission_id = s.id, type_id = coalesce(tid, type_id) where id = ld.id;
  end if;
  what := case when l.mode = 'type' then 'an inquiry · ' || coalesce((select t.name from public.unit_types t where t.id = tid), tid) else array_to_string(chosen, ', ') end;
  perform private.inbox(rep, case when l.mode = 'type' then 'inquiry' else 'submission' end, (c->>'fullName') || ' submitted ' || what,
    case when l.mode = 'type' then 'Call, then assign a unit · public link ' else 'Awaiting your confirmation · via link ' end || l.code, '/sales');
  return jsonb_build_object('submission', jsonb_build_object('id', s.id, 'link_code', s.link_code, 'mode', s.mode, 'project_id', s.project_id,
      'developer_id', s.developer_id, 'unit_numbers', s.unit_numbers, 'type_id', s.type_id, 'rep_id', s.rep_id, 'status', s.status, 'created_at', s.created_at),
    'rep', private.public_rep(rep));
end $$;

-- ---------------------------------------------------------------------
-- Routing reaches only people who can still take inquiries: active members of the link's developer with
-- the orders permission and a commission level (checked again at every routing, not only when the link was made).
-- ---------------------------------------------------------------------
create or replace function private.pick_rep(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare l public.sale_links; pool uuid[]; idx int; v_fallback uuid;
begin
  select * into l from public.sale_links where code = p_code for update;
  if l.code is null then return null; end if;
  select coalesce(array_agg(pr.id order by r.ord), '{}') into pool
  from jsonb_array_elements_text(coalesce(l.routing->'repIds', '[]'::jsonb)) with ordinality as r(id, ord)
  join public.profiles pr on pr.id::text = r.id and pr.deleted_at is null and pr.developer_id = l.developer_id
   and pr.commission_level_id is not null and private.profile_has(pr.id, 'orders');
  v_fallback := case when l.created_by is not null and private.profile_has(l.created_by, 'orders') then l.created_by else l.rep_id end;
  if array_length(pool, 1) is null then return v_fallback; end if;
  if coalesce(l.routing->>'kind', 'single') <> 'round_robin' then return pool[1]; end if;
  idx := coalesce((l.routing->>'pointer')::int, 0) % array_length(pool, 1);
  update public.sale_links set routing = jsonb_set(routing, '{pointer}', to_jsonb((idx + 1) % array_length(pool, 1))) where code = l.code;
  return pool[idx + 1];
end $$;

-- ---------------------------------------------------------------------
-- S-F: (re)issuing a signing link revokes the open one — only the order's rep, a manager (team) or Revnu staff.
-- ---------------------------------------------------------------------
create or replace function public.signing_link_create(p_order text, p_via text default 'qr')
returns public.signing_links language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'order not found' using errcode = 'no_data_found'; end if;
  if not coalesce(private.can_act_on_order(o.developer_id) and (o.rep_id = auth.uid() or private.dev_has('team') or private.revnu_has('orders')), false) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  if o.status <> 'issued' or exists (select 1 from public.signatures where order_id = o.id) then
    raise exception 'NOT_OPEN_FOR_SIGNING' using errcode = 'check_violation';
  end if;
  return private.new_signing_link(o.id, p_via);
end $$;

-- ---------------------------------------------------------------------
-- S-E: signature / stamp images — a PNG/JPEG/WebP data URL, a file under /brand/, or this project's public
-- media bucket. No parent segments and no percent-encoding anywhere.
-- ---------------------------------------------------------------------
create or replace function private.safe_signatory_src(v text)
returns boolean language sql immutable as $$
  select v is not null and v !~ '(\.\.|%|\\)'
     and (v ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'
          or v ~ '^/brand/[A-Za-z0-9_-][A-Za-z0-9._/-]*$'
          or v ~ '^https://ysrfvaczezejqtzkyicr\.supabase\.co/storage/v1/object/public/media/[A-Za-z0-9_-][A-Za-z0-9._/-]*$');
$$;

alter table public.developers drop constraint if exists developers_signature_src_chk;
alter table public.developers add constraint developers_signature_src_chk check (signature is null or private.safe_signatory_src(signature));
alter table public.developers drop constraint if exists developers_stamp_src_chk;
alter table public.developers add constraint developers_stamp_src_chk check (stamp is null or private.safe_signatory_src(stamp));

create or replace function public.set_signatory(p_dev text, p jsonb)
returns public.developers language plpgsql security definer set search_path = public as $$
declare d public.developers; k text;
begin
  if not coalesce(private.revnu_has('developers') or (p_dev = private.my_dev() and private.dev_has('contracts')), false) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  foreach k in array array['signature','stamp'] loop
    if p ? k and coalesce(p->>k, '') <> '' then
      if not private.safe_signatory_src(p->>k) then raise exception 'SIGNATORY_IMAGE' using errcode = 'check_violation'; end if;
      if length(p->>k) > 900000 then raise exception 'FILE_TOO_LARGE:600 KB' using errcode = 'check_violation'; end if;
    end if;
  end loop;
  update public.developers set
    authorized_signer          = case when p ? 'authorizedSigner'        then nullif(trim(p->>'authorizedSigner'), '')        else authorized_signer end,
    authorized_signer_ar       = case when p ? 'authorizedSignerAr'      then nullif(trim(p->>'authorizedSignerAr'), '')      else authorized_signer_ar end,
    authorized_signer_title    = case when p ? 'authorizedSignerTitle'   then nullif(trim(p->>'authorizedSignerTitle'), '')   else authorized_signer_title end,
    authorized_signer_title_ar = case when p ? 'authorizedSignerTitleAr' then nullif(trim(p->>'authorizedSignerTitleAr'), '') else authorized_signer_title_ar end,
    signature = case when p ? 'signature' then nullif(p->>'signature', '') else signature end,
    stamp     = case when p ? 'stamp'     then nullif(p->>'stamp', '')     else stamp end,
    signatory_updated_at = now(), signatory_updated_by = auth.uid(), signatory_updated_by_name = private.caller_name()
  where id = p_dev returning * into d;
  if d.id is null then raise exception 'developer not found' using errcode = 'no_data_found'; end if;
  return d;
end $$;

-- ---------------------------------------------------------------------
-- B-10: one deterministic order for catalogue rows (the wizard's "first option per layout area" depends on it).
-- ---------------------------------------------------------------------
create or replace function private.public_catalogue(p_project text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'designStyles',     (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at, x.id), '[]') from public.design_styles x where x.project_id = p_project),
    'packages',         (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at, x.id), '[]') from public.packages x where x.project_id = p_project),
    'smartHome',        (select coalesce(jsonb_agg(to_jsonb(x) order by x.level, x.id), '[]') from public.smart_home x where x.project_id = p_project),
    'opsModels',        (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at, x.id), '[]') from public.ops_models x where x.project_id = p_project),
    'kitchens',         (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at, x.id), '[]') from public.kitchens x where x.project_id = p_project),
    'acSystems',        (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at, x.id), '[]') from public.ac_systems x where x.project_id = p_project),
    'coolingPoints',    (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at, x.id), '[]') from public.cooling_points x where x.project_id = p_project),
    'flooringFinishes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at, x.id), '[]') from public.flooring_finishes x where x.project_id = p_project),
    'flooringZones',    (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at, x.id), '[]') from public.flooring_zones x where x.project_id = p_project),
    'layoutOptions',    (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at, x.id), '[]') from public.layout_options x where x.project_id = p_project),
    'paymentPlans',     (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.payment_plans x where x.project_id = p_project),
    'constructionMilestones', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort), '[]') from public.construction_milestones x where x.project_id = p_project),
    'contractTemplates', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at, x.id), '[]') from public.contract_templates x where x.project_id = p_project),
    'contractVars',     (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort), '[]') from public.contract_vars x),
    'agreementLayouts', (select coalesce(jsonb_agg(to_jsonb(x) - 'updated_by'), '[]') from public.agreement_layouts x
                          where x.key = 'master' or x.key = (select developer_id from public.projects where id = p_project)));
$$;

-- ---------------------------------------------------------------------
-- E-mail outbox: a dispatcher claims a row ("sending") before it sends it, so two dispatchers never send the same e-mail.
-- ---------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_status_check;
alter table public.notifications add constraint notifications_status_check check (status in ('queued','sending','logged','sent','failed'));

-- A write that changes nothing does not mark the developer as updated.
drop trigger if exists developers_touch on public.developers;
create trigger developers_touch before update on public.developers
  for each row when (old.* is distinct from new.*) execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
-- Privileges (helpers are called only from SECURITY DEFINER code)
-- ---------------------------------------------------------------------
revoke all on function private.clean_ip(text), private.request_ip(), private.ops_annual_net(public.ops_models, text, float8),
  private.deal_prices(jsonb), private.order_deal(public.orders, text[]), private.order_price_problem(public.orders, text[]),
  private.read_complete(public.signing_links, int), private.pick_rep(text), private.public_catalogue(text)
  from public, anon, authenticated;
-- the developers CHECK constraints call it on every write to a developer row, including HQ's own edits
revoke all on function private.safe_signatory_src(text) from public, anon;
grant execute on function private.safe_signatory_src(text) to authenticated, service_role;

commit;
