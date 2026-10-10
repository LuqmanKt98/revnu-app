-- =====================================================================
--  Revnu v2 — new catalogue dimensions + order fields (client prototype, Oct 2026)
--
--  Additive only: the live app keeps working before the new UI ships.
--    · catalogue tables: flooring_finishes, flooring_zones, kitchens,
--      ac_systems, cooling_points, layout_options (same RLS as packages)
--    · projects: customisation deadlines, layout rates, remote settings
--    · developers: billing plan, pre-signed signatory (signature + stamp)
--    · profiles: mobile (the rep's WhatsApp / call number shown to buyers)
--    · orders: kitchen / AC / flooring / layout choices and their costs,
--      the agreement snapshot, and where the order came from (office/remote)
--    · contract_vars: the 35 new variables (59 total, client's order)
--    · create_order() now takes the new fields and enforces the layout /
--      flooring deadlines; its body moves into private.create_order_core()
--      so the remote "Accept" path (next migration) reuses the same rules.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- Projects / developers / profiles
-- ---------------------------------------------------------------------
alter table public.projects
  add column if not exists layout_deadline   date,
  add column if not exists flooring_deadline date,
  add column if not exists layout_rates      jsonb,     -- { wallPerM, doorPrice } ex-VAT; null = platform default
  add column if not exists remote_settings   jsonb;     -- { validityHours, maxValidityHours, allowChanges, requireReadAll, signingDays }

alter table public.developers
  add column if not exists plan                  jsonb,   -- Revnu billing plan: { onboarding, projectSetup, annual } each { mode, waiveYears?, reason? }
  add column if not exists signature             text,    -- authorised signatory's signature image (pre-signs every agreement)
  add column if not exists stamp                 text,    -- company stamp image
  add column if not exists signatory_updated_at  timestamptz,
  add column if not exists signatory_updated_by  uuid references public.profiles(id) on delete set null;

alter table public.profiles add column if not exists mobile text;

-- ---------------------------------------------------------------------
-- Catalogue tables
-- ---------------------------------------------------------------------
create table if not exists public.flooring_finishes (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  family      text not null default 'tile' check (family in ('tile','marble','parquet')),
  standard    boolean not null default false,     -- delivered at no cost; never "chosen"
  name        text not null,
  name_ar     text,
  swatch      text,                               -- fallback colour until a photo is uploaded
  image       text,
  summary     text,
  summary_ar  text,
  sizes       jsonb not null default '[]',        -- [{ id, label, labelAr, uplift }]  uplift = SAR/m² ex-VAT
  zones       text[] not null default '{}',       -- allowed zone ids; empty = any zone
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.flooring_zones (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  type_id     text not null references public.unit_types(id) on delete cascade,
  zones       jsonb not null default '[]',        -- [{ zone, area, standardId }]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, type_id)
);

create table if not exists public.kitchens (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  name        text not null,
  name_ar     text,
  summary     text,
  summary_ar  text,
  images      jsonb not null default '[]',        -- [{ id, label, labelAr, src }]
  palettes    jsonb not null default '[]',        -- [{ id, name, nameAr, colors[] }]
  scopes      jsonb not null default '{}',        -- { cabinets: { includes, includesAr, pricing{typeId:SAR} }, full: {…} }
  addons      jsonb not null default '[]',        -- [{ id, name, nameAr, price, scopes[] }]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.ac_systems (
  id              text primary key,
  project_id      text not null references public.projects(id) on delete cascade,
  logo            text,
  images          jsonb not null default '[]',
  brand           text not null,
  brand_ar        text,
  name            text not null,
  name_ar         text,
  type            text not null default 'split' check (type in ('split','ducted','vrf','window')),
  energy_class    text,
  warranty_years  int,
  install         bigint not null default 0,      -- SAR ex-VAT per cooling point
  summary         text,
  summary_ar      text,
  tiers           jsonb not null default '{}',    -- { "18000": 1900, … }  BTU -> SAR ex-VAT
  fits            text[] not null default '{}',   -- unit types it fits; empty = all
  addons          jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.cooling_points (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  type_id     text not null references public.unit_types(id) on delete cascade,
  points      jsonb not null default '[]',        -- [{ room, roomAr, btu }]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, type_id)
);

create table if not exists public.layout_options (
  id              text primary key,
  project_id      text not null references public.projects(id) on delete cascade,
  type_id         text not null references public.unit_types(id) on delete cascade,
  area            text not null,                  -- options sharing an area are mutually exclusive
  area_name       text not null,
  area_name_ar    text,
  as_designed     text,
  as_designed_ar  text,
  name            text not null,
  name_ar         text,
  kind            text not null default 'add' check (kind in ('add','remove')),
  wall_m          numeric not null default 0,
  doors           int not null default 0,
  flat_price      numeric,                        -- null = priced from the project's layout rates
  rooms_after     text,
  rooms_after_ar  text,
  works           text[] not null default '{}',
  works_ar        text[] not null default '{}',
  "before"        text,                           -- plan image before / after (optional)
  "after"         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['flooring_finishes','flooring_zones','kitchens','ac_systems','cooling_points','layout_options']
  loop
    execute format('create index if not exists %I on public.%I(project_id)', t || '_project_idx', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()', t || '_touch', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "cat read" on public.%I', t);
    execute format('drop policy if exists "cat insert" on public.%I', t);
    execute format('drop policy if exists "cat update" on public.%I', t);
    execute format('drop policy if exists "cat delete" on public.%I', t);
    execute format('create policy "cat read"   on public.%I for select to authenticated using ((select private.can_read_project(project_id)))', t);
    execute format('create policy "cat insert" on public.%I for insert to authenticated with check ((select private.revnu_has(''developers'')))', t);
    execute format('create policy "cat update" on public.%I for update to authenticated using ((select private.revnu_has(''developers''))) with check ((select private.revnu_has(''developers'')))', t);
    execute format('create policy "cat delete" on public.%I for delete to authenticated using ((select private.is_super_admin()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Orders: the new choices and where the order came from
-- ---------------------------------------------------------------------
alter table public.orders
  add column if not exists kitchen_id          text references public.kitchens(id) on delete set null,
  add column if not exists kitchen_palette_id  text,
  add column if not exists kitchen_scope       text,
  add column if not exists kitchen_addons      jsonb not null default '[]',
  add column if not exists kitchen_cost        bigint not null default 0,
  add column if not exists ac_id               text references public.ac_systems(id) on delete set null,
  add column if not exists ac_addons           jsonb not null default '[]',
  add column if not exists ac_cost             bigint not null default 0,
  add column if not exists flooring            jsonb,                 -- { zoneId: { finishId, sizeId } }
  add column if not exists flooring_cost       bigint not null default 0,
  add column if not exists layout_ids          text[] not null default '{}',
  add column if not exists layout_cost         bigint not null default 0,
  add column if not exists agreement           jsonb,                 -- agreement layout snapshot at issue
  add column if not exists source              text not null default 'office',
  add column if not exists sale_link_code      text,
  add column if not exists submission_id       uuid;

do $$ begin
  alter table public.orders add constraint orders_source_chk check (source in ('office','remote'));
exception when duplicate_object then null; end $$;

-- The read views expand o.* / p.* at creation time: rebuild them so the new columns appear.
drop view if exists public.orders_v;
create view public.orders_v with (security_invoker = true) as
  select o.*,
         coalesce((select array_agg(ou.unit_number order by ou.sort) from public.order_units ou where ou.order_id = o.id), '{}'::text[]) as unit_numbers
  from public.orders o;

drop view if exists public.profiles_v;
create view public.profiles_v with (security_invoker = true) as
  select p.*,
         coalesce((select array_agg(pp.project_id order by pp.project_id) from public.profile_projects pp where pp.profile_id = p.id), '{}'::text[]) as assigned_project_ids,
         coalesce(p.perms, dr.perms, rr.perms, '{}'::text[]) as effective_perms
  from public.profiles p
  left join public.dev_roles dr on dr.id = p.role
  left join public.revnu_roles rr on rr.id = p.revnu_role_id
  where p.deleted_at is null;

grant select on public.profiles_v, public.orders_v to authenticated;

-- ---------------------------------------------------------------------
-- Order creation: one core shared by the office wizard and remote Accept
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

  -- Customisation deadlines (the step locks in the wizard; the server is the gate).
  select coalesce(array_agg(x), '{}') into v_layout from jsonb_array_elements_text(coalesce(p->'layoutIds', '[]'::jsonb)) t(x);
  if array_length(v_layout, 1) > 0 and proj.layout_deadline is not null and current_date > proj.layout_deadline then
    raise exception 'DEADLINE:layout:%', proj.layout_deadline using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p->'flooring') = 'object' and p->'flooring' <> '{}'::jsonb and proj.flooring_deadline is not null and current_date > proj.flooring_deadline then
    raise exception 'DEADLINE:flooring:%', proj.flooring_deadline using errcode = 'check_violation';
  end if;

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
  values (v_id, p_dev, proj.id, p_rep, v_status, v_units[1],
      p->>'customerName', p->>'customerId', nullif(p->>'customerEmail',''), coalesce(p->'customer','{}'::jsonb),
      coalesce((p->>'perUnitMode')::boolean, false), p->'perUnit',
      nullif(p->>'packageId',''), nullif(p->>'designId',''), nullif(p->>'paletteId',''), nullif(p->>'smartId',''), nullif(p->>'opsId',''),
      coalesce((p->>'fitout')::boolean,false), round(coalesce((p->>'fitoutCost')::numeric,0)),
      round(coalesce((p->>'unitPrice')::numeric,0)), round(coalesce((p->>'furnishCost')::numeric,0)),
      coalesce((p->>'operatorFee')::numeric,0), round(coalesce((p->>'monthlyNet')::numeric,0)),
      nullif(p->>'kitchenId',''), nullif(p->>'kitchenPaletteId',''), nullif(p->>'kitchenScope',''),
      case when jsonb_typeof(p->'kitchenAddons') = 'array' then p->'kitchenAddons' else '[]'::jsonb end,
      round(coalesce((p->>'kitchenCost')::numeric,0)),
      nullif(p->>'acId',''), case when jsonb_typeof(p->'acAddons') = 'array' then p->'acAddons' else '[]'::jsonb end,
      round(coalesce((p->>'acCost')::numeric,0)),
      case when jsonb_typeof(p->'flooring') = 'object' and p->'flooring' <> '{}'::jsonb then p->'flooring' else null end,
      round(coalesce((p->>'flooringCost')::numeric,0)),
      v_layout, round(coalesce((p->>'layoutCost')::numeric,0)),
      case when jsonb_typeof(p->'agreement') = 'object' then p->'agreement' else null end,
      p_source, p_link, p_submission)
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
revoke all on function private.create_order_core(jsonb, text, uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public.create_order(p jsonb)
returns public.orders language plpgsql security definer set search_path = public as $$
declare v_dev text := private.my_dev();
begin
  if v_dev is null or not private.dev_has('orders') then
    raise exception 'Only a developer''s sales team can submit an order' using errcode = 'insufficient_privilege';
  end if;
  return private.create_order_core(p, v_dev, auth.uid(), 'office', null, null);
end $$;
revoke all on function public.create_order(jsonb) from public, anon;
grant execute on function public.create_order(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Contract variables (59, in the client's order; 35 are new)
-- ---------------------------------------------------------------------
insert into public.contract_vars (code, en, ar, is_block, sort) values
  ('buyer_name', 'Buyer name', 'اسم المشتري', false, 0),
  ('buyer_id', 'Buyer national ID', 'هوية المشتري', false, 1),
  ('buyer_email', 'Buyer email', 'بريد المشتري', false, 2),
  ('buyer_mobile', 'Buyer mobile', 'جوال المشتري', false, 3),
  ('developer_name', 'Developer name', 'اسم المطور', false, 4),
  ('authorized_signer', 'Authorised signatory', 'المفوض بالتوقيع', false, 5),
  ('authorized_signer_title', 'Signatory title', 'منصب المفوض بالتوقيع', false, 6),
  ('project_name', 'Project name', 'اسم المشروع', false, 7),
  ('project_city', 'City', 'المدينة', false, 8),
  ('unit_number', 'Unit number', 'رقم الوحدة', false, 9),
  ('unit_type', 'Unit type', 'نوع الوحدة', false, 10),
  ('unit_area', 'Area (m²)', 'المساحة', false, 11),
  ('unit_price', 'Unit price', 'سعر الوحدة', false, 12),
  ('package_name', 'Furnishing package', 'باقة التأثيث', false, 13),
  ('design_name', 'Design style', 'نمط التصميم', false, 14),
  ('palette_name', 'Colour palette', 'لوحة الألوان', false, 15),
  ('smart_name', 'Smart-home tier', 'باقة المنزل الذكي', false, 16),
  ('kitchen_name', 'Kitchen design', 'تصميم المطبخ', false, 17),
  ('kitchen_palette', 'Kitchen palette', 'لوحة ألوان المطبخ', false, 18),
  ('kitchen_scope', 'Kitchen scope', 'نطاق المطبخ', false, 19),
  ('kitchen_cost', 'Kitchen cost', 'تكلفة المطبخ', false, 20),
  ('kitchen_addons', 'Kitchen optional items', 'إضافات المطبخ الاختيارية', false, 21),
  ('ac_name', 'Cooling system', 'نظام التكييف', false, 22),
  ('ac_brand', 'Cooling brand', 'ماركة التكييف', false, 23),
  ('ac_cost', 'Cooling cost', 'تكلفة التكييف', false, 24),
  ('flooring_cost', 'Flooring upgrade cost', 'تكلفة ترقية الأرضيات', false, 25),
  ('flooring_summary', 'Flooring upgrades (zones · finish)', 'ترقيات الأرضيات (المناطق · التشطيب)', false, 26),
  ('flooring_zones', 'Upgraded flooring zones', 'مناطق الأرضيات المرقاة', false, 27),
  ('layout_summary', 'Layout changes (area · option)', 'تعديلات المخطط (المنطقة · الخيار)', false, 28),
  ('layout_cost', 'Layout changes cost', 'تكلفة تعديلات المخطط', false, 29),
  ('layout_rooms', 'Rooms after layout changes', 'الغرف بعد تعديلات المخطط', false, 30),
  ('layout_deadline', 'Layout changes deadline', 'آخر موعد لتعديلات المخطط', false, 31),
  ('flooring_deadline', 'Flooring changes deadline', 'آخر موعد لتعديلات الأرضيات', false, 32),
  ('ops_name', 'Operating model', 'نموذج التشغيل', false, 33),
  ('furnish_cost', 'Furnishing cost', 'تكلفة التأثيث', false, 34),
  ('total_price', 'Total price', 'السعر الإجمالي', false, 35),
  ('today', 'Today''s date', 'تاريخ اليوم', false, 36),
  ('developer_legal_name', 'Developer legal name', 'الاسم القانوني للمطور', false, 37),
  ('developer_cr', 'Developer CR number', 'السجل التجاري للمطور', false, 38),
  ('developer_vat', 'Developer VAT number', 'الرقم الضريبي للمطور', false, 39),
  ('n_units', 'Number of units', 'عدد الوحدات', false, 40),
  ('units_list', 'Unit numbers', 'أرقام الوحدات', false, 41),
  ('warranty_years', 'Furnishing warranty (years)', 'ضمان التأثيث (سنوات)', false, 42),
  ('fitout_warranty_years', 'Fit-out warranty (years)', 'ضمان التجهيز (سنوات)', false, 43),
  ('addendum_value', 'Addendum value incl. VAT', 'قيمة الملحق شامل الضريبة', false, 44),
  ('agreement_ref', 'Agreement reference', 'رقم الاتفاقية', false, 45),
  ('sec_parties', '§ no. — Parties', 'رقم بند الأطراف', false, 46),
  ('sec_property', '§ no. — Property', 'رقم بند العقار', false, 47),
  ('sec_investment', '§ no. — Investment', 'رقم بند الاستثمار', false, 48),
  ('sec_payment', '§ no. — Payment', 'رقم بند الدفعات', false, 49),
  ('has_ops', 'Section: only if operations chosen', 'قسم: فقط مع التشغيل', true, 50),
  ('has_furnishing', 'Section: only if furnishing chosen', 'قسم: فقط مع التأثيث', true, 51),
  ('has_multi', 'Section: only for multi-unit deals', 'قسم: فقط للصفقات متعددة الوحدات', true, 52),
  ('has_smart', 'Section: only if smart home chosen', 'قسم: فقط مع المنزل الذكي', true, 53),
  ('has_kitchen', 'Section: only if kitchen chosen', 'قسم: فقط مع المطبخ', true, 54),
  ('has_ac', 'Section: only if cooling / AC chosen', 'قسم: فقط مع التكييف', true, 55),
  ('has_flooring', 'Section: only if flooring upgrade chosen', 'قسم: فقط مع ترقية الأرضيات', true, 56),
  ('has_layout', 'Section: only if layout changes chosen', 'قسم: فقط مع تعديلات المخطط', true, 57),
  ('has_fitout', 'Section: only if fit-out chosen', 'قسم: فقط مع التجهيز', true, 58)
on conflict (code) do update set en = excluded.en, ar = excluded.ar, is_block = excluded.is_block, sort = excluded.sort;

commit;
