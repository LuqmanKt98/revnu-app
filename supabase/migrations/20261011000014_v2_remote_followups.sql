-- =====================================================================
--  Revnu v2 — remote follow-ups. Additive only.
--   · lead_set(): the rep marks an Interest row "Not interested" (or
--     reopens it). Same permission as accepting a submission.
--   · public_catalogue() also carries the agreement layout the order's
--     developer uses (its own, else the Revnu master), so an agreement
--     issued before orders pinned a snapshot still renders on the phone.
-- =====================================================================
begin;

create or replace function public.lead_set(p_id uuid, p_action text)
returns public.sale_leads language plpgsql security definer set search_path = public as $$
declare ld public.sale_leads;
begin
  select * into ld from public.sale_leads where id = p_id for update;
  if ld.id is null then raise exception 'lead not found' using errcode = 'no_data_found'; end if;
  if not private.can_act_remote(ld.developer_id, ld.rep_id, null) then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  if p_action = 'dismiss' then
    update public.sale_leads set status = 'dismissed' where id = ld.id and status = 'started';
  elsif p_action = 'reopen' then
    update public.sale_leads set status = 'started' where id = ld.id and status = 'dismissed';
  else
    raise exception 'unknown action %', p_action using errcode = 'check_violation';
  end if;
  select * into ld from public.sale_leads where id = p_id;
  return ld;
end $$;
revoke all on function public.lead_set(uuid, text) from public, anon;
grant execute on function public.lead_set(uuid, text) to authenticated, service_role;

create or replace function private.public_catalogue(p_project text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'designStyles',     (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.design_styles x where x.project_id = p_project),
    'packages',         (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.packages x where x.project_id = p_project),
    'smartHome',        (select coalesce(jsonb_agg(to_jsonb(x) order by x.level), '[]') from public.smart_home x where x.project_id = p_project),
    'opsModels',        (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.ops_models x where x.project_id = p_project),
    'kitchens',         (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.kitchens x where x.project_id = p_project),
    'acSystems',        (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.ac_systems x where x.project_id = p_project),
    'coolingPoints',    (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.cooling_points x where x.project_id = p_project),
    'flooringFinishes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.flooring_finishes x where x.project_id = p_project),
    'flooringZones',    (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.flooring_zones x where x.project_id = p_project),
    'layoutOptions',    (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.layout_options x where x.project_id = p_project),
    'paymentPlans',     (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.payment_plans x where x.project_id = p_project),
    'constructionMilestones', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort), '[]') from public.construction_milestones x where x.project_id = p_project),
    'contractTemplates', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.contract_templates x where x.project_id = p_project),
    'contractVars',     (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort), '[]') from public.contract_vars x),
    'agreementLayouts', (select coalesce(jsonb_agg(to_jsonb(x) - 'updated_by'), '[]') from public.agreement_layouts x
                          where x.key = 'master' or x.key = (select developer_id from public.projects where id = p_project)));
$$;
revoke all on function private.public_catalogue(text) from public, anon, authenticated;

commit;
