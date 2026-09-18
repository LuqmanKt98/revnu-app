-- =====================================================================
--  Revnu — read views that hand the app the prototype's aggregate shapes
--  (assignedProjectIds[], unitNumbers[], replies[]) in one round-trip.
--  security_invoker = true => the caller's RLS applies to the base tables.
-- =====================================================================
create view public.profiles_v with (security_invoker = true) as
  select p.*,
         coalesce((select array_agg(pp.project_id order by pp.project_id) from public.profile_projects pp where pp.profile_id = p.id), '{}'::text[]) as assigned_project_ids,
         coalesce(p.perms, dr.perms, rr.perms, '{}'::text[]) as effective_perms
  from public.profiles p
  left join public.dev_roles dr on dr.id = p.role
  left join public.revnu_roles rr on rr.id = p.revnu_role_id
  where p.deleted_at is null;

create view public.orders_v with (security_invoker = true) as
  select o.*,
         coalesce((select array_agg(ou.unit_number order by ou.sort) from public.order_units ou where ou.order_id = o.id), '{}'::text[]) as unit_numbers
  from public.orders o;

create view public.support_tickets_v with (security_invoker = true) as
  select t.*,
         coalesce((select jsonb_agg(jsonb_build_object('at', r.at, 'by_name', r.by_name, 'text', r.text) order by r.at)
                   from public.ticket_replies r where r.ticket_id = t.id), '[]'::jsonb) as replies
  from public.support_tickets t;

grant select on public.profiles_v, public.orders_v, public.support_tickets_v to authenticated;
