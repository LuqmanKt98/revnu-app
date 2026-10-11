-- =====================================================================
--  Revnu v2 — fix for 020: a kitchen or cooling choice on a project that does not offer it is refused with
--  PRICE_MISMATCH (the text-array append needed an explicit function; it raised a type error instead).
-- =====================================================================
begin;

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
      if not private.jflag(f->'kitchens') then stray := array_append(stray, 'kitchen'); else
        select * into kt from public.kitchens where id = cfg->>'kitchenId' and project_id = proj.id; end if; end if;
    if not private.jflag(skip->'cooling') and private.jflag(cfg->'acId') then
      if not private.jflag(f->'cooling') then stray := array_append(stray, 'cooling'); else
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

revoke all on function private.deal_prices(jsonb) from public, anon, authenticated;

commit;
