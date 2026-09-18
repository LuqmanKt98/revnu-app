-- =====================================================================
--  Revnu — core schema (Phase 1)
--  Entities ported 1:1 from the prototype's data.js, with real relations.
--  Text primary keys are kept wherever the UI displays or constructs the
--  id (order refs, unit numbers, unit-type codes, developer slugs).
--  People are UUIDs (= auth.users.id).
-- =====================================================================
create extension if not exists citext;
create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Reference tables (single source of truth for UI labels AND RLS defaults)
-- ---------------------------------------------------------------------
create table public.dev_perms (
  id   text primary key,
  en   text not null,
  ar   text not null,
  sort int  not null default 0
);
create table public.dev_roles (
  id    text primary key,
  en    text not null,
  ar    text not null,
  perms text[] not null default '{}',
  sort  int  not null default 0
);
create table public.revnu_perms (
  id   text primary key,
  en   text not null,
  ar   text not null,
  sort int  not null default 0
);
create table public.revnu_roles (
  id    text primary key,
  en    text not null,
  ar    text not null,
  perms text[] not null default '{}',
  sort  int  not null default 0
);
create table public.contract_vars (
  code     text primary key,
  en       text not null,
  ar       text not null,
  is_block boolean not null default false,
  sort     int not null default 0
);

-- ---------------------------------------------------------------------
-- Developers (partners) + their commission ladder
-- ---------------------------------------------------------------------
create table public.developers (
  id                          text primary key check (id ~ '^[a-z0-9][a-z0-9-]*$'),
  name                        text not null,
  name_ar                     text,
  legal_name                  text,
  legal_name_ar               text,
  initials                    text,
  domain                      text,
  cr_number                   text,
  vat                         text,
  primary_contact             text,
  primary_email               citext,
  authorized_signer           text,
  authorized_signer_ar        text,
  authorized_signer_title     text,
  authorized_signer_title_ar  text,
  brand                       jsonb not null default '{"primary":"#4A8FE7","deep":"#2D6BC4","soft":"rgba(74,143,231,0.10)","text":"#FFFFFF"}',
  logo                        text,
  logo_dark                   text,
  tagline                     text,
  tagline_ar                  text,
  city                        text,
  onboarded                   date,
  master_agreement            jsonb,
  revnu_terms                 jsonb,            -- { preHandoverMonths, milestones:[{id,label,labelAr,pct,trigger}] } ; null = platform default
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create trigger developers_touch before update on public.developers for each row execute function private.touch_updated_at();

-- The ONLY object anonymous visitors may read: brand chrome for the white-labelled sign-in page.
create view public.developers_public with (security_invoker = false) as
  select id, name, name_ar, initials, domain, brand, logo, logo_dark, tagline, tagline_ar
  from public.developers;

create table public.commission_levels (
  developer_id text not null references public.developers(id) on delete cascade,
  id           text not null,
  name         text not null,
  name_ar      text,
  pct          numeric(6,2) not null default 0,
  scope        text not null default 'own' check (scope in ('own','team','all')),
  sort         int  not null default 0,
  primary key (developer_id, id)
);

-- ---------------------------------------------------------------------
-- Projects and per-project catalogue
-- ---------------------------------------------------------------------
create table public.projects (
  id              text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9-]*$'),
  developer_id    text not null references public.developers(id) on delete restrict,
  name            text not null,
  name_ar         text,
  city            text,
  city_ar         text,
  delivery        text,
  total_units     int,
  hero_img        text,
  aerial_img      text,
  masterplan_img  text,
  locator_img     text,
  tagline         text,
  tagline_ar      text,
  blocks          text[] not null default '{}',
  features        jsonb  not null default '{"furnishing":true,"smartHome":true,"operations":true,"fitout":false}',
  optional        jsonb  not null default '{}',
  commercials     jsonb  not null default '{"customerOpsFeePct":20,"developerOpsSharePct":0,"salesCommission":{"kind":"pct","value":0},"contractMarkup":{"kind":"pct","value":0}}',
  revnu_terms     jsonb,            -- per-project override of the developer's terms
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index projects_developer_idx on public.projects(developer_id);
create trigger projects_touch before update on public.projects for each row execute function private.touch_updated_at();

create table public.unit_types (
  id              text primary key,
  project_id      text not null references public.projects(id) on delete cascade,
  name            text not null,
  name_ar         text,
  bedrooms        int  not null default 1,
  baths           int  not null default 1,
  area            numeric(10,2) not null default 0,
  base_price      bigint not null default 0,
  units           int,
  levels          int,
  level_names     text[],
  level_names_ar  text[],
  floor_plan_img  text,
  floor_plans     jsonb,            -- [{label,labelAr,src}]
  masterplan_img  text,
  render_3d_img   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index unit_types_project_idx on public.unit_types(project_id);
create trigger unit_types_touch before update on public.unit_types for each row execute function private.touch_updated_at();

create table public.units (
  number      text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  type_id     text not null references public.unit_types(id) on delete restrict,
  block       text,
  tower       text,
  floor       int,
  view        text,
  status      text not null default 'available' check (status in ('available','reserved','sold')),
  price_adj   bigint not null default 0,
  price_ben   bigint,
  area        numeric(10,2),
  baths       int,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index units_project_status_idx on public.units(project_id, status);
create index units_type_idx on public.units(type_id);
create trigger units_touch before update on public.units for each row execute function private.touch_updated_at();

create table public.design_styles (
  id              text primary key,
  project_id      text not null references public.projects(id) on delete cascade,
  name            text not null,
  name_ar         text,
  materials       text[] not null default '{}',
  materials_ar    text[] not null default '{}',
  mood            text,
  mood_ar         text,
  palette         text[],
  palettes        jsonb,            -- [{id,name,nameAr,colors[]}]
  palette_note    text,
  palette_note_ar text,
  images          jsonb,            -- [{id,label,labelAr,src}]
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index design_styles_project_idx on public.design_styles(project_id);
create trigger design_styles_touch before update on public.design_styles for each row execute function private.touch_updated_at();

create table public.packages (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  design_id   text references public.design_styles(id) on delete set null,
  name        text not null,
  name_ar     text,
  tier        text,
  tier_ar     text,
  summary     text,
  summary_ar  text,
  pieces      int,
  warranty    int,
  priced      boolean not null default true,
  pricing     jsonb not null default '{}',   -- { [unitTypeId]: price }
  boq         jsonb not null default '[]',   -- [{room,roomAr,item,itemAr,notes,qty,supplier,unitPrice?}]
  boq_by_type jsonb,                         -- { [unitTypeId]: boq[] }
  fitout      jsonb,                         -- { name, nameAr, boq[] }
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index packages_project_idx on public.packages(project_id);
create trigger packages_touch before update on public.packages for each row execute function private.touch_updated_at();

create table public.smart_home (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  name        text not null,
  name_ar     text,
  price       bigint not null default 0,
  level       int  not null default 1,
  summary     text,
  summary_ar  text,
  includes    text[] not null default '{}',
  includes_ar text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index smart_home_project_idx on public.smart_home(project_id);
create trigger smart_home_touch before update on public.smart_home for each row execute function private.touch_updated_at();

create table public.ops_models (
  id            text primary key,
  project_id    text not null references public.projects(id) on delete cascade,
  name          text not null,
  name_ar       text,
  kind          text not null default 'monthly' check (kind in ('daily','monthly')),
  mgmt_fee      numeric(6,2) not null default 0,
  target_roi    numeric(6,2),
  occ_low       int,
  occ_high      int,
  summary       text,
  summary_ar    text,
  default_rate  jsonb not null default '{}',  -- { [unitTypeId]: rate }
  assume        jsonb not null default '{}',  -- { [unitTypeId]: {occ, risk} }
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index ops_models_project_idx on public.ops_models(project_id);
create trigger ops_models_touch before update on public.ops_models for each row execute function private.touch_updated_at();

create table public.construction_milestones (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  sort        int  not null default 0,
  name        text not null,
  name_ar     text,
  "when"      text,
  date        date
);
create index construction_milestones_project_idx on public.construction_milestones(project_id);

create table public.payment_plans (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  name        text,
  name_ar     text,
  milestones  jsonb not null default '[]',   -- [{pct, mileId, label?}]
  schedule    text
);
create index payment_plans_project_idx on public.payment_plans(project_id);

create table public.contract_templates (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  kind        text not null default 'sale',
  lang        text not null default 'both',
  version     text not null default 'v1.0',
  required    boolean not null default false,
  name        text,
  name_ar     text,
  body        text,
  body_ar     text,
  updated     date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index contract_templates_project_idx on public.contract_templates(project_id);
create trigger contract_templates_touch before update on public.contract_templates for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
-- People. developer_id NULL  => Revnu HQ staff (revnu_role_id required)
--         developer_id set   => a developer's team member
-- `perms` NULL => fall back to the role's default permissions (dev_roles / revnu_roles)
-- ---------------------------------------------------------------------
create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  legacy_id             text unique,
  developer_id          text references public.developers(id) on delete restrict,
  name                  text not null,
  name_ar               text,
  email                 citext not null unique,
  role                  text,             -- dev_roles.id when known, otherwise a free-text title (as in the prototype)
  role_ar               text,
  revnu_role_id         text references public.revnu_roles(id),
  perms                 text[],
  commission_level_id   text,
  reports_to            uuid references public.profiles(id) on delete set null,
  bank                  jsonb,
  must_change_password  boolean not null default false,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint profiles_revnu_xor_dev check ((developer_id is null) = (revnu_role_id is not null)),
  constraint profiles_commission_level_fk
    foreign key (developer_id, commission_level_id) references public.commission_levels(developer_id, id) on delete set null
);
create index profiles_developer_idx on public.profiles(developer_id);
create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();

-- reports_to must stay inside the same developer
create or replace function private.profiles_guard() returns trigger
language plpgsql as $$
declare mgr_dev text;
begin
  if new.reports_to is not null then
    select developer_id into mgr_dev from public.profiles where id = new.reports_to;
    if mgr_dev is distinct from new.developer_id then
      raise exception 'reports_to must belong to the same developer' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard before insert or update on public.profiles for each row execute function private.profiles_guard();

create table public.profile_projects (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  project_id  text not null references public.projects(id) on delete cascade,
  primary key (profile_id, project_id)
);

-- ---------------------------------------------------------------------
-- Orders (the sale) — writes happen ONLY through the RPCs in 0003
-- ---------------------------------------------------------------------
create sequence public.order_seq start 231;   -- prototype seed max was 230; ids are never reused
create sequence public.ticket_seq start 1;

create table public.orders (
  id                    text primary key,
  developer_id          text not null references public.developers(id) on delete restrict,
  project_id            text not null references public.projects(id) on delete restrict,
  rep_id                uuid references public.profiles(id) on delete set null,
  status                text not null default 'active'
                        check (status in ('active','issued','signed','paid','completed','cancelled')),
  unit_number           text references public.units(number) on delete restrict,   -- primary unit (first of order_units)
  customer_name         text,
  customer_national_id  text,
  customer_email        citext,
  customer              jsonb not null default '{}',   -- full intake form (fullName, fullNameAr, nationalId, dob, mobile, email, city, marital, funding, beneficiary)
  per_unit_mode         boolean not null default false,
  per_unit              jsonb,                          -- { [unitNumber]: {designId, paletteId, packageId, smartId, fitout, opsId} }
  package_id            text references public.packages(id) on delete set null,
  design_id             text references public.design_styles(id) on delete set null,
  palette_id            text,
  smart_id              text references public.smart_home(id) on delete set null,
  ops_id                text references public.ops_models(id) on delete set null,
  fitout                boolean not null default false,
  fitout_cost           bigint not null default 0,
  unit_price            bigint not null default 0,
  furnish_cost          bigint not null default 0,
  operator_fee          numeric(6,2) not null default 0,
  monthly_net           bigint not null default 0,
  signed_contract_url   text,      -- display name of the uploaded signed agreement
  payment_proof_url     text,      -- display name of the uploaded proof of payment
  signed_at             date,
  paid_at               date,
  cancelled_at          timestamptz,
  cancel_reason         text,
  cancelled_by          text,
  status_before_cancel  text,
  reinstated_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index orders_developer_status_idx on public.orders(developer_id, status);
create index orders_project_idx on public.orders(project_id);
create index orders_rep_idx on public.orders(rep_id);
create trigger orders_touch before update on public.orders for each row execute function private.touch_updated_at();

create table public.order_units (
  order_id     text not null references public.orders(id) on delete cascade,
  unit_number  text not null references public.units(number) on delete restrict,
  sort         int  not null default 0,
  is_live      boolean not null default true,     -- denormalised from orders.status (maintained by trigger)
  primary key (order_id, unit_number)
);
-- A unit can be in at most ONE live order. This is the structural fix for audit bug B-01.
create unique index order_units_one_live_order_per_unit on public.order_units(unit_number) where is_live;

create or replace function private.order_units_sync_live() returns trigger
language plpgsql as $$
begin
  update public.order_units set is_live = (new.status <> 'cancelled') where order_id = new.id;
  return new;
end $$;
create trigger orders_sync_units after update of status on public.orders for each row execute function private.order_units_sync_live();

-- Units are locked by LIVE orders (not by a stored flag) — the prototype's _syncUnitLocks(), now transactional.
create or replace function private.sync_unit_status(p_unit text) returns void
language plpgsql security definer set search_path = public as $$
declare live boolean;
begin
  select exists(select 1 from public.order_units where unit_number = p_unit and is_live) into live;
  if live then
    update public.units set status = 'sold' where number = p_unit and status <> 'sold';
  else
    update public.units set status = 'available' where number = p_unit and status = 'sold';
  end if;
end $$;

create or replace function private.order_units_after_change() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then perform private.sync_unit_status(old.unit_number); return old; end if;
  perform private.sync_unit_status(new.unit_number);
  return new;
end $$;
create trigger order_units_lock after insert or update or delete on public.order_units for each row execute function private.order_units_after_change();

create table public.order_activity (
  id          bigserial primary key,
  order_id    text not null references public.orders(id) on delete cascade,
  at          timestamptz not null default now(),
  event       text not null,
  by_user_id  uuid,
  by_name     text,
  extra       jsonb not null default '{}'
);
create index order_activity_order_idx on public.order_activity(order_id, at);

-- Uploaded files live in Storage; this table is the index (one row per object).
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  order_id      text not null references public.orders(id) on delete cascade,
  kind          text not null check (kind in ('signed_contract','payment_proof','transfer_proof')),
  milestone_id  text,                              -- for transfer_proof: which receivable milestone
  storage_path  text not null unique,
  file_name     text not null,
  mime          text,
  size          bigint,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index documents_order_idx on public.documents(order_id, kind);

create table public.invoices (
  order_id   text primary key references public.orders(id) on delete cascade,
  issued_at  date not null default current_date
);

create table public.receivable_paid (
  order_id      text not null references public.orders(id) on delete cascade,
  milestone_id  text not null,
  paid_at       timestamptz not null default now(),
  document_id   uuid references public.documents(id) on delete set null,
  marked_by     uuid references public.profiles(id) on delete set null,
  primary key (order_id, milestone_id)
);

create table public.payouts (
  order_id    text not null references public.orders(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  level_id    text not null,
  status      text not null default 'pending' check (status in ('pending','paid')),
  updated_at  timestamptz not null default now(),
  primary key (order_id, user_id, level_id)
);

-- Email outbox. Rows are created by order transitions; /api/notifications/dispatch sends them.
create table public.notifications (
  id          bigserial primary key,
  order_id    text references public.orders(id) on delete cascade,
  kind        text not null,                  -- issued | signed | paid | invite | ...
  channel     text not null default 'email',
  to_email    citext,
  subject     text,
  subject_ar  text,
  payload     jsonb not null default '{}',
  status      text not null default 'queued' check (status in ('queued','logged','sent','failed')),
  error       text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index notifications_status_idx on public.notifications(status, created_at);

-- ---------------------------------------------------------------------
-- Support tickets + marketing leads
-- ---------------------------------------------------------------------
create table public.support_tickets (
  id            text primary key,
  type          text not null default 'question',
  subject       text not null,
  body          text,
  status        text not null default 'open' check (status in ('open','in_progress','resolved')),
  by_user_id    uuid references public.profiles(id) on delete set null,
  by_name       text,
  by_email      citext,
  developer_id  text references public.developers(id) on delete set null,
  page          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger support_tickets_touch before update on public.support_tickets for each row execute function private.touch_updated_at();

create table public.ticket_replies (
  id          bigserial primary key,
  ticket_id   text not null references public.support_tickets(id) on delete cascade,
  at          timestamptz not null default now(),
  by_user_id  uuid references public.profiles(id) on delete set null,
  by_name     text,
  text        text not null
);
create index ticket_replies_ticket_idx on public.ticket_replies(ticket_id, at);

create table public.leads (
  id          text primary key,
  created_at  timestamptz not null default now(),
  name        text,
  role        text,
  company     text,
  email       citext,
  phone       text,
  city        text,
  units       text,
  notes       text,
  status      text not null default 'new' check (status in ('new','qualified','in_proposal','onboarded','passed'))
);

-- ---------------------------------------------------------------------
-- Migration bookkeeping (used by scripts/db-apply.mjs via the Management API)
-- ---------------------------------------------------------------------
create table if not exists private.applied_migrations (
  name        text primary key,
  applied_at  timestamptz not null default now()
);
