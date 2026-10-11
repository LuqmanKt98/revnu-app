-- =====================================================================
--  Revnu v2 — fixes from the independent audit of 11 Oct 2026. Additive.
--   S1  permission checks can no longer evaluate to NULL (a rep could act
--       on another rep's submissions and leads)
--   S2  "read every page": the page list per language only grows, must reach
--       the agreement's minimum (from the pinned layout), and every page must
--       be read in that language before signing
--   B3  the developer's signatory, signature and stamp are versioned; every
--       issued order pins the version it was issued with (part of the hash)
--   B10 any sale (office or remote) auto-declines pending submissions on its units
--   S3  the unit price on an order must equal the inventory price
--   S4  per-IP limits on the public functions (lookups, leads, submissions, signing)
--   S6  steps the rep locked keep the rep's choices whatever the phone sends
--   S7  the signing page no longer receives internal order fields
--   S8  signature / stamp images: data URLs, /brand/ files or this project's media only
--   S9  a revoked link cannot be revived; extending never passes the validity cap
--   S10 a suspended developer's links are paused for buyers
--   +   routing pools and rep lists contain sales staff only (a commission level)
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- S1: never NULL
-- ---------------------------------------------------------------------
create or replace function private.can_see_remote(p_dev text, p_rep uuid, p_created_by uuid, p_routing jsonb)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(private.is_revnu()
      or (p_dev = private.my_dev() and private.dev_has('orders')
          and (p_rep = auth.uid() or p_created_by = auth.uid()
               or coalesce(p_routing->'repIds', '[]'::jsonb) ? auth.uid()::text
               or private.dev_has('team') or private.dev_has('financials'))), false);
$$;
create or replace function private.can_act_remote(p_dev text, p_rep uuid, p_created_by uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(private.revnu_has('orders')
      or (p_dev = private.my_dev() and private.dev_has('orders')
          and (p_rep = auth.uid() or p_created_by = auth.uid() or private.dev_has('team'))), false);
$$;

-- ---------------------------------------------------------------------
-- B3: signatory versions, pinned on the order at issue
-- ---------------------------------------------------------------------
create table if not exists public.developer_signatories (
  id                          uuid primary key default gen_random_uuid(),
  developer_id                text not null references public.developers(id) on delete cascade,
  authorized_signer           text,
  authorized_signer_ar        text,
  authorized_signer_title     text,
  authorized_signer_title_ar  text,
  signature                   text,
  stamp                       text,
  created_at                  timestamptz not null default now(),
  created_by                  uuid references public.profiles(id) on delete set null,
  created_by_name             text
);
create index if not exists developer_signatories_dev_idx on public.developer_signatories(developer_id, created_at desc);
alter table public.developer_signatories enable row level security;
drop policy if exists "signatory read" on public.developer_signatories;
create policy "signatory read" on public.developer_signatories for select to authenticated using ((select private.can_read_dev(developer_id)));
grant select on public.developer_signatories to authenticated;
revoke all on public.developer_signatories from anon;

insert into public.developer_signatories(developer_id, authorized_signer, authorized_signer_ar, authorized_signer_title, authorized_signer_title_ar, signature, stamp, created_by_name)
select d.id, d.authorized_signer, d.authorized_signer_ar, d.authorized_signer_title, d.authorized_signer_title_ar, d.signature, d.stamp, 'initial'
from public.developers d where not exists (select 1 from public.developer_signatories s where s.developer_id = d.id);

create or replace function private.developer_signatory_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT'
     or new.authorized_signer is distinct from old.authorized_signer or new.authorized_signer_ar is distinct from old.authorized_signer_ar
     or new.authorized_signer_title is distinct from old.authorized_signer_title or new.authorized_signer_title_ar is distinct from old.authorized_signer_title_ar
     or new.signature is distinct from old.signature or new.stamp is distinct from old.stamp then
    insert into public.developer_signatories(developer_id, authorized_signer, authorized_signer_ar, authorized_signer_title, authorized_signer_title_ar, signature, stamp, created_by, created_by_name)
    values (new.id, new.authorized_signer, new.authorized_signer_ar, new.authorized_signer_title, new.authorized_signer_title_ar, new.signature, new.stamp, auth.uid(), private.caller_name());
  end if;
  return null;
end $$;
drop trigger if exists developers_signatory_version on public.developers;
create trigger developers_signatory_version after insert or update on public.developers for each row execute function private.developer_signatory_version();

create or replace function private.current_signatory(p_dev text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.developer_signatories where developer_id = p_dev order by created_at desc, id desc limit 1;
$$;

alter table public.orders add column if not exists signatory_id uuid references public.developer_signatories(id) on delete set null;

-- S8: images for the pre-signed block come from places we control
do $$ begin
  alter table public.developers add constraint developers_signature_src_chk check (signature is null or signature ~ '^(data:image/(png|jpeg|webp);base64,|/brand/|https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/media/)') not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.developers add constraint developers_stamp_src_chk check (stamp is null or stamp ~ '^(data:image/(png|jpeg|webp);base64,|/brand/|https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/media/)') not valid;
exception when duplicate_object then null; end $$;
alter table public.developers validate constraint developers_signature_src_chk;
alter table public.developers validate constraint developers_stamp_src_chk;

drop view if exists public.orders_v;
create view public.orders_v with (security_invoker = true) as
  select o.*,
         coalesce((select array_agg(ou.unit_number order by ou.sort) from public.order_units ou where ou.order_id = o.id), '{}'::text[]) as unit_numbers
  from public.orders o;
grant select on public.orders_v to authenticated;

-- The versions orders were issued with (the portals load these; the current one is the developer row itself).
create or replace view public.order_signatories_v with (security_invoker = true) as
  select s.* from public.developer_signatories s
  where exists (select 1 from public.orders o where o.signatory_id = s.id);
grant select on public.order_signatories_v to authenticated;

-- The fingerprint covers the pinned version; orders issued before versions existed keep their fingerprint.
create or replace function private.deal_fingerprint(p_order text)
returns text language sql stable security definer set search_path = public as $$
  select encode(extensions.digest(convert_to(
    (to_jsonb(o) - 'status' - 'signed_at' - 'paid_at' - 'updated_at' - 'contract_hash' - 'signed_contract_url' - 'payment_proof_url'
                 - 'cancelled_at' - 'cancel_reason' - 'cancelled_by' - 'status_before_cancel' - 'reinstated_at'
                 - case when o.signatory_id is null then 'signatory_id' else '' end)::text
    || '|' || coalesce((select string_agg(ou.unit_number, ',' order by ou.sort) from public.order_units ou where ou.order_id = o.id), ''),
    'UTF8'), 'sha256'), 'hex')
  from public.orders o where o.id = p_order;
$$;

-- ---------------------------------------------------------------------
-- S2: what "every page" means, decided by the server
-- ---------------------------------------------------------------------
alter table public.signing_links add column if not exists pages jsonb not null default '{}';   -- {lang: [page ids]} — the longest list the phone showed per language
update public.signing_links set pages = jsonb_build_object('xx', sections) where pages = '{}'::jsonb and jsonb_array_length(sections) > 0;

-- A lower bound for the agreement's A4 sheets: one per page-making data block every deal shows (unit pages once
-- per unit) plus one per run of clauses. Conditional and other blocks are left out (a hidden block joins the
-- clause runs around it), so the agreement the phone renders always has at least this many sheets.
create or replace function private.agreement_min_pages(p_order text)
returns int language plpgsql stable security definer set search_path = public as $$
declare v_blocks jsonb; v_units int; v_dev text; n int := 0; prev_clause boolean := false; b jsonb;
begin
  select ov.agreement->'blocks', greatest(1, coalesce(array_length(ov.unit_numbers, 1), 1)), ov.developer_id
    into v_blocks, v_units, v_dev from public.orders_v ov where ov.id = p_order;
  if v_blocks is null or jsonb_typeof(v_blocks) <> 'array' then
    select blocks into v_blocks from public.agreement_layouts where key = v_dev;
    if v_blocks is null then select blocks into v_blocks from public.agreement_layouts where key = 'master'; end if;
  end if;
  for b in select value from jsonb_array_elements(coalesce(v_blocks, '[]'::jsonb)) loop
    if coalesce(b->>'enabled', 'true') = 'false' or coalesce(b->>'showWhen', 'always') <> 'always' then continue; end if;
    if b->>'kind' = 'clause' then
      if not prev_clause then n := n + 1; end if;
      prev_clause := true;
    elsif b->>'ref' in ('cover', 'parties', 'unit_pages', 'investment', 'execution') then
      prev_clause := false;
      n := n + case when b->>'ref' = 'unit_pages' then v_units else 1 end;
    end if;
  end loop;
  return greatest(1, n);
end $$;

-- Read in full = some language whose page list reaches the minimum has every page read in that language.
create or replace function private.read_complete(g public.signing_links, p_min int)
returns boolean language sql stable as $$
  select exists (
    select 1 from jsonb_each(coalesce(g.pages, '{}'::jsonb)) as p(lang, ids)
    where jsonb_typeof(ids) = 'array' and jsonb_array_length(ids) >= p_min
      and not exists (
        select 1 from jsonb_array_elements_text(ids) s(id)
        where not exists (select 1 from jsonb_array_elements(g.read_log) r
                          where r->>'id' = s.id and coalesce(r->>'lang', p.lang) = p.lang)));
$$;

-- ---------------------------------------------------------------------
-- S4: per-IP limits on the public functions
-- ---------------------------------------------------------------------
create table if not exists private.public_hits (
  id    bigserial primary key,
  kind  text not null,
  ip    text not null,
  at    timestamptz not null default now()
);
create index if not exists public_hits_lookup_idx on private.public_hits(kind, ip, at desc);
create or replace function private.over_limit(p_kind text, p_max int)
returns boolean language sql stable security definer set search_path = public as $$
  select count(*) >= p_max from private.public_hits
  where kind = p_kind and ip = coalesce(private.request_ip(), 'unknown') and at > now() - interval '1 hour';
$$;
create or replace function private.hit(p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into private.public_hits(kind, ip) values (p_kind, coalesce(private.request_ip(), 'unknown'));
  if random() < 0.02 then delete from private.public_hits where at < now() - interval '1 day'; end if;
end $$;
create or replace function private.throttle(p_kind text, p_max int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if private.over_limit(p_kind, p_max) then raise exception 'RATE_LIMITED' using errcode = 'check_violation'; end if;
  perform private.hit(p_kind);
end $$;

create or replace function private.dev_suspended(p_dev text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select suspended from public.developers where id = p_dev), false);
$$;

-- ---------------------------------------------------------------------
-- S6: steps the rep locked keep the rep's choices
-- ---------------------------------------------------------------------
create or replace function private.apply_locks(p_sel jsonb, p_base jsonb, p_locks jsonb)
returns jsonb language plpgsql immutable as $$
declare
  v jsonb := case when jsonb_typeof(p_sel) = 'object' then p_sel else '{}'::jsonb end;
  base jsonb := case when jsonb_typeof(p_base) = 'object' then p_base else '{}'::jsonb end;
  base_skip jsonb; v_skip jsonb; step text; k text; keys text[]; sk text;
begin
  if jsonb_typeof(p_locks) is distinct from 'object' then return v; end if;
  base_skip := case when jsonb_typeof(base->'skip') = 'object' then base->'skip' else '{}'::jsonb end;
  for step in select key from jsonb_each(p_locks) where value = 'true'::jsonb loop
    keys := case step
      when 'design'   then array['designId','paletteId']
      when 'package'  then array['packageId','fitout']
      when 'smart'    then array['smartId']
      when 'layout'   then array['layoutIds']
      when 'flooring' then array['flooring']
      when 'kitchen'  then array['kitchenId','kitchenPaletteId','kitchenScope','kitchenAddons']
      when 'cooling'  then array['acId','acAddons']
      when 'operate'  then array['opsId']
      else array[]::text[] end;
    foreach k in array keys loop
      v := case when base ? k then jsonb_set(v, array[k], base->k) else v - k end;
    end loop;
    sk := case step when 'design' then 'furnishing' when 'package' then 'furnishing' when 'smart' then 'smartHome'
                    when 'kitchen' then 'kitchens' when 'cooling' then 'cooling' when 'operate' then 'operations'
                    when 'flooring' then 'flooring' when 'layout' then 'layout' else null end;
    if sk is not null then
      v_skip := case when jsonb_typeof(v->'skip') = 'object' then v->'skip' else '{}'::jsonb end;
      v_skip := (v_skip - sk) || case when base_skip ? sk then jsonb_build_object(sk, base_skip->sk) else '{}'::jsonb end;
      v := jsonb_set(v, '{skip}', v_skip);
    end if;
  end loop;
  return v;
end $$;
create or replace function private.apply_locks_per_unit(p_per jsonb, p_base jsonb, p_base_per jsonb, p_locks jsonb)
returns jsonb language sql immutable as $$
  select case when jsonb_typeof(p_per) <> 'object' then null else
    (select coalesce(jsonb_object_agg(e.key, private.apply_locks(e.value,
              coalesce(p_base, '{}'::jsonb) || case when jsonb_typeof(p_base_per->e.key) = 'object' then p_base_per->e.key else '{}'::jsonb end,
              p_locks)), '{}'::jsonb)
     from jsonb_each(p_per) e) end;
$$;

-- ---------------------------------------------------------------------
-- B10: any sale takes the unit away from pending submissions
-- ---------------------------------------------------------------------
create or replace function private.decline_competing_submissions() returns trigger
language plpgsql security definer set search_path = public as $$
declare own uuid; other public.submissions;
begin
  if not new.is_live or (tg_op = 'UPDATE' and old.is_live) then return null; end if;
  select submission_id into own from public.orders where id = new.order_id;
  for other in select * from public.submissions s
               where s.status = 'pending' and s.unit_numbers @> array[new.unit_number] and s.id is distinct from own
               for update loop
    update public.submissions set status = 'auto_declined', decided_at = now(), decline_reason = 'unit taken by ' || new.order_id
    where id = other.id;
    perform private.inbox(other.rep_id, 'auto_declined',
      coalesce(other.customer->>'fullName', '') || ' — ' || new.unit_number || ' was taken',
      'Declined automatically when ' || new.order_id || ' took the unit. Offer alternatives.', '/sales');
  end loop;
  return null;
end $$;
drop trigger if exists order_units_decline_competing on public.order_units;
create trigger order_units_decline_competing after insert or update of is_live on public.order_units
  for each row when (new.is_live) execute function private.decline_competing_submissions();   -- a sale, or a reinstated order

-- ---------------------------------------------------------------------
-- S3: the unit price must be the inventory price (list, or the beneficiary price)
-- ---------------------------------------------------------------------
create or replace function private.orders_check_unit_price() returns trigger
language plpgsql security definer set search_path = public as $$
declare expected numeric; ben boolean;
begin
  ben := coalesce(new.customer->>'beneficiary', 'false') = 'true';
  select sum(case when ben and u.price_ben is not null then u.price_ben else coalesce(t.base_price, 0) + coalesce(u.price_adj, 0) end)
    into expected
  from public.order_units ou join public.units u on u.number = ou.unit_number left join public.unit_types t on t.id = u.type_id
  where ou.order_id = new.id;
  if expected is not null and abs(coalesce(new.unit_price, 0) - round(expected)) > 1 then
    raise exception 'PRICE_MISMATCH' using errcode = 'check_violation';
  end if;
  return null;
end $$;
drop trigger if exists orders_check_unit_price on public.orders;
create constraint trigger orders_check_unit_price after insert on public.orders
  deferrable initially deferred for each row execute function private.orders_check_unit_price();

-- B3: issuing pins the signatory version
create or replace function private.orders_fingerprint_on_issue() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status is distinct from 'issued') then
    new.contract_hash := null;   -- set by the after-trigger once order_units exist
    if new.signatory_id is null then new.signatory_id := private.current_signatory(new.developer_id); end if;   -- B3: the block this agreement is issued with
  end if;
  return new;
end $$;

-- routing pools: sales staff only
create or replace function public.sale_link_create(p jsonb)
returns public.sale_links language plpgsql security definer set search_path = public as $$
declare
  v_dev text := private.my_dev();
  proj public.projects; l public.sale_links; s jsonb;
  v_mode text := coalesce(nullif(p->>'mode', ''), 'units');
  nums text[]; tids text[]; pool uuid[]; v_routing jsonb; v_rep uuid; v_until timestamptz; v_hours int; n text;
begin
  if v_dev is null or not private.dev_has('orders') then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  select * into proj from public.projects where id = p->>'projectId' and developer_id = v_dev;
  if proj.id is null then raise exception 'project does not belong to your developer' using errcode = 'insufficient_privilege'; end if;
  if not private.remote_on(proj.id) then raise exception 'REMOTE_OFF' using errcode = 'check_violation'; end if;
  if v_mode not in ('units','shortlist','type') then raise exception 'unknown link mode %', v_mode using errcode = 'check_violation'; end if;
  s := private.remote_settings(proj.id);

  if v_mode = 'type' then
    select coalesce(array_agg(distinct x), '{}') into tids from jsonb_array_elements_text(coalesce(p->'typeIds', '[]'::jsonb)) t(x);
    if array_length(tids, 1) is null then raise exception 'PICK_TYPE' using errcode = 'check_violation'; end if;
    if (select count(*) from public.unit_types where id = any(tids) and project_id = proj.id) <> array_length(tids, 1) then
      raise exception 'unit type does not belong to this project' using errcode = 'check_violation';
    end if;
    select coalesce(array_agg(pr.id order by r.ord), '{}') into pool
    from jsonb_array_elements_text(coalesce(p->'routing'->'repIds', '[]'::jsonb)) with ordinality as r(id, ord)
    join public.profiles pr on pr.id::text = r.id and pr.developer_id = v_dev and pr.deleted_at is null and private.profile_has(pr.id, 'orders') and pr.commission_level_id is not null;
    if array_length(pool, 1) is null then pool := array[auth.uid()]; end if;
    v_routing := jsonb_build_object('kind', case when p->'routing'->>'kind' = 'round_robin' then 'round_robin' else 'single' end, 'repIds', to_jsonb(pool), 'pointer', 0);
    v_rep := pool[1]; nums := '{}';
    v_until := coalesce((p->>'validUntil')::timestamptz, now() + make_interval(days => coalesce((p->>'days')::int, 30)));
    v_until := least(greatest(v_until, now() + interval '1 hour'), now() + interval '90 days');
  else
    select coalesce(array_agg(x order by ord), '{}') into nums
    from (select distinct on (x) x, ord from jsonb_array_elements_text(coalesce(p->'unitNumbers', '[]'::jsonb)) with ordinality t(x, ord) order by x, ord) q;
    if array_length(nums, 1) is null then raise exception 'PICK_UNITS' using errcode = 'check_violation'; end if;
    if v_mode = 'shortlist' and array_length(nums, 1) < 2 then raise exception 'PICK_UNITS' using errcode = 'check_violation'; end if;
    if (select count(*) from public.units where number = any(nums) and project_id = proj.id) <> array_length(nums, 1) then
      raise exception 'unit does not belong to this project' using errcode = 'check_violation';
    end if;
    foreach n in array nums loop
      if private.unit_taken(n) then raise exception 'UNIT_TAKEN:%', n using errcode = 'unique_violation'; end if;
    end loop;
    v_hours := least(greatest(1, (s->>'maxValidityHours')::int), greatest(1, coalesce((p->>'hours')::int, (s->>'validityHours')::int, 48)));
    v_until := now() + make_interval(hours => v_hours);
    v_rep := auth.uid(); v_routing := null; tids := null;
  end if;

  insert into public.sale_links(code, slug, mode, developer_id, project_id, unit_numbers, type_ids, routing, rep_id, created_by,
      selections, per_mode, per_unit, locks, lang, title, customer_hint, valid_until, sent_via)
  values (private.short_code('link'), private.slugify(proj.name), v_mode, v_dev, proj.id, nums, tids, v_routing, v_rep, auth.uid(),
      case when jsonb_typeof(p->'selections') = 'object' then p->'selections' else '{}'::jsonb end,
      coalesce((p->>'perMode')::boolean, false) and v_mode <> 'type',
      case when v_mode <> 'type' and jsonb_typeof(p->'perUnit') = 'object' then p->'perUnit' else null end,
      case when jsonb_typeof(p->'locks') = 'object' then p->'locks' else '{}'::jsonb end,
      case when p->>'lang' = 'ar' then 'ar' else 'en' end, left(p->>'title', 120),
      case when jsonb_typeof(p->'customerHint') = 'object' then p->'customerHint' else null end,
      v_until, left(coalesce(p->>'sentVia', case when v_mode = 'type' then 'public' else 'whatsapp' end), 20))
  returning * into l;
  return l;
end $$;

-- S9
create or replace function public.sale_link_set(p_code text, p_action text, p_hours int default 48)
returns public.sale_links language plpgsql security definer set search_path = public as $$
declare l public.sale_links;
begin
  select * into l from public.sale_links where code = private.parse_code(p_code) for update;
  if l.code is null then raise exception 'LINK_NOT_FOUND' using errcode = 'no_data_found'; end if;
  if not private.can_act_remote(l.developer_id, l.rep_id, l.created_by) then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  if p_action = 'revoke' then
    update public.sale_links set status = 'revoked' where code = l.code returning * into l;
  elsif p_action = 'extend' then
    if l.status in ('submitted', 'revoked') then raise exception 'LINK_CLOSED:%', l.status using errcode = 'check_violation'; end if;
    update public.sale_links
       set status = 'live',
           valid_until = least(greatest(valid_until, now()) + make_interval(hours => least(24 * 90, greatest(1, coalesce(p_hours, 48)))),
                               now() + case when mode = 'type' then interval '90 days'
                                            else make_interval(hours => greatest(1, coalesce((private.remote_settings(project_id)->>'maxValidityHours')::int, 168))) end)
     where code = l.code returning * into l;
  else
    raise exception 'unknown action %', p_action using errcode = 'check_violation';
  end if;
  return l;
end $$;

-- S1
create or replace function public.update_order_customer(p_order text, p jsonb)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders; c jsonb; changed text[];
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
  return o;
end $$;

-- S1 + S8 (a new signatory version is recorded by the developers trigger)
create or replace function public.set_signatory(p_dev text, p jsonb)
returns public.developers language plpgsql security definer set search_path = public as $$
declare d public.developers; k text;
begin
  if not coalesce(private.revnu_has('developers') or (p_dev = private.my_dev() and private.dev_has('contracts')), false) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  foreach k in array array['signature','stamp'] loop
    if p ? k and coalesce(p->>k, '') <> '' then
      if not ((p->>k) ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' or (p->>k) ~ '^/brand/[A-Za-z0-9._/-]+$' or (p->>k) ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/media/[A-Za-z0-9._/%-]+$') then
        raise exception 'SIGNATORY_IMAGE' using errcode = 'check_violation';
      end if;
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

-- S4 + S10
create or replace function public.public_link_view(p_code text, p_open boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.sale_links; sub jsonb;
begin
  if private.over_limit('miss', 30) then return jsonb_build_object('status', 'not_found'); end if;   -- S4: guessing codes
  select * into l from public.sale_links where code = private.parse_code(p_code);
  if l.code is null then perform private.hit('miss'); return jsonb_build_object('status', 'not_found'); end if;
  perform private.expire_sale_link(l.code);
  if p_open then
    update public.sale_links set opened_count = opened_count + 1, opened_at = coalesce(opened_at, now()) where code = l.code;
  end if;
  select * into l from public.sale_links where code = l.code;
  if l.status = 'live' and private.dev_suspended(l.developer_id) then l.status := 'paused'; end if;   -- S10
  if l.mode <> 'type' then
    select jsonb_build_object('id', s.id, 'link_code', s.link_code, 'mode', s.mode, 'project_id', s.project_id, 'developer_id', s.developer_id,
             'unit_numbers', s.unit_numbers, 'type_id', s.type_id, 'rep_id', s.rep_id, 'status', s.status, 'order_id', s.order_id,
             'decline_reason', s.decline_reason, 'created_at', s.created_at,
             'signing', (select jsonb_build_object('code', g.code, 'slug', g.slug, 'status', g.status, 'order_id', g.order_id, 'valid_until', g.valid_until)
                         from public.signing_links g where g.order_id = s.order_id and g.status in ('live','viewed','signed') order by g.created_at desc limit 1))
      into sub from public.submissions s where s.link_code = l.code order by s.created_at desc limit 1;
  end if;
  return jsonb_build_object(
    'status', l.status,
    'link', to_jsonb(l) - 'routing' - 'created_by',
    'developer', private.public_developer(l.developer_id, false),
    'project', private.public_project(l.project_id),
    'rep', case when l.mode = 'type' then null else private.public_rep(l.rep_id) end,
    'units', case when l.mode = 'type' then '[]'::jsonb else
       (select coalesce(jsonb_agg(to_jsonb(u) || jsonb_build_object('status', case when private.unit_taken(u.number) then 'sold' else 'available' end)
                                  order by array_position(l.unit_numbers, u.number)), '[]')
        from public.units u where u.number = any(l.unit_numbers)) end,
    'unitTypes', case when l.mode = 'type'
       then (select coalesce(jsonb_agg(to_jsonb(t) || '{"base_price":0}'::jsonb order by t.created_at), '[]') from public.unit_types t where t.project_id = l.project_id and t.id = any(coalesce(l.type_ids, '{}')))
       else (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from public.unit_types t where t.project_id = l.project_id) end,
    'catalogue', private.public_catalogue(l.project_id),
    'submission', sub);
end $$;

-- S4 + S10
create or replace function public.public_lead_start(p_code text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.sale_links; ld public.sale_leads; nm text; mob text; v_cc text; rep uuid;
begin
  perform private.throttle('lead', 20);
  select * into l from public.sale_links where code = private.parse_code(p_code);
  if l.code is null then raise exception 'LINK_NOT_FOUND' using errcode = 'no_data_found'; end if;
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

-- S4 + S6 + S10
create or replace function public.public_link_submit(p_code text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.sale_links; s public.submissions; ld public.sale_leads; chosen text[]; tid text; rep uuid; c jsonb; n text; what text;
begin
  perform private.throttle('submit', 10);
  select * into l from public.sale_links where code = private.parse_code(p_code) for update;
  if l.code is null then raise exception 'LINK_NOT_FOUND' using errcode = 'no_data_found'; end if;
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

-- S4 + S7 + B3
create or replace function public.public_signing_view(p_code text, p_open boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.signing_links; o jsonb; v_order text; v_project text; v_dev text; v_rep uuid; v_units text[];
begin
  if private.over_limit('miss', 30) then return jsonb_build_object('status', 'not_found'); end if;   -- S4
  select * into g from public.signing_links where code = private.parse_code(p_code);
  if g.code is null then perform private.hit('miss'); return jsonb_build_object('status', 'not_found'); end if;
  perform private.expire_signing_link(g.code);
  if p_open then
    update public.signing_links set opened_count = opened_count + 1, opened_at = coalesce(opened_at, now()),
           status = case when status = 'live' then 'viewed' else status end
    where code = g.code;
  end if;
  select * into g from public.signing_links where code = g.code;
  select to_jsonb(ov), ov.id, ov.project_id, ov.developer_id, ov.rep_id, ov.unit_numbers into o, v_order, v_project, v_dev, v_rep, v_units
  from public.orders_v ov where ov.id = g.order_id;
  if v_order is null then return jsonb_build_object('status', 'not_found'); end if;
  -- the national ID never travels in full to a phone link
  o := o || jsonb_build_object('customer_national_id', '••••••' || right(coalesce(o->>'customer_national_id', ''), 4))
         || jsonb_build_object('customer', coalesce(o->'customer', '{}'::jsonb) || jsonb_build_object('nationalId', '••••••' || right(coalesce(o->'customer'->>'nationalId', o->>'customer_national_id', ''), 4)));
  -- S7: only what the agreement prints
  o := o - 'submission_id' - 'sale_link_code' - 'signed_contract_url' - 'payment_proof_url' - 'cancelled_at' - 'cancel_reason'
         - 'cancelled_by' - 'status_before_cancel' - 'reinstated_at';
  return jsonb_build_object(
    'status', g.status,
    'link', to_jsonb(g) - 'created_by',
    'order', o,
    'activity', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'order_id', a.order_id, 'at', a.at, 'event', a.event, 'by_name', a.by_name,
                   'extra', case when a.event = 'status' then jsonb_build_object('from', a.extra->'from', 'to', a.extra->'to') else '{}'::jsonb end) order by a.at), '[]')
                 from public.order_activity a where a.order_id = v_order and a.event in ('created','status','signing_link','customer_edit','signed')),
    'signatory', (select to_jsonb(s) - 'created_by' from public.developer_signatories s where s.id = nullif(o->>'signatory_id', '')::uuid),
    'developer', private.public_developer(v_dev, true),
    'project', private.public_project(v_project),
    'rep', private.public_rep(v_rep),
    'units', (select coalesce(jsonb_agg(to_jsonb(u) order by array_position(v_units, u.number)), '[]') from public.units u where u.number = any(v_units)),
    'unitTypes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from public.unit_types t where t.id in (select u.type_id from public.units u where u.number = any(v_units))),
    'catalogue', private.public_catalogue(v_project),
    'signature', (select to_jsonb(s) from public.signatures s where s.order_id = v_order));
end $$;

-- S2: page lists per language only grow; reads are logged per language
drop function if exists public.public_signing_read(text, text, jsonb);
create or replace function public.public_signing_read(p_code text, p_section text, p_sections jsonb default null, p_lang text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.signing_links; v_lang text := case when p_lang in ('ar', 'en') then p_lang else 'xx' end; ok boolean;
begin
  select * into g from public.signing_links where code = private.parse_code(p_code) for update;
  if g.code is null then raise exception 'LINK_NOT_FOUND' using errcode = 'no_data_found'; end if;
  if g.status not in ('live','viewed') then return jsonb_build_object('sections', g.sections, 'read_log', g.read_log, 'pages', g.pages); end if;
  ok := jsonb_typeof(p_sections) = 'array' and jsonb_array_length(p_sections) between 1 and 200
        and not exists (select 1 from jsonb_array_elements(p_sections) e where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^p[0-9]{1,3}$');
  update public.signing_links set
    sections = case when ok then p_sections else sections end,
    pages = case when ok and jsonb_array_length(p_sections) > jsonb_array_length(coalesce(pages->v_lang, '[]'::jsonb))
                 then jsonb_set(pages, array[v_lang], p_sections) else pages end,
    read_log = case when nullif(p_section, '') is not null and p_section ~ '^p[0-9]{1,3}$'
                     and not exists (select 1 from jsonb_array_elements(read_log) e where e->>'id' = p_section and coalesce(e->>'lang', v_lang) = v_lang)
                    then read_log || jsonb_build_array(jsonb_build_object('id', p_section, 'lang', v_lang, 'at', now())) else read_log end
  where code = g.code returning * into g;
  return jsonb_build_object('sections', g.sections, 'read_log', g.read_log, 'pages', g.pages);
end $$;
revoke all on function public.public_signing_read(text, text, jsonb, text) from public;
grant execute on function public.public_signing_read(text, text, jsonb, text) to anon, authenticated, service_role;

-- S2 + S4
create or replace function public.public_signing_sign(p_code text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.signing_links; o public.orders; sig public.signatures; h text; unread int; nm text;
begin
  perform private.throttle('sign', 10);
  select * into g from public.signing_links where code = private.parse_code(p_code) for update;
  if g.code is null then raise exception 'LINK_NOT_FOUND' using errcode = 'no_data_found'; end if;
  if g.status in ('live','viewed') and g.valid_until < now() then
    update public.signing_links set status = 'expired' where code = g.code;
    raise exception 'LINK_CLOSED:expired' using errcode = 'check_violation';
  end if;
  if g.status not in ('live','viewed') then raise exception 'LINK_CLOSED:%', g.status using errcode = 'check_violation'; end if;
  select * into o from public.orders where id = g.order_id for update;
  if o.id is null or o.status <> 'issued' or exists (select 1 from public.signatures where order_id = o.id) then
    raise exception 'NOT_OPEN_FOR_SIGNING' using errcode = 'check_violation';
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
    'Unit ' || coalesce(o.unit_number, '') || ' · fingerprint ' || left(h, 12) || '…', '/sales');
  return jsonb_build_object('signature', to_jsonb(sig) - 'signature_data', 'orderId', o.id, 'status', o.status);
end $$;

-- ---------------------------------------------------------------------
-- Privileges for the new helpers (called only from SECURITY DEFINER code)
-- ---------------------------------------------------------------------
revoke all on function private.agreement_min_pages(text), private.read_complete(public.signing_links, int), private.over_limit(text, int),
  private.hit(text), private.throttle(text, int), private.apply_locks(jsonb, jsonb, jsonb), private.apply_locks_per_unit(jsonb, jsonb, jsonb, jsonb),
  private.current_signatory(text), private.dev_suspended(text) from public, anon, authenticated;
revoke all on private.public_hits from public, anon, authenticated;

commit;
