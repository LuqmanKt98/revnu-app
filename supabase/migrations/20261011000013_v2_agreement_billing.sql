-- =====================================================================
--  Revnu v2 — agreement composer (Revnu master + per-developer layouts
--  with version history) and platform billing (price book, developer
--  plan, invoice status). Additive only.
--
--  · The master layout is seeded from the client's prototype
--    (AGREEMENT_MASTER: 21 blocks, 14 clauses). A developer without a
--    layout of its own uses the master; an order pins a snapshot when it
--    is issued (orders.agreement), so signed agreements never change
--    under later edits.
--  · Platform invoices are DERIVED in the app from events (developer
--    onboarded, project created, subscription anniversary). Only what a
--    person records — paid / reference / note — is stored here.
-- =====================================================================
begin;

alter table public.developers add column if not exists custom_fields jsonb not null default '[]';          -- [{key, label, labelAr, value, valueAr}] -> {{dev.key}}
alter table public.projects   add column if not exists flooring_show_rate boolean not null default false;   -- buyer sees SAR/m² in the flooring step

-- ---------------------------------------------------------------------
-- Agreement layouts
-- ---------------------------------------------------------------------
create table if not exists public.agreement_layouts (
  key           text primary key,                    -- 'master' or the developer id
  developer_id  text references public.developers(id) on delete cascade,
  name          text,
  name_ar       text,
  version       int  not null default 1,
  based_on      int,
  blocks        jsonb not null default '[]',
  updated       date not null default current_date,
  updated_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint agreement_layouts_key_chk check ((key = 'master' and developer_id is null) or (developer_id is not null and key = developer_id))
);
create table if not exists public.agreement_versions (
  id        bigserial primary key,
  key       text not null,
  version   int  not null,
  updated   date,
  blocks    jsonb not null,
  saved_at  timestamptz not null default now(),
  saved_by  uuid references public.profiles(id) on delete set null
);
create index if not exists agreement_versions_key_idx on public.agreement_versions(key, saved_at desc);
drop trigger if exists agreement_layouts_touch on public.agreement_layouts;
create trigger agreement_layouts_touch before update on public.agreement_layouts for each row execute function private.touch_updated_at();

alter table public.agreement_layouts  enable row level security;
alter table public.agreement_versions enable row level security;
drop policy if exists "agreement read" on public.agreement_layouts;
create policy "agreement read" on public.agreement_layouts for select to authenticated
  using (key = 'master' or (select private.can_read_dev(developer_id)));
drop policy if exists "agreement history read" on public.agreement_versions;
create policy "agreement history read" on public.agreement_versions for select to authenticated using ((select private.is_revnu()));
grant select on public.agreement_layouts, public.agreement_versions to authenticated;
revoke all on public.agreement_layouts, public.agreement_versions from anon;

-- Save = a new version; the previous one goes to the history (the last 20 are kept per layout).
create or replace function public.save_agreement_layout(p jsonb)
returns public.agreement_layouts language plpgsql security definer set search_path = public as $$
declare v_key text; v_dev text; prev public.agreement_layouts; l public.agreement_layouts;
begin
  if not private.revnu_has('developers') then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  v_dev := nullif(p->>'developerId', '');
  v_key := coalesce(v_dev, 'master');
  if v_dev is not null and not exists (select 1 from public.developers where id = v_dev) then
    raise exception 'developer not found' using errcode = 'no_data_found';
  end if;
  if jsonb_typeof(p->'blocks') is distinct from 'array' or jsonb_array_length(p->'blocks') > 300 or length((p->'blocks')::text) > 800000 then
    raise exception 'invalid agreement layout' using errcode = 'check_violation';
  end if;
  select * into prev from public.agreement_layouts where key = v_key for update;
  if prev.key is not null then
    insert into public.agreement_versions(key, version, updated, blocks, saved_by) values (prev.key, prev.version, prev.updated, prev.blocks, auth.uid());
    delete from public.agreement_versions where key = v_key
      and id not in (select id from public.agreement_versions where key = v_key order by saved_at desc, id desc limit 20);
  end if;
  insert into public.agreement_layouts(key, developer_id, name, name_ar, version, based_on, blocks, updated, updated_by)
  values (v_key, v_dev, left(p->>'name', 160), left(p->>'nameAr', 160), coalesce(prev.version, 0) + 1, nullif(p->>'basedOn', '')::int,
          p->'blocks', current_date, auth.uid())
  on conflict (key) do update set
    name = coalesce(excluded.name, agreement_layouts.name), name_ar = coalesce(excluded.name_ar, agreement_layouts.name_ar),
    version = excluded.version, based_on = coalesce(excluded.based_on, agreement_layouts.based_on),
    blocks = excluded.blocks, updated = excluded.updated, updated_by = excluded.updated_by
  returning * into l;
  return l;
end $$;

-- Back to the Revnu master (the developer's history is kept).
create or replace function public.reset_agreement_layout(p_dev text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.revnu_has('developers') then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  if coalesce(p_dev, '') in ('', 'master') then raise exception 'the master cannot be removed' using errcode = 'check_violation'; end if;
  delete from public.agreement_layouts where key = p_dev;
end $$;

-- ---------------------------------------------------------------------
-- Platform billing
-- ---------------------------------------------------------------------
create table if not exists public.billing_settings (
  id          boolean primary key default true check (id),
  price_book  jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);
create table if not exists public.platform_invoices (
  id            text primary key,                     -- the derived invoice id, e.g. PF-N-ONB / PF-N-Y2
  developer_id  text not null references public.developers(id) on delete cascade,
  status        text check (status in ('paid')),
  paid_at       date,
  paid_ref      text,
  note          text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles(id) on delete set null
);
create index if not exists platform_invoices_dev_idx on public.platform_invoices(developer_id);
drop trigger if exists platform_invoices_touch on public.platform_invoices;
create trigger platform_invoices_touch before update on public.platform_invoices for each row execute function private.touch_updated_at();

alter table public.billing_settings  enable row level security;
alter table public.platform_invoices enable row level security;
drop policy if exists "pricebook read" on public.billing_settings;
create policy "pricebook read" on public.billing_settings for select to authenticated using (true);
drop policy if exists "platform invoice read" on public.platform_invoices;
create policy "platform invoice read" on public.platform_invoices for select to authenticated using ((select private.can_read_dev(developer_id)));
grant select on public.billing_settings, public.platform_invoices to authenticated;
revoke all on public.billing_settings, public.platform_invoices from anon;

insert into public.billing_settings(id, price_book) values (true, '{"onboardingFee":65000,"projectSetupFee":35000,"vatPct":15,"dueDays":30,"bands":[{"upTo":100,"fee":15000},{"upTo":300,"fee":36000},{"upTo":750,"fee":72000},{"upTo":1500,"fee":120000},{"upTo":null,"fee":180000}]}'::jsonb) on conflict (id) do nothing;

create or replace function public.set_billing_price_book(p jsonb)
returns public.billing_settings language plpgsql security definer set search_path = public as $$
declare b jsonb; s public.billing_settings; prev numeric := 0; k text; band jsonb;
begin
  if not private.revnu_has('financials') then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'invalid price book' using errcode = 'check_violation'; end if;
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into b
  from jsonb_each(p) e where e.key in ('onboardingFee','projectSetupFee','vatPct','dueDays','bands');
  foreach k in array array['onboardingFee','projectSetupFee','vatPct','dueDays'] loop
    if b ? k and (jsonb_typeof(b->k) <> 'number' or (b->>k)::numeric < 0) then raise exception 'NEGATIVE_AMOUNT' using errcode = 'check_violation'; end if;
  end loop;
  if coalesce((b->>'vatPct')::numeric, 0) > 100 or coalesce((b->>'dueDays')::numeric, 0) > 365 then raise exception 'invalid price book' using errcode = 'check_violation'; end if;
  if b ? 'bands' then
    if jsonb_typeof(b->'bands') <> 'array' or jsonb_array_length(b->'bands') not between 1 and 20 then raise exception 'invalid price book' using errcode = 'check_violation'; end if;
    for band in select value from jsonb_array_elements(b->'bands') loop
      if jsonb_typeof(band->'fee') is distinct from 'number' or (band->>'fee')::numeric < 0 then raise exception 'NEGATIVE_AMOUNT' using errcode = 'check_violation'; end if;
      if jsonb_typeof(band->'upTo') = 'number' then
        if (band->>'upTo')::numeric <= prev then raise exception 'invalid price book' using errcode = 'check_violation'; end if;
        prev := (band->>'upTo')::numeric;
      elsif band ? 'upTo' and jsonb_typeof(band->'upTo') <> 'null' then
        raise exception 'invalid price book' using errcode = 'check_violation';
      end if;
    end loop;
  end if;
  update public.billing_settings set price_book = price_book || b, updated_at = now(), updated_by = auth.uid() where id returning * into s;
  return s;
end $$;

create or replace function public.set_platform_invoice(p_id text, p_dev text, p jsonb)
returns public.platform_invoices language plpgsql security definer set search_path = public as $$
declare r public.platform_invoices;
begin
  if not private.revnu_has('financials') then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  if coalesce(p_id, '') !~ '^PF-[A-Z0-9]+-[A-Z0-9-]+$' or not exists (select 1 from public.developers where id = p_dev) then
    raise exception 'invalid invoice' using errcode = 'check_violation';
  end if;
  insert into public.platform_invoices(id, developer_id, status, paid_at, paid_ref, note, updated_by)
  values (p_id, p_dev,
          case when p->>'status' = 'paid' then 'paid' else null end,
          case when p->>'status' = 'paid' then coalesce(nullif(p->>'paidAt', '')::date, current_date) else null end,
          case when p->>'status' = 'paid' then left(coalesce(p->>'paidRef', ''), 120) else null end,
          left(p->>'note', 500), auth.uid())
  on conflict (id) do update set
    status     = case when p ? 'status' then excluded.status else platform_invoices.status end,
    paid_at    = case when p ? 'status' then excluded.paid_at else platform_invoices.paid_at end,
    paid_ref   = case when p ? 'status' then excluded.paid_ref else platform_invoices.paid_ref end,
    note       = case when p ? 'note' then excluded.note else platform_invoices.note end,
    updated_by = auth.uid()
  where platform_invoices.developer_id = p_dev
  returning * into r;
  return r;
end $$;

revoke all on function public.save_agreement_layout(jsonb), public.reset_agreement_layout(text), public.set_billing_price_book(jsonb),
  public.set_platform_invoice(text, text, jsonb) from public, anon;
grant execute on function public.save_agreement_layout(jsonb), public.reset_agreement_layout(text), public.set_billing_price_book(jsonb),
  public.set_platform_invoice(text, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Seed: the Revnu master agreement, exactly as in the client's prototype
-- ---------------------------------------------------------------------
insert into public.agreement_layouts(key, developer_id, name, name_ar, version, blocks, updated)
values ('master', null, 'Revnu master agreement', 'نموذج Revnu الرئيسي', 1, '[{"id":"cover","kind":"data","ref":"cover","enabled":true,"showWhen":"always"},{"id":"parties","kind":"data","ref":"parties","enabled":true,"showWhen":"always"},{"id":"unit_pages","kind":"data","ref":"unit_pages","enabled":true,"showWhen":"always"},{"id":"investment","kind":"data","ref":"investment","enabled":true,"showWhen":"always"},{"id":"schedule_a","kind":"data","ref":"schedule_a","enabled":true,"showWhen":"furnishing"},{"id":"schedule_b","kind":"data","ref":"schedule_b","enabled":true,"showWhen":"ops"},{"id":"gt-1","kind":"clause","enabled":true,"showWhen":"always","section":"General Terms & Conditions","sectionAr":"الأحكام والشروط العامة","title":"Definitions","titleAr":"التعريفات","body":"“Seller” means {{developer_legal_name}}; “Buyer” means the party named in §{{sec_parties}}; “Unit” means the property described in §{{sec_property}}; “Works” means the furnishing, fit-out, kitchen and smart-home scope set out in Schedule A. Words importing the singular include the plural and vice versa.","bodyAr":"يقصد ب«البائع» {{developer_legal_name}}؛ و«المشتري» الطرف المذكور في §{{sec_parties}}؛ و«الوحدة» العقار الموصوف في §{{sec_property}}؛ و«الأعمال» نطاق التأثيث والتجهيز والمطبخ والمنزل الذكي الوارد في الملحق أ. وتشمل صيغة المفرد الجمع والعكس."},{"id":"gt-2","kind":"clause","enabled":true,"showWhen":"always","section":"General Terms & Conditions","sectionAr":"الأحكام والشروط العامة","title":"Relationship to the Unit Purchase Agreement","titleAr":"العلاقة بعقد شراء الوحدة","body":"This Agreement is an addendum to the Unit Purchase Agreement between the Buyer and {{developer_legal_name}}. It creates no separate sale of the Unit and does not vary its price, payment plan or title-transfer terms. In case of conflict, the Unit Purchase Agreement governs the Unit and this addendum governs the Works.","bodyAr":"هذه الاتفاقية ملحق لعقد شراء الوحدة المبرم بين المشتري و{{developer_legal_name}}، ولا تنشئ بيعا مستقلا للوحدة ولا تعدل سعرها أو خطة دفعها أو أحكام نقل ملكيتها. وعند التعارض، تسري أحكام عقد شراء الوحدة فيما يخص الوحدة، وأحكام هذا الملحق فيما يخص الأعمال."},{"id":"gt-3","kind":"clause","enabled":true,"showWhen":"always","section":"General Terms & Conditions","sectionAr":"الأحكام والشروط العامة","title":"Price & VAT","titleAr":"السعر وضريبة القيمة المضافة","body":"The furnishing, smart-home, kitchen and fit-out works are services subject to value-added tax at the prevailing rate (currently 15%), shown explicitly in §{{sec_payment}}. The unit price and any taxes or fees on its registration are outside this addendum and governed by the Unit Purchase Agreement.","bodyAr":"أعمال التأثيث والمنزل الذكي والمطبخ والتجهيز خدمات تخضع لضريبة القيمة المضافة بالنسبة السائدة (حاليا 15%) المبينة صراحة في §{{sec_payment}}. ولا يتناول هذا الملحق سعر الوحدة ولا الضرائب والرسوم المرتبطة بتسجيلها، فهي محكومة بعقد شراء الوحدة."},{"id":"gt-4","kind":"clause","enabled":true,"showWhen":"always","section":"General Terms & Conditions","sectionAr":"الأحكام والشروط العامة","title":"Payment","titleAr":"الدفع","body":"The value of this addendum (§{{sec_payment}}) is added to the unit consideration and paid by the Buyer to the Seller within the instalments of the Unit Purchase Agreement, on the same dates and in the same proportions. No separate furnishing payment schedule applies; late payment and default are governed by the Unit Purchase Agreement.","bodyAr":"تضاف قيمة هذا الملحق (§{{sec_payment}}) إلى مقابل الوحدة وتدفع من المشتري إلى البائع ضمن دفعات عقد شراء الوحدة وبنفس مواعيدها ونسبها. لا يسري أي جدول دفع منفصل للتأثيث، ويخضع التأخير في السداد والتخلف عنه لأحكام عقد شراء الوحدة."},{"id":"gt-5","kind":"clause","enabled":true,"showWhen":"always","section":"General Terms & Conditions","sectionAr":"الأحكام والشروط العامة","title":"Furnishing, fit-out & operations","titleAr":"التأثيث والتجهيز والتشغيل","body":"The furnishing and fit-out works are supplied, sequenced and warranted under Schedule A (with the bills of quantities at Appendix F-1{{#has_fitout}} and F-2{{/has_fitout}}{{#has_kitchen}} and the kitchen schedule at F-3{{/has_kitchen}}{{#has_ac}} and the cooling schedule at F-4{{/has_ac}}{{#has_flooring}} and the flooring schedule at F-5{{/has_flooring}}{{#has_layout}} and the layout modifications at F-6{{/has_layout}}){{#has_ops}}; rental management is provided under Schedule B{{/has_ops}}. Those Schedules form part of this Agreement and are incorporated by reference.","bodyAr":"تورد أعمال التأثيث والتجهيز وتجدول وتضمن بموجب الملحق أ (مع جداول الكميات في الملحق F-1{{#has_fitout}} و F-2{{/has_fitout}}{{#has_kitchen}} وجدول المطبخ F-3{{/has_kitchen}}{{#has_ac}} وجدول التكييف F-4{{/has_ac}}{{#has_flooring}} وجدول الأرضيات F-5{{/has_flooring}}{{#has_layout}} وتعديلات المخطط F-6{{/has_layout}}){{#has_ops}}؛ وتقدم إدارة الإيجار بموجب الملحق ب{{/has_ops}}. وتعد هذه الملاحق جزءا من هذه الاتفاقية ومدرجة بالإحالة."},{"id":"gt-6","kind":"clause","enabled":true,"showWhen":"flooring","section":"General Terms & Conditions","sectionAr":"الأحكام والشروط العامة","title":"Flooring upgrades","titleAr":"ترقية الأرضيات","body":"Where the Buyer has selected upgraded floor or wall finishes, the Seller shall supply and lay the finishes listed in Appendix F-5 in the zones stated there, priced per square metre on the nominal zone areas of the unit type. Zones not listed in Appendix F-5 are delivered in the project''s standard finish at no additional cost. Natural stone and timber vary in tone and veining from samples; such variation is not a defect. Selections are final once flooring works for the Unit have commenced.","bodyAr":"حيثما اختار المشتري تشطيبات أرضيات أو جدران مرقاة، يلتزم البائع بتوريد وتركيب التشطيبات الواردة في الملحق F-5 في المناطق المحددة فيه، مسعرة بالمتر المربع على المساحات الاسمية لنوع الوحدة. وتسلم المناطق غير المذكورة في الملحق F-5 بالتشطيب القياسي للمشروع دون تكلفة إضافية. ويعد تفاوت الحجر الطبيعي والخشب في اللون والعروق عن العينات أمرا طبيعيا لا عيبا. وتعتبر الاختيارات نهائية بمجرد بدء أعمال الأرضيات في الوحدة."},{"id":"gt-7","kind":"clause","enabled":true,"showWhen":"layout","section":"General Terms & Conditions","sectionAr":"الأحكام والشروط العامة","title":"Layout modifications","titleAr":"تعديلات المخطط","body":"The internal layout modifications listed in Appendix F-6 are pre-approved by the Seller''s engineer and concern non-load-bearing partitions and doors only; they do not alter the Unit''s registered area, external envelope or services risers. Where a modification changes the number or use of rooms, the description in Appendix F-6 prevails over the room count in §{{sec_property}} for the purpose of the Works. Layout selections are final and cannot be added, withdrawn or changed after {{layout_deadline}}{{#has_flooring}}, and flooring selections after {{flooring_deadline}}{{/has_flooring}}.","bodyAr":"تعديلات المخطط الداخلي الواردة في الملحق F-6 معتمدة مسبقا من مهندس البائع وتقتصر على الجدران غير الحاملة والأبواب، ولا تغير مساحة الوحدة المسجلة أو غلافها الخارجي أو مسارات الخدمات. وحيثما يغير التعديل عدد الغرف أو استخدامها، يعتد بالوصف الوارد في الملحق F-6 على عدد الغرف في §{{sec_property}} فيما يخص الأعمال. وتعد اختيارات المخطط نهائية ولا يجوز إضافتها أو سحبها أو تغييرها بعد {{layout_deadline}}{{#has_flooring}}، واختيارات الأرضيات بعد {{flooring_deadline}}{{/has_flooring}}."},{"id":"gt-8","kind":"clause","enabled":true,"showWhen":"always","section":"General Terms & Conditions","sectionAr":"الأحكام والشروط العامة","title":"Handover & snagging","titleAr":"التسليم والملاحظات","body":"At handover the Buyer is given a snagging period of thirty (30) days to report defects in the Unit or the Works. The Seller shall remedy verified defects within forty-five (45) days at no cost to the Buyer.","bodyAr":"عند التسليم يمنح المشتري فترة ملاحظات مدتها ثلاثون (30) يوما للإبلاغ عن عيوب الوحدة أو الأعمال. ويلتزم البائع بإصلاح العيوب المؤكدة خلال خمسة وأربعين (45) يوما دون تكلفة على المشتري."},{"id":"gt-9","kind":"clause","enabled":true,"showWhen":"always","section":"General Terms & Conditions","sectionAr":"الأحكام والشروط العامة","title":"Warranties","titleAr":"الضمانات","body":"The Seller warrants the Works (furniture and finishes) against manufacturing defects for {{warranty_years}} years{{#has_fitout}}, and the fit-out finishes for {{fitout_warranty_years}} years{{/has_fitout}} from completion. Appliances and electronics carry the manufacturer''s warranty. Fair wear and tear, misuse, tenant damage and unauthorised modification are excluded. The structural warranty of the Unit is governed by the Unit Purchase Agreement.","bodyAr":"يضمن البائع الأعمال (الأثاث والتشطيبات) ضد عيوب التصنيع لمدة {{warranty_years}} سنوات{{#has_fitout}}، وتشطيبات التجهيز لمدة {{fitout_warranty_years}} سنوات{{/has_fitout}} من الإنجاز. وتخضع الأجهزة والإلكترونيات لضمان الشركة الصانعة. ويستثنى البلى الطبيعي وسوء الاستخدام وأضرار المستأجرين والتعديل غير المرخص. أما ضمان الوحدة الإنشائي فيحكمه عقد شراء الوحدة."},{"id":"gt-10","kind":"clause","enabled":true,"showWhen":"always","section":"General Terms & Conditions","sectionAr":"الأحكام والشروط العامة","title":"Default & termination","titleAr":"التخلف والإنهاء","body":"Either party may terminate on thirty (30) days'' written notice for material breach left uncured. If the Buyer cancels after procurement has started, the Seller may retain costs actually incurred up to 10% of the value of this addendum; on Seller default, sums paid for Works not delivered are refunded.","bodyAr":"يجوز لأي طرف الإنهاء بإشعار كتابي مدته ثلاثون (30) يوما عند إخلال جوهري لم يعالج. وعند إلغاء المشتري بعد بدء التوريد يجوز للبائع الاحتفاظ بالتكاليف المتكبدة فعلا بحد أقصى 10% من قيمة هذا الملحق؛ وعند تخلف البائع ترد المبالغ المدفوعة عن الأعمال غير المنجزة."},{"id":"gt-11","kind":"clause","enabled":true,"showWhen":"always","section":"General Terms & Conditions","sectionAr":"الأحكام والشروط العامة","title":"Force majeure","titleAr":"القوة القاهرة","body":"Neither party is liable for delay or failure caused by events beyond reasonable control. Delivery dates extend by the period of the event.","bodyAr":"لا يسأل أي طرف عن تأخير أو إخفاق ناتج عن أحداث خارجة عن السيطرة المعقولة. وتمدد مواعيد التسليم بمقدار مدة الحدث."},{"id":"gt-12","kind":"clause","enabled":true,"showWhen":"always","section":"General Terms & Conditions","sectionAr":"الأحكام والشروط العامة","title":"Data protection","titleAr":"حماية البيانات","body":"The Buyer''s personal data is used solely to conclude and perform this Agreement and to provide ongoing service, and is shared only as necessary to deliver the Works.","bodyAr":"تستخدم بيانات المشتري الشخصية لإبرام هذه الاتفاقية وتنفيذها وتقديم الخدمة المستمرة فقط، ولا تشارك مع أطراف أخرى إلا بالقدر اللازم لتنفيذ الأعمال."},{"id":"gt-13","kind":"clause","enabled":true,"showWhen":"always","section":"General Terms & Conditions","sectionAr":"الأحكام والشروط العامة","title":"Governing law & disputes","titleAr":"القانون الحاكم والنزاعات","body":"This Agreement is governed by the laws of the Kingdom of Saudi Arabia. Disputes are referred to the competent courts of {{project_city}}, save that the parties shall first attempt amicable settlement within thirty (30) days.","bodyAr":"تخضع هذه الاتفاقية لأنظمة المملكة العربية السعودية. وتحال النزاعات إلى المحاكم المختصة في {{project_city}}، على أن يسعى الطرفان أولا للتسوية الودية خلال ثلاثين (30) يوما."},{"id":"gt-14","kind":"clause","enabled":true,"showWhen":"always","section":"General Terms & Conditions","sectionAr":"الأحكام والشروط العامة","title":"Entire agreement","titleAr":"الاتفاق الكامل","body":"This Agreement, with its Schedules and Appendices, constitutes the entire agreement between the parties and supersedes prior discussions. Amendments must be in writing and signed by both parties.","bodyAr":"تشكل هذه الاتفاقية، مع ملاحقها وجداولها، كامل الاتفاق بين الطرفين وتجب المناقشات السابقة. ويجب أن تكون أي تعديلات كتابية وموقعة من الطرفين."},{"id":"execution","kind":"data","ref":"execution","enabled":true,"showWhen":"always"}]'::jsonb, '2026-09-20')
on conflict (key) do nothing;

commit;
