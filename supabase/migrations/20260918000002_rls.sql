-- =====================================================================
--  Revnu — Row Level Security
--  Ports the prototype's DEV_ROLES / DEV_PERMS / Revnu levels so every
--  client-side permission check is re-enforced by Postgres.
--
--  Read rule  : Revnu staff read everything; a developer's members read
--               everything belonging to their developer_id; anon reads
--               only developers_public.
--  Write rule : permission-scoped (see matrix in docs/ARCHITECTURE.md).
--  Orders     : no direct writes at all — RPCs only (0003).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so they can read profiles without recursion)
-- ---------------------------------------------------------------------
create or replace function private.me()
returns public.profiles language sql stable security definer set search_path = public as $$
  select * from public.profiles where id = auth.uid() and deleted_at is null limit 1;
$$;

create or replace function private.is_revnu()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and deleted_at is null and developer_id is null);
$$;

create or replace function private.my_dev()
returns text language sql stable security definer set search_path = public as $$
  select developer_id from public.profiles where id = auth.uid() and deleted_at is null;
$$;

-- Revnu staff permission: explicit perms override, else the level's defaults.
create or replace function private.revnu_has(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles pr
    left join public.revnu_roles rr on rr.id = pr.revnu_role_id
    where pr.id = auth.uid() and pr.deleted_at is null and pr.developer_id is null
      and coalesce(pr.perms, rr.perms, '{}') @> array[p]
  );
$$;

create or replace function private.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and deleted_at is null and developer_id is null and revnu_role_id = 'super_admin');
$$;

-- Developer-team permission: explicit perms override, else the role's defaults,
-- else nothing (a free-text title with no perms = viewer, as in devRoleById()).
create or replace function private.dev_has(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles pr
    left join public.dev_roles dr on dr.id = pr.role
    where pr.id = auth.uid() and pr.deleted_at is null and pr.developer_id is not null
      and coalesce(pr.perms, dr.perms, '{}') @> array[p]
  );
$$;

create or replace function private.can_read_dev(d text)
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_revnu() or (d is not null and d = private.my_dev());
$$;

create or replace function private.project_dev(p text)
returns text language sql stable security definer set search_path = public as $$
  select developer_id from public.projects where id = p;
$$;

create or replace function private.can_read_project(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_revnu() or exists (select 1 from public.projects where id = p and developer_id = private.my_dev());
$$;

create or replace function private.order_dev(o text)
returns text language sql stable security definer set search_path = public as $$
  select developer_id from public.orders where id = o;
$$;

-- Can the caller manage (edit / create / remove) a team member of developer d?
create or replace function private.can_manage_dev_team(d text)
returns boolean language sql stable security definer set search_path = public as $$
  select private.revnu_has('developers') or (d is not null and d = private.my_dev() and private.dev_has('team'));
$$;

grant usage on schema private to authenticated, anon, service_role;
grant execute on all functions in schema private to authenticated, anon, service_role;

-- ---------------------------------------------------------------------
-- Default privileges: nothing for anon beyond what policies grant below.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select on public.developers_public to anon, authenticated;

-- ---------------------------------------------------------------------
-- Reference tables — readable by any signed-in user, never written by the app
-- ---------------------------------------------------------------------
alter table public.dev_perms      enable row level security;
alter table public.dev_roles      enable row level security;
alter table public.revnu_perms    enable row level security;
alter table public.revnu_roles    enable row level security;
alter table public.contract_vars  enable row level security;
create policy "ref read" on public.dev_perms     for select to authenticated using (true);
create policy "ref read" on public.dev_roles     for select to authenticated using (true);
create policy "ref read" on public.revnu_perms   for select to authenticated using (true);
create policy "ref read" on public.revnu_roles   for select to authenticated using (true);
create policy "ref read" on public.contract_vars for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- Developers + commission ladder — Revnu 'developers' perm writes
-- ---------------------------------------------------------------------
alter table public.developers enable row level security;
create policy "dev read"   on public.developers for select to authenticated using ((select private.can_read_dev(id)));
create policy "dev insert" on public.developers for insert to authenticated with check ((select private.revnu_has('developers')));
create policy "dev update" on public.developers for update to authenticated using ((select private.revnu_has('developers'))) with check ((select private.revnu_has('developers')));
create policy "dev delete" on public.developers for delete to authenticated using ((select private.is_super_admin()));

alter table public.commission_levels enable row level security;
create policy "ladder read"  on public.commission_levels for select to authenticated using ((select private.can_read_dev(developer_id)));
create policy "ladder write" on public.commission_levels for all to authenticated using ((select private.revnu_has('developers'))) with check ((select private.revnu_has('developers')));

-- ---------------------------------------------------------------------
-- Projects + catalogue — tenant read; Revnu 'developers' writes; super-admin deletes
-- ---------------------------------------------------------------------
alter table public.projects enable row level security;
create policy "project read"   on public.projects for select to authenticated using ((select private.can_read_dev(developer_id)));
create policy "project insert" on public.projects for insert to authenticated with check ((select private.revnu_has('developers')));
create policy "project update" on public.projects for update to authenticated using ((select private.revnu_has('developers'))) with check ((select private.revnu_has('developers')));
create policy "project delete" on public.projects for delete to authenticated using ((select private.is_super_admin()));

-- Catalogue tables share the same shape of policy.
do $$
declare t text;
begin
  foreach t in array array['unit_types','design_styles','packages','smart_home','ops_models','construction_milestones','payment_plans','contract_templates']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "cat read"   on public.%I for select to authenticated using ((select private.can_read_project(project_id)))', t);
    execute format('create policy "cat insert" on public.%I for insert to authenticated with check ((select private.revnu_has(''developers'')))', t);
    execute format('create policy "cat update" on public.%I for update to authenticated using ((select private.revnu_has(''developers''))) with check ((select private.revnu_has(''developers'')))', t);
    execute format('create policy "cat delete" on public.%I for delete to authenticated using ((select private.is_super_admin()))', t);
  end loop;
end $$;

-- Units: Revnu 'developers' OR a developer member with the 'inventory' permission.
-- (Status flips caused by orders happen inside the RPCs, not through this policy.)
alter table public.units enable row level security;
create policy "unit read"   on public.units for select to authenticated using ((select private.can_read_project(project_id)));
create policy "unit insert" on public.units for insert to authenticated
  with check ((select private.revnu_has('developers')) or ((select private.dev_has('inventory')) and (select private.project_dev(project_id)) = (select private.my_dev())));
create policy "unit update" on public.units for update to authenticated
  using ((select private.revnu_has('developers')) or ((select private.dev_has('inventory')) and (select private.project_dev(project_id)) = (select private.my_dev())))
  with check ((select private.revnu_has('developers')) or ((select private.dev_has('inventory')) and (select private.project_dev(project_id)) = (select private.my_dev())));
create policy "unit delete" on public.units for delete to authenticated using ((select private.is_super_admin()));

-- ---------------------------------------------------------------------
-- Profiles — own row always; tenant rows for members; Revnu staff all.
-- Creation of the auth user happens in /api/users (service role), the
-- profile row is then inserted with the CALLER's session => these policies apply.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
create policy "profile read" on public.profiles for select to authenticated
  using (id = auth.uid() or (select private.is_revnu()) or (developer_id is not null and developer_id = (select private.my_dev())));

create policy "profile insert" on public.profiles for insert to authenticated
  with check (
    (developer_id is not null and (select private.can_manage_dev_team(developer_id)))
    or (developer_id is null and (select private.revnu_has('team')))
  );

create policy "profile update" on public.profiles for update to authenticated
  using (
    id = auth.uid()
    or (developer_id is not null and (select private.can_manage_dev_team(developer_id)))
    or (developer_id is null and (select private.revnu_has('team')))
  )
  with check (
    id = auth.uid()
    or (developer_id is not null and (select private.can_manage_dev_team(developer_id)))
    or (developer_id is null and (select private.revnu_has('team')))
  );

-- Hard deletes are never used by the app (soft delete via deleted_at) but super admins may purge.
create policy "profile delete" on public.profiles for delete to authenticated using ((select private.is_super_admin()));

-- A user editing their OWN row may only touch name / name_ar / bank / must_change_password.
create or replace function private.profiles_self_edit_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = old.id
     and not private.revnu_has('team')
     and not (old.developer_id is not null and private.can_manage_dev_team(old.developer_id)) then
    if new.developer_id is distinct from old.developer_id
       or new.role is distinct from old.role
       or new.role_ar is distinct from old.role_ar
       or new.revnu_role_id is distinct from old.revnu_role_id
       or new.perms is distinct from old.perms
       or new.commission_level_id is distinct from old.commission_level_id
       or new.reports_to is distinct from old.reports_to
       or new.email is distinct from old.email
       or new.deleted_at is distinct from old.deleted_at
       or new.legacy_id is distinct from old.legacy_id then
      raise exception 'You can only edit your own name and bank details' using errcode = 'insufficient_privilege';
    end if;
  end if;
  -- Developer-team managers can never move a person to another developer or grant Revnu levels.
  if auth.uid() is not null and not private.revnu_has('developers') then
    if new.developer_id is distinct from old.developer_id or new.revnu_role_id is distinct from old.revnu_role_id then
      raise exception 'Not allowed to change the organisation of a user' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_self_edit_guard before update on public.profiles for each row execute function private.profiles_self_edit_guard();

alter table public.profile_projects enable row level security;
create policy "pp read" on public.profile_projects for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = profile_id and (p.id = auth.uid() or (select private.is_revnu()) or p.developer_id = (select private.my_dev()))));
create policy "pp write" on public.profile_projects for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = profile_id and (select private.can_manage_dev_team(p.developer_id))))
  with check (exists (select 1 from public.profiles p where p.id = profile_id and (select private.can_manage_dev_team(p.developer_id))));

-- ---------------------------------------------------------------------
-- Orders and everything hanging off them — tenant read, RPC-only writes
-- ---------------------------------------------------------------------
alter table public.orders enable row level security;
create policy "order read"   on public.orders for select to authenticated using ((select private.can_read_dev(developer_id)));
create policy "order delete" on public.orders for delete to authenticated using ((select private.is_super_admin()));
-- (no insert/update policies: create_order / transition_order / cancel_order / reinstate_order only)

alter table public.order_units enable row level security;
create policy "ou read" on public.order_units for select to authenticated using ((select private.can_read_dev(private.order_dev(order_id))));

alter table public.order_activity enable row level security;
create policy "activity read" on public.order_activity for select to authenticated using ((select private.can_read_dev(private.order_dev(order_id))));

alter table public.documents enable row level security;
create policy "doc read" on public.documents for select to authenticated using ((select private.can_read_dev(private.order_dev(order_id))));
-- inserts go through attach_document()

alter table public.invoices enable row level security;
create policy "invoice read" on public.invoices for select to authenticated using ((select private.can_read_dev(private.order_dev(order_id))));

alter table public.receivable_paid enable row level security;
create policy "recv read" on public.receivable_paid for select to authenticated using ((select private.can_read_dev(private.order_dev(order_id))));
-- writes via set_receivable_paid() — Revnu 'financials' only (developer side is read-only; audit B-08)

alter table public.payouts enable row level security;
create policy "payout read" on public.payouts for select to authenticated using ((select private.can_read_dev(private.order_dev(order_id))));
-- writes via set_payout_status()

alter table public.notifications enable row level security;
create policy "notif read" on public.notifications for select to authenticated using ((select private.is_revnu()));

-- ---------------------------------------------------------------------
-- Support tickets: anyone signed in may raise one; Revnu handles them
-- ---------------------------------------------------------------------
alter table public.support_tickets enable row level security;
create policy "ticket read"   on public.support_tickets for select to authenticated using ((select private.is_revnu()) or by_user_id = auth.uid());
create policy "ticket insert" on public.support_tickets for insert to authenticated with check (by_user_id = auth.uid());
create policy "ticket update" on public.support_tickets for update to authenticated using ((select private.is_revnu())) with check ((select private.is_revnu()));

-- Stamp who raised it from the session, never from the payload.
create or replace function private.tickets_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if new.id is null or new.id = '' then
    new.id := 'TKT-' || lpad(nextval('public.ticket_seq')::text, 4, '0');
  end if;
  new.by_user_id := auth.uid();
  new.by_name := coalesce(p.name, new.by_name);
  new.by_email := coalesce(p.email, new.by_email);
  new.developer_id := p.developer_id;
  return new;
end $$;
create trigger tickets_stamp before insert on public.support_tickets for each row execute function private.tickets_stamp();

alter table public.ticket_replies enable row level security;
create policy "reply read"   on public.ticket_replies for select to authenticated
  using ((select private.is_revnu()) or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.by_user_id = auth.uid()));
create policy "reply insert" on public.ticket_replies for insert to authenticated with check ((select private.is_revnu()) and by_user_id = auth.uid());

create or replace function private.replies_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  new.by_user_id := auth.uid();
  new.by_name := coalesce(p.name, 'Revnu');
  update public.support_tickets set status = 'in_progress' where id = new.ticket_id and status = 'open';
  return new;
end $$;
create trigger replies_stamp before insert on public.ticket_replies for each row execute function private.replies_stamp();

-- ---------------------------------------------------------------------
-- Leads ("Interested"): inserted by /api/leads on behalf of the public site
-- ---------------------------------------------------------------------
alter table public.leads enable row level security;
create policy "lead read"   on public.leads for select to authenticated using ((select private.is_revnu()));
create policy "lead update" on public.leads for update to authenticated using ((select private.is_revnu())) with check ((select private.is_revnu()));
create policy "lead insert" on public.leads for insert to anon, authenticated with check (status = 'new');

-- ---------------------------------------------------------------------
-- Sequences used from RPCs only
-- ---------------------------------------------------------------------
revoke all on sequence public.order_seq from anon, authenticated;
revoke all on sequence public.ticket_seq from anon, authenticated;
grant usage on sequence public.ticket_seq to authenticated;   -- tickets_stamp() runs as definer, but harmless
