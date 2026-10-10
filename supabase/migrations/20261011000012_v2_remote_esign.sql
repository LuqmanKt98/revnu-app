-- =====================================================================
--  Revnu v2 — remote ordering, e-signature on the buyer's phone, the
--  rep's in-app inbox and the developer's pre-signed signatory block.
--  Additive only (the client is in UAT on this database).
--
--  Rules (client's prototype remote.js, approved 27 Sep 2026):
--   · Share links come in three modes:
--       units      the buyer orders every unit on the link
--       shortlist  the buyer picks one or more of the rep's units
--       type       public and multi-use: the buyer picks a unit TYPE (no
--                  unit numbers or prices leave the server); the inquiry is
--                  routed to one rep or round-robin over a pool
--   · A submission holds nothing. The rep's one-tap Accept creates the
--     order — which locks its units, like every order here — issues the
--     pre-signed agreement and opens a signing link. Competing pending
--     submissions for the same unit are declined automatically.
--   · The buyer reads every page and signs on their own phone. Time, IP,
--     device, the read log and a SHA-256 fingerprint of the deal are kept;
--     the order moves to "signed" with no upload.
--   · Anonymous visitors reach this data ONLY through the public_*
--     functions below, keyed by a 6-character code. The tables are never
--     readable by anon.
--
--  Names: our `leads` (marketing inquiries) and `notifications` (e-mail
--  outbox) already exist, so the remote leads are `sale_leads` and the
--  in-app inbox is `inbox_notifications`.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- Columns on existing tables
-- ---------------------------------------------------------------------
alter table public.orders     add column if not exists contract_hash text;   -- SHA-256 deal fingerprint at issue / signing
alter table public.developers add column if not exists signatory_updated_by_name text;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.sale_links (
  code              text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  slug              text,
  mode              text not null default 'units' check (mode in ('units','shortlist','type')),
  developer_id      text not null references public.developers(id) on delete cascade,
  project_id        text not null references public.projects(id) on delete cascade,
  unit_numbers      text[] not null default '{}',
  type_ids          text[],
  routing           jsonb,                       -- type mode: {kind:'single'|'round_robin', repIds:[uuid], pointer:int}
  rep_id            uuid references public.profiles(id) on delete set null,
  created_by        uuid references public.profiles(id) on delete set null,
  selections        jsonb not null default '{}',  -- the rep's pre-filled choices
  per_mode          boolean not null default false,
  per_unit          jsonb,
  locks             jsonb not null default '{}',  -- steps the buyer may not change
  lang              text not null default 'en' check (lang in ('en','ar')),
  title             text,
  customer_hint     jsonb,                       -- {name, mobile}: greets and pre-fills
  valid_until       timestamptz not null,
  status            text not null default 'live' check (status in ('live','submitted','expired','revoked')),
  opened_count      int not null default 0,
  opened_at         timestamptz,
  submission_count  int not null default 0,
  sent_via          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists sale_links_dev_idx on public.sale_links(developer_id, created_at desc);
create index if not exists sale_links_rep_idx on public.sale_links(rep_id);

create table if not exists public.sale_leads (
  id             uuid primary key default gen_random_uuid(),
  link_code      text not null references public.sale_links(code) on delete cascade,
  developer_id   text not null references public.developers(id) on delete cascade,
  project_id     text not null references public.projects(id) on delete cascade,
  rep_id         uuid references public.profiles(id) on delete set null,
  customer       jsonb not null default '{}',     -- {fullName, mobileCode, mobile}
  type_id        text,
  step           int not null default 0,
  status         text not null default 'started' check (status in ('started','submitted','dismissed')),
  submission_id  uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists sale_leads_dev_idx on public.sale_leads(developer_id, updated_at desc);
create index if not exists sale_leads_link_idx on public.sale_leads(link_code);

create table if not exists public.submissions (
  id              uuid primary key default gen_random_uuid(),
  link_code       text not null references public.sale_links(code) on delete cascade,
  mode            text not null default 'units' check (mode in ('units','shortlist','type')),
  developer_id    text not null references public.developers(id) on delete cascade,
  project_id      text not null references public.projects(id) on delete cascade,
  unit_numbers    text[] not null default '{}',
  type_id         text,
  per_mode        boolean not null default false,
  per_unit        jsonb,
  rep_id          uuid references public.profiles(id) on delete set null,
  customer        jsonb not null default '{}',     -- {fullName, nationalId, mobileCode, mobile, email, beneficiary, …}
  selections      jsonb not null default '{}',
  lead_id         uuid references public.sale_leads(id) on delete set null,
  consent_at      timestamptz not null default now(),
  terms_version   text,
  ip              text,
  user_agent      text,
  status          text not null default 'pending' check (status in ('pending','accepted','declined','auto_declined')),
  needs_unit      boolean not null default false,
  order_id        text references public.orders(id) on delete set null,
  decided_at      timestamptz,
  decided_by      uuid references public.profiles(id) on delete set null,
  decline_reason  text,
  assigned_at     timestamptz,
  assigned_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists submissions_dev_idx on public.submissions(developer_id, created_at desc);
create index if not exists submissions_link_idx on public.submissions(link_code);
create index if not exists submissions_pending_units_idx on public.submissions using gin (unit_numbers) where status = 'pending';

do $$ begin
  alter table public.sale_leads add constraint sale_leads_submission_fk foreign key (submission_id) references public.submissions(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.signing_links (
  code          text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  slug          text,
  order_id      text not null references public.orders(id) on delete cascade,
  developer_id  text not null references public.developers(id) on delete cascade,
  valid_until   timestamptz not null,
  status        text not null default 'live' check (status in ('live','viewed','signed','expired','revoked')),
  sections      jsonb not null default '[]',     -- page ids of the agreement as rendered on the phone
  read_log      jsonb not null default '[]',     -- [{id, at}] every page the buyer read
  opened_count  int not null default 0,
  opened_at     timestamptz,
  sent_via      text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists signing_links_order_idx on public.signing_links(order_id, created_at desc);

create table if not exists public.signatures (
  id               uuid primary key default gen_random_uuid(),
  order_id         text not null references public.orders(id) on delete cascade,
  signing_code     text references public.signing_links(code) on delete set null,
  signer_name      text not null,
  signer_id_last4  text,
  signature_data   text,                         -- PNG data URL drawn on the buyer's phone (null when typed)
  typed_name       text,
  document_hash    text not null,
  ip               text,
  user_agent       text,
  consent_at       timestamptz,
  terms_version    text,
  read_sections    jsonb not null default '[]',
  signed_at        timestamptz not null default now()
);
create unique index if not exists signatures_one_per_order on public.signatures(order_id);

create table if not exists public.inbox_notifications (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists inbox_user_idx on public.inbox_notifications(user_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['sale_links','sale_leads','submissions','signing_links']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
-- Effective permission of ANY profile (explicit perms, else the role's defaults).
create or replace function private.profile_has(p_user uuid, p text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles pr left join public.dev_roles dr on dr.id = pr.role
    where pr.id = p_user and pr.deleted_at is null and coalesce(pr.perms, dr.perms, '{}') @> array[p]
  );
$$;

-- Who sees a developer's remote pipeline: Revnu staff; a member with 'orders' sees
-- their own rows (as rep, creator or routing pool); 'team' / 'financials' see all.
create or replace function private.can_see_remote(p_dev text, p_rep uuid, p_created_by uuid, p_routing jsonb)
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_revnu()
      or (p_dev = private.my_dev() and private.dev_has('orders')
          and (p_rep = auth.uid() or p_created_by = auth.uid()
               or coalesce(p_routing->'repIds', '[]'::jsonb) ? auth.uid()::text
               or private.dev_has('team') or private.dev_has('financials')));
$$;

-- May the caller act on a remote row (accept / decline / assign / revoke)?
create or replace function private.can_act_remote(p_dev text, p_rep uuid, p_created_by uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select private.revnu_has('orders')
      or (p_dev = private.my_dev() and private.dev_has('orders')
          and (p_rep = auth.uid() or p_created_by = auth.uid() or private.dev_has('team')));
$$;

-- 6 characters from an alphabet with no 0/O/1/I, from a cryptographic source.
create or replace function private.short_code(p_kind text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea; s text; i int; taken boolean;
begin
  loop
    b := extensions.gen_random_bytes(6); s := '';
    for i in 0..5 loop s := s || substr(chars, 1 + (get_byte(b, i) % 32), 1); end loop;
    if p_kind = 'sign' then select exists (select 1 from public.signing_links where code = s) into taken;
    else select exists (select 1 from public.sale_links where code = s) into taken; end if;
    exit when not taken;
  end loop;
  return s;
end $$;

create or replace function private.slugify(p text)
returns text language sql immutable as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g')), ''), 'revnu');
$$;

-- "noor-khuzam-K7Q2MX" / "k7q2mx" -> "K7Q2MX"
create or replace function private.parse_code(p text)
returns text language sql immutable as $$
  select upper(regexp_replace(trim(coalesce(p, '')), '^.*-', ''));
$$;

create or replace function private.request_header(p text)
returns text language plpgsql stable as $$
declare h jsonb;
begin
  begin h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then return null; end;
  return h->>p;
end $$;

create or replace function private.request_ip()
returns text language sql stable as $$
  select nullif(trim(coalesce(nullif(split_part(coalesce(private.request_header('x-forwarded-for'), ''), ',', 1), ''),
                              private.request_header('cf-connecting-ip'), private.request_header('x-real-ip'), '')), '');
$$;

create or replace function private.inbox(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.inbox_notifications(user_id, kind, title, body, link)
  select p_user, p_kind, left(p_title, 300), left(p_body, 600), p_link where p_user is not null;
$$;

-- Project remote settings with the prototype's defaults; remote is ON unless switched off.
create or replace function private.remote_settings(p_project text)
returns jsonb language sql stable security definer set search_path = public as $$
  select '{"validityHours":48,"maxValidityHours":168,"allowChanges":true,"requireReadAll":true,"signingDays":7}'::jsonb
         || coalesce((select remote_settings from public.projects where id = p_project), '{}'::jsonb);
$$;
create or replace function private.remote_on(p_project text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = p_project and coalesce(features->>'remote', 'true') <> 'false');
$$;

-- Same rules as the wizard (VALID.nationalId / mobileIntl / email).
create or replace function private.valid_national_id(v text)
returns boolean language sql immutable as $$ select regexp_replace(coalesce(v, ''), '\s', '', 'g') ~ '^[12][0-9]{9}$' $$;
create or replace function private.valid_mobile(p_code text, v text)
returns boolean language sql immutable as $$
  select case
    when regexp_replace(coalesce(v, ''), '[\s-]', '', 'g') = '' then true
    when coalesce(nullif(p_code, ''), '+966') = '+966' and left(regexp_replace(v, '[\s-]', '', 'g'), 1) <> '+'
      then regexp_replace(v, '[\s-]', '', 'g') ~ '^(966|0)?5[0-9]{8}$'
    else regexp_replace(v, '[\s-]', '', 'g') ~ '^\+?[0-9]{6,13}$' end;
$$;
create or replace function private.valid_email(v text)
returns boolean language sql immutable as $$ select coalesce(trim(v), '') = '' or trim(v) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' $$;

-- Validate a buyer block from the phone and keep only the known fields.
create or replace function private.clean_customer(c jsonb)
returns jsonb language plpgsql immutable as $$
declare v_out jsonb;
begin
  if jsonb_typeof(c) is distinct from 'object' then raise exception 'NAME_REQUIRED' using errcode = 'check_violation'; end if;
  if length(trim(coalesce(c->>'fullName', ''))) < 2 then raise exception 'NAME_REQUIRED' using errcode = 'check_violation'; end if;
  if not private.valid_national_id(c->>'nationalId') then raise exception 'INVALID_NATIONAL_ID' using errcode = 'check_violation'; end if;
  if not private.valid_mobile(c->>'mobileCode', c->>'mobile') then raise exception 'INVALID_MOBILE' using errcode = 'check_violation'; end if;
  if not private.valid_email(c->>'email') then raise exception 'INVALID_EMAIL' using errcode = 'check_violation'; end if;
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_out
  from jsonb_each(c) as e(k, v)
  where k in ('fullName','fullNameAr','nationalId','mobileCode','mobile','email','city','dob','marital','funding','beneficiary','nationality')
    and length(v::text) <= 300;
  return v_out || jsonb_build_object('fullName', left(trim(c->>'fullName'), 120), 'nationalId', regexp_replace(c->>'nationalId', '\s', '', 'g'));
end $$;

-- SHA-256 of the deal: every fact of the order plus its units, minus what changes
-- through the lifecycle (status, dates, uploads, the hash itself).
create or replace function private.deal_fingerprint(p_order text)
returns text language sql stable security definer set search_path = public as $$
  select encode(extensions.digest(convert_to(
    (to_jsonb(o) - 'status' - 'signed_at' - 'paid_at' - 'updated_at' - 'contract_hash' - 'signed_contract_url' - 'payment_proof_url'
                 - 'cancelled_at' - 'cancel_reason' - 'cancelled_by' - 'status_before_cancel' - 'reinstated_at')::text
    || '|' || coalesce((select string_agg(ou.unit_number, ',' order by ou.sort) from public.order_units ou where ou.order_id = o.id), ''),
    'UTF8'), 'sha256'), 'hex')
  from public.orders o where o.id = p_order;
$$;

-- Round-robin pointer lives on the link (advanced atomically).
create or replace function private.pick_rep(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare l public.sale_links; pool uuid[]; idx int;
begin
  select * into l from public.sale_links where code = p_code for update;
  if l.code is null then return null; end if;
  if coalesce(l.routing->>'kind', 'single') <> 'round_robin' then
    return coalesce((l.routing->'repIds'->>0)::uuid, l.rep_id);
  end if;
  select coalesce(array_agg(r.id::uuid order by r.ord), '{}') into pool
  from jsonb_array_elements_text(coalesce(l.routing->'repIds', '[]'::jsonb)) with ordinality as r(id, ord)
  join public.profiles p on p.id = r.id::uuid and p.deleted_at is null;
  if array_length(pool, 1) is null then return l.rep_id; end if;
  idx := coalesce((l.routing->>'pointer')::int, 0) % array_length(pool, 1);
  update public.sale_links set routing = jsonb_set(routing, '{pointer}', to_jsonb((idx + 1) % array_length(pool, 1))) where code = l.code;
  return pool[idx + 1];
end $$;

-- A new signing link for an issued order (older open links are revoked).
create or replace function private.new_signing_link(p_order text, p_via text)
returns public.signing_links language plpgsql security definer set search_path = public as $$
declare o public.orders; g public.signing_links; days int;
begin
  select * into o from public.orders where id = p_order;
  days := greatest(1, least(60, coalesce((private.remote_settings(o.project_id)->>'signingDays')::int, 7)));
  update public.signing_links set status = 'revoked' where order_id = o.id and status in ('live','viewed');
  insert into public.signing_links(code, slug, order_id, developer_id, valid_until, sent_via, created_by)
  values (private.short_code('sign'), private.slugify((select name from public.projects where id = o.project_id)), o.id, o.developer_id,
          now() + make_interval(days => days), coalesce(nullif(p_via, ''), 'qr'), auth.uid())
  returning * into g;
  perform private.log_activity(o.id, 'signing_link', jsonb_build_object('code', g.code, 'via', g.sent_via, 'validUntil', g.valid_until));
  return g;
end $$;

-- Lazily expire an open link that passed its validity.
create or replace function private.expire_sale_link(p_code text)
returns void language sql security definer set search_path = public as $$
  update public.sale_links set status = 'expired' where code = p_code and status = 'live' and valid_until < now();
$$;
create or replace function private.expire_signing_link(p_code text)
returns void language sql security definer set search_path = public as $$
  update public.signing_links set status = 'expired' where code = p_code and status in ('live','viewed') and valid_until < now();
$$;

-- Is a unit tied to a live order right now?
create or replace function private.unit_taken(p_unit text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.order_units where unit_number = p_unit and is_live);
$$;

-- ---------------------------------------------------------------------
-- Order lifecycle: issuing fingerprints the deal
-- ---------------------------------------------------------------------
create or replace function private.orders_fingerprint_on_issue() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status is distinct from 'issued') then
    new.contract_hash := null;   -- set by the after-trigger once order_units exist
  end if;
  return new;
end $$;
-- (the fingerprint needs order_units, so it is taken AFTER the row and its units exist)
create or replace function private.orders_set_fingerprint() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'issued' and new.contract_hash is null then
    update public.orders set contract_hash = private.deal_fingerprint(new.id) where id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists orders_fingerprint_on_issue on public.orders;
create trigger orders_fingerprint_on_issue before insert or update of status on public.orders for each row execute function private.orders_fingerprint_on_issue();
drop trigger if exists orders_set_fingerprint on public.orders;
create constraint trigger orders_set_fingerprint after insert or update of status on public.orders
  deferrable initially deferred for each row execute function private.orders_set_fingerprint();

-- ---------------------------------------------------------------------
-- Rep side (authenticated)
-- ---------------------------------------------------------------------
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
    join public.profiles pr on pr.id::text = r.id and pr.developer_id = v_dev and pr.deleted_at is null and private.profile_has(pr.id, 'orders');
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
    if l.status = 'submitted' then raise exception 'LINK_CLOSED:%', l.status using errcode = 'check_violation'; end if;
    update public.sale_links
       set status = 'live', valid_until = greatest(valid_until, now()) + make_interval(hours => least(24 * 90, greatest(1, coalesce(p_hours, 48))))
     where code = l.code returning * into l;
  else
    raise exception 'unknown action %', p_action using errcode = 'check_violation';
  end if;
  return l;
end $$;

-- Public-link inquiry: after the call the rep picks the real unit(s).
create or replace function public.submission_assign_units(p_id uuid, p_units text[])
returns public.submissions language plpgsql security definer set search_path = public as $$
declare s public.submissions; n text;
begin
  select * into s from public.submissions where id = p_id for update;
  if s.id is null then raise exception 'submission not found' using errcode = 'no_data_found'; end if;
  if not private.can_act_remote(s.developer_id, s.rep_id, null) then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  if s.status <> 'pending' then raise exception 'SUBMISSION_CLOSED:%', s.status using errcode = 'check_violation'; end if;
  if p_units is null or array_length(p_units, 1) is null then raise exception 'PICK_UNITS' using errcode = 'check_violation'; end if;
  if (select count(*) from public.units where number = any(p_units) and project_id = s.project_id) <> array_length(p_units, 1) then
    raise exception 'unit does not belong to this project' using errcode = 'check_violation';
  end if;
  foreach n in array p_units loop
    if private.unit_taken(n) then raise exception 'UNIT_TAKEN:%', n using errcode = 'unique_violation'; end if;
  end loop;
  update public.submissions set unit_numbers = p_units, needs_unit = false, assigned_at = now(), assigned_by = auth.uid()
  where id = s.id returning * into s;
  return s;
end $$;

-- One-tap Accept: the order (for the submission's rep, the submission's buyer and units),
-- agreement issued pre-signed, signing link opened, competing submissions declined.
-- p carries the choices and prices the rep's app computed from the catalogue (the same
-- trust as an office order); buyer, units and attribution always come from the submission.
create or replace function public.submission_accept(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.submissions; o public.orders; g public.signing_links; other public.submissions; payload jsonb;
begin
  select * into s from public.submissions where id = p_id for update;
  if s.id is null then raise exception 'submission not found' using errcode = 'no_data_found'; end if;
  if not private.can_act_remote(s.developer_id, s.rep_id, null) then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  if s.status <> 'pending' then raise exception 'SUBMISSION_CLOSED:%', s.status using errcode = 'check_violation'; end if;
  if array_length(s.unit_numbers, 1) is null then raise exception 'ASSIGN_UNIT_FIRST' using errcode = 'check_violation'; end if;

  payload := (coalesce(p, '{}'::jsonb) - 'id' - 'status' - 'repId' - 'developerId' - 'source' - 'saleLinkCode' - 'submissionId')
    || jsonb_build_object(
         'projectId', s.project_id, 'unitNumbers', to_jsonb(s.unit_numbers), 'status', 'issued',
         'customer', s.customer, 'customerName', s.customer->>'fullName', 'customerId', s.customer->>'nationalId',
         'customerEmail', nullif(trim(coalesce(s.customer->>'email', '')), ''),
         'perUnitMode', s.per_mode and array_length(s.unit_numbers, 1) > 1,
         'perUnit', case when s.per_mode and array_length(s.unit_numbers, 1) > 1 then s.per_unit else null end);
  o := private.create_order_core(payload, s.developer_id, s.rep_id, 'remote', s.link_code, s.id);
  g := private.new_signing_link(o.id, 'whatsapp');

  update public.submissions set status = 'accepted', order_id = o.id, decided_at = now(), decided_by = auth.uid() where id = s.id;
  for other in select * from public.submissions x where x.id <> s.id and x.status = 'pending' and x.unit_numbers && s.unit_numbers for update loop
    update public.submissions set status = 'auto_declined', decided_at = now(), decided_by = auth.uid(), decline_reason = 'unit taken by ' || o.id where id = other.id;
    perform private.inbox(other.rep_id, 'auto_declined',
      coalesce(other.customer->>'fullName', '') || ' — ' || array_to_string(other.unit_numbers, ', ') || ' was taken',
      'Declined automatically when ' || o.id || ' was accepted. Offer alternatives.', '/sales');
  end loop;
  perform private.inbox(s.rep_id, 'accepted', o.id || ' created for ' || coalesce(s.customer->>'fullName', ''),
    'Agreement issued · signing link ' || g.code || ' ready', '/sales');
  return jsonb_build_object('orderId', o.id, 'signingCode', g.code, 'validUntil', g.valid_until);
end $$;

create or replace function public.submission_decline(p_id uuid, p_reason text default null)
returns public.submissions language plpgsql security definer set search_path = public as $$
declare s public.submissions;
begin
  select * into s from public.submissions where id = p_id for update;
  if s.id is null then raise exception 'submission not found' using errcode = 'no_data_found'; end if;
  if not private.can_act_remote(s.developer_id, s.rep_id, null) then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  if s.status <> 'pending' then return s; end if;
  update public.submissions set status = 'declined', decided_at = now(), decided_by = auth.uid(), decline_reason = nullif(left(trim(coalesce(p_reason, '')), 300), '')
  where id = s.id returning * into s;
  return s;
end $$;

create or replace function public.signing_link_create(p_order text, p_via text default 'qr')
returns public.signing_links language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'order not found' using errcode = 'no_data_found'; end if;
  if not private.can_act_on_order(o.developer_id) then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  if o.status <> 'issued' or exists (select 1 from public.signatures where order_id = o.id) then
    raise exception 'NOT_OPEN_FOR_SIGNING' using errcode = 'check_violation';
  end if;
  return private.new_signing_link(o.id, p_via);
end $$;

-- Buyer edits before signing: the agreement re-issues with the corrected details
-- (the open signing link keeps working and shows the new text).
create or replace function public.update_order_customer(p_order text, p jsonb)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders; c jsonb; changed text[];
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'order not found' using errcode = 'no_data_found'; end if;
  if not (private.can_act_on_order(o.developer_id) and (o.rep_id = auth.uid() or private.dev_has('team') or private.revnu_has('orders'))) then
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

-- Pre-signed developer block: signatory, signature and stamp, set once per developer.
create or replace function public.set_signatory(p_dev text, p jsonb)
returns public.developers language plpgsql security definer set search_path = public as $$
declare d public.developers; k text;
begin
  if not (private.revnu_has('developers') or (p_dev = private.my_dev() and private.dev_has('contracts'))) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  foreach k in array array['signature','stamp'] loop
    if p ? k and coalesce(p->>k, '') <> '' then
      if not ((p->>k) ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' or (p->>k) ~ '^/brand/[A-Za-z0-9._/-]+$' or (p->>k) ~ '^https://[^\s"<>]+$') then
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

create or replace function public.inbox_mark_read(p_ids bigint[] default null)
returns void language sql security definer set search_path = public as $$
  update public.inbox_notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
$$;

-- ---------------------------------------------------------------------
-- Public side (anon, keyed by code)
-- ---------------------------------------------------------------------
-- Developer / project / rep as a buyer may see them (no billing, terms or internal commercials).
create or replace function private.public_developer(p_dev text, p_presigned boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(d) - 'plan' - 'revnu_terms' - 'master_agreement' - 'primary_email' - 'signatory_updated_by'
         - case when p_presigned then 'x' else 'signature' end - case when p_presigned then 'x' else 'stamp' end
  from public.developers d where d.id = p_dev;
$$;
create or replace function private.public_project(p_project text)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(p) - 'commercials' - 'revnu_terms' from public.projects p where p.id = p_project;
$$;
create or replace function private.public_rep(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'developer_id', p.developer_id, 'name', p.name, 'name_ar', p.name_ar, 'mobile', p.mobile, 'role', p.role)
  from public.profiles p where p.id = p_user and p.deleted_at is null;
$$;
-- Every catalogue table of a project (rows as stored; mapped in the browser).
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
    'contractVars',     (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort), '[]') from public.contract_vars x));
$$;

-- The buyer's phone: link + catalogue + the rep's pre-fill. Type mode: no units, no unit prices.
create or replace function public.public_link_view(p_code text, p_open boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.sale_links; sub jsonb;
begin
  select * into l from public.sale_links where code = private.parse_code(p_code);
  if l.code is null then return jsonb_build_object('status', 'not_found'); end if;
  perform private.expire_sale_link(l.code);
  if p_open then
    update public.sale_links set opened_count = opened_count + 1, opened_at = coalesce(opened_at, now()) where code = l.code;
  end if;
  select * into l from public.sale_links where code = l.code;
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

-- Lightweight poll for the "Sent to <rep>" screen.
create or replace function public.public_link_status(p_code text, p_submission uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.sale_links; s public.submissions;
begin
  select * into l from public.sale_links where code = private.parse_code(p_code);
  if l.code is null then return jsonb_build_object('status', 'not_found'); end if;
  perform private.expire_sale_link(l.code);
  select * into l from public.sale_links where code = l.code;
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

-- A public-link visitor gives name + mobile and presses Start: routed to a rep at once.
create or replace function public.public_lead_start(p_code text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.sale_links; ld public.sale_leads; nm text; mob text; v_cc text; rep uuid;
begin
  select * into l from public.sale_links where code = private.parse_code(p_code);
  if l.code is null then raise exception 'LINK_NOT_FOUND' using errcode = 'no_data_found'; end if;
  perform private.expire_sale_link(l.code);
  select * into l from public.sale_links where code = l.code;
  if l.status <> 'live' then raise exception 'LINK_CLOSED:%', l.status using errcode = 'check_violation'; end if;
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

create or replace function public.public_lead_update(p_code text, p_lead uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ld public.sale_leads;
begin
  select * into ld from public.sale_leads where id = p_lead and link_code = private.parse_code(p_code);
  if ld.id is null then raise exception 'LINK_NOT_FOUND' using errcode = 'no_data_found'; end if;
  if ld.status <> 'started' then return to_jsonb(ld); end if;
  update public.sale_leads set
    type_id = case when p ? 'typeId' and exists (select 1 from public.unit_types t where t.id = p->>'typeId' and t.project_id = ld.project_id) then p->>'typeId' else type_id end,
    step = case when p ? 'step' then least(50, greatest(0, coalesce((p->>'step')::int, step))) else step end
  where id = ld.id returning * into ld;
  return to_jsonb(ld);
end $$;

-- The buyer submits (all three modes). Prices are never taken from the phone.
create or replace function public.public_link_submit(p_code text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.sale_links; s public.submissions; ld public.sale_leads; chosen text[]; tid text; rep uuid; c jsonb; n text; what text;
begin
  select * into l from public.sale_links where code = private.parse_code(p_code) for update;
  if l.code is null then raise exception 'LINK_NOT_FOUND' using errcode = 'no_data_found'; end if;
  if l.status = 'live' and l.valid_until < now() then
    update public.sale_links set status = 'expired' where code = l.code returning * into l;
  end if;
  if l.status <> 'live' then raise exception 'LINK_CLOSED:%', l.status using errcode = 'check_violation'; end if;
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
      case when coalesce((p->>'perMode')::boolean, false) and array_length(chosen, 1) > 1 and jsonb_typeof(p->'perUnit') = 'object' then p->'perUnit' else null end,
      rep, c, case when jsonb_typeof(p->'selections') = 'object' then p->'selections' else '{}'::jsonb end, ld.id,
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

-- The signing page: the order as issued, everything the agreement prints, and the developer's pre-signed block.
create or replace function public.public_signing_view(p_code text, p_open boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.signing_links; o jsonb; v_order text; v_project text; v_dev text; v_rep uuid; v_units text[];
begin
  select * into g from public.signing_links where code = private.parse_code(p_code);
  if g.code is null then return jsonb_build_object('status', 'not_found'); end if;
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
  return jsonb_build_object(
    'status', g.status,
    'link', to_jsonb(g) - 'created_by',
    'order', o,
    'activity', (select coalesce(jsonb_agg(to_jsonb(a) order by a.at), '[]') from public.order_activity a where a.order_id = v_order and a.event in ('created','status','signing_link','customer_edit','signed')),
    'developer', private.public_developer(v_dev, true),
    'project', private.public_project(v_project),
    'rep', private.public_rep(v_rep),
    'units', (select coalesce(jsonb_agg(to_jsonb(u) order by array_position(v_units, u.number)), '[]') from public.units u where u.number = any(v_units)),
    'unitTypes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from public.unit_types t where t.id in (select u.type_id from public.units u where u.number = any(v_units))),
    'catalogue', private.public_catalogue(v_project),
    'signature', (select to_jsonb(s) from public.signatures s where s.order_id = v_order));
end $$;

create or replace function public.public_signing_read(p_code text, p_section text, p_sections jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.signing_links;
begin
  select * into g from public.signing_links where code = private.parse_code(p_code) for update;
  if g.code is null then raise exception 'LINK_NOT_FOUND' using errcode = 'no_data_found'; end if;
  if g.status not in ('live','viewed') then return jsonb_build_object('sections', g.sections, 'read_log', g.read_log); end if;
  update public.signing_links set
    sections = case when jsonb_array_length(sections) = 0 and jsonb_typeof(p_sections) = 'array' and jsonb_array_length(p_sections) between 1 and 200
                    then p_sections else sections end,
    read_log = case when nullif(p_section, '') is not null and length(p_section) <= 40
                     and not exists (select 1 from jsonb_array_elements(read_log) e where e->>'id' = p_section)
                    then read_log || jsonb_build_array(jsonb_build_object('id', p_section, 'at', now())) else read_log end
  where code = g.code returning * into g;
  return jsonb_build_object('sections', g.sections, 'read_log', g.read_log);
end $$;

create or replace function public.public_signing_sign(p_code text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.signing_links; o public.orders; sig public.signatures; h text; unread int; nm text;
begin
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
    select count(*) into unread from jsonb_array_elements_text(g.sections) s(id)
    where not exists (select 1 from jsonb_array_elements(g.read_log) r where r->>'id' = s.id);
    if jsonb_array_length(g.sections) = 0 or unread > 0 then raise exception 'READ_ALL:%', unread using errcode = 'check_violation'; end if;
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
-- Row Level Security (writes only through the functions above)
-- ---------------------------------------------------------------------
alter table public.sale_links          enable row level security;
alter table public.sale_leads          enable row level security;
alter table public.submissions         enable row level security;
alter table public.signing_links       enable row level security;
alter table public.signatures          enable row level security;
alter table public.inbox_notifications enable row level security;

drop policy if exists "remote read" on public.sale_links;
create policy "remote read" on public.sale_links for select to authenticated
  using ((select private.can_see_remote(developer_id, rep_id, created_by, routing)));
drop policy if exists "remote read" on public.sale_leads;
create policy "remote read" on public.sale_leads for select to authenticated
  using ((select private.can_see_remote(developer_id, rep_id, null, null)));
drop policy if exists "remote read" on public.submissions;
create policy "remote read" on public.submissions for select to authenticated
  using ((select private.can_see_remote(developer_id, rep_id, null, null)));
drop policy if exists "signing read" on public.signing_links;
create policy "signing read" on public.signing_links for select to authenticated
  using ((select private.can_read_dev(developer_id)));
drop policy if exists "signature read" on public.signatures;
create policy "signature read" on public.signatures for select to authenticated
  using ((select private.can_read_dev(private.order_dev(order_id))));
drop policy if exists "inbox read" on public.inbox_notifications;
create policy "inbox read" on public.inbox_notifications for select to authenticated using (user_id = auth.uid());

grant select on public.sale_links, public.sale_leads, public.submissions, public.signing_links, public.signatures, public.inbox_notifications to authenticated;
revoke all on public.sale_links, public.sale_leads, public.submissions, public.signing_links, public.signatures, public.inbox_notifications from anon;

-- Views expand o.* at creation time: rebuild so contract_hash appears.
drop view if exists public.orders_v;
create view public.orders_v with (security_invoker = true) as
  select o.*,
         coalesce((select array_agg(ou.unit_number order by ou.sort) from public.order_units ou where ou.order_id = o.id), '{}'::text[]) as unit_numbers
  from public.orders o;
grant select on public.orders_v to authenticated;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
revoke all on function private.short_code(text), private.pick_rep(text), private.new_signing_link(text, text), private.inbox(uuid, text, text, text, text),
  private.deal_fingerprint(text), private.clean_customer(jsonb), private.expire_sale_link(text), private.expire_signing_link(text),
  private.public_developer(text, boolean), private.public_project(text), private.public_rep(uuid), private.public_catalogue(text)
  from public, anon, authenticated;

revoke all on function public.sale_link_create(jsonb), public.sale_link_set(text, text, int), public.submission_assign_units(uuid, text[]),
  public.submission_accept(uuid, jsonb), public.submission_decline(uuid, text), public.signing_link_create(text, text),
  public.update_order_customer(text, jsonb), public.set_signatory(text, jsonb), public.inbox_mark_read(bigint[]) from public, anon;
grant execute on function public.sale_link_create(jsonb), public.sale_link_set(text, text, int), public.submission_assign_units(uuid, text[]),
  public.submission_accept(uuid, jsonb), public.submission_decline(uuid, text), public.signing_link_create(text, text),
  public.update_order_customer(text, jsonb), public.set_signatory(text, jsonb), public.inbox_mark_read(bigint[]) to authenticated, service_role;

revoke all on function public.public_link_view(text, boolean), public.public_link_status(text, uuid), public.public_lead_start(text, jsonb),
  public.public_lead_update(text, uuid, jsonb), public.public_link_submit(text, jsonb), public.public_signing_view(text, boolean),
  public.public_signing_read(text, text, jsonb), public.public_signing_sign(text, jsonb) from public;
grant execute on function public.public_link_view(text, boolean), public.public_link_status(text, uuid), public.public_lead_start(text, jsonb),
  public.public_lead_update(text, uuid, jsonb), public.public_link_submit(text, jsonb), public.public_signing_view(text, boolean),
  public.public_signing_read(text, text, jsonb), public.public_signing_sign(text, jsonb) to anon, authenticated, service_role;

-- Noor Khuzam: remote ordering on (the prototype's pilot default).
update public.projects set features = jsonb_build_object('remote', true) || features where id = 'nk-noor-khuzam' and not (features ? 'remote');

commit;
