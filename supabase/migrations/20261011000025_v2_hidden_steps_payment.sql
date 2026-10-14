-- =====================================================================
--  Revnu v2 — client feedback after Release 2 testing (13 Oct 2026). Additive.
--   H-1  steps the rep switches off on a link are hidden from the buyer: a hidden step keeps the rep's
--        choice; a step that needs no pick (layout, flooring) or whose feature is Optional may be hidden
--        empty (the item is left out); a Mandatory step the rep left empty stays with the buyer, and the
--        buyer's answer is kept (private.effective_locks, used by public_link_submit)
--   P-1  payment details per project (bank, account holder, IBAN, first payment %, pay within, note) for
--        the notice that follows the buyer's signature; never on a sale link, only on a signed signing link
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- P-1: payment details per project
-- ---------------------------------------------------------------------
alter table public.projects add column if not exists payment_details jsonb;
alter table public.projects drop constraint if exists projects_payment_details_chk;
alter table public.projects add constraint projects_payment_details_chk check (payment_details is null or (
  jsonb_typeof(payment_details) = 'object'
  and coalesce(payment_details->>'iban', '') ~ '^(SA[0-9]{22})?$'
  and coalesce(jsonb_typeof(payment_details->'firstPct'), 'null') in ('number', 'null')
  and coalesce(jsonb_typeof(payment_details->'dueDays'), 'null') in ('number', 'null')
  and coalesce(case when jsonb_typeof(payment_details->'firstPct') = 'number' then (payment_details->>'firstPct')::numeric end, 0) between 0 and 100
  and coalesce(case when jsonb_typeof(payment_details->'dueDays') = 'number' then (payment_details->>'dueDays')::numeric end, 0) between 0 and 365));

-- ---------------------------------------------------------------------
-- P-1: a sale link's project never carries the payment details
-- ---------------------------------------------------------------------
create or replace function private.public_project(p_project text)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(p) - 'commercials' - 'revnu_terms' - 'payment_details' from public.projects p where p.id = p_project;
$$;

-- ---------------------------------------------------------------------
-- H-1: which of the rep's switched-off steps are really hidden (mirrors R.effectiveLocks in lib/data/remote.js)
-- ---------------------------------------------------------------------
-- A step is answered when its pick is set or its feature is skipped.
create or replace function private.step_set(p_sel jsonb, p_pick text, p_feat text)
returns boolean language sql immutable as $$
  select coalesce(nullif(p_sel->>p_pick, ''), '') <> '' or private.jflag(p_sel->'skip'->p_feat);
$$;

-- p_per / p_units: per-unit configurations (each unit = shared selections + its own) when the deal is per unit.
create or replace function private.effective_locks(p_locks jsonb, p_sel jsonb, p_per jsonb, p_units text[], p_optional jsonb)
returns jsonb language plpgsql immutable as $$
declare
  v_out jsonb := '{}'::jsonb; v_step text; v_feat text; v_pick text; v_ok boolean; n text;
  base jsonb := case when jsonb_typeof(p_sel) = 'object' then p_sel else '{}'::jsonb end;
begin
  if jsonb_typeof(p_locks) is distinct from 'object' then return v_out; end if;
  for v_step in select key from jsonb_each(p_locks) where value = 'true'::jsonb loop
    v_feat := case v_step when 'design' then 'furnishing' when 'package' then 'furnishing' when 'smart' then 'smartHome'
                          when 'layout' then 'layout' when 'flooring' then 'flooring' when 'kitchen' then 'kitchens'
                          when 'cooling' then 'cooling' when 'operate' then 'operations' else null end;
    continue when v_feat is null;
    v_pick := case v_step when 'design' then 'designId' when 'package' then 'packageId' when 'smart' then 'smartId'
                          when 'kitchen' then 'kitchenId' when 'cooling' then 'acId' when 'operate' then 'opsId' else null end;
    if v_pick is null or private.jflag(p_optional->v_feat) then
      v_ok := true;                                   -- nothing to pick, or Optional (hidden empty = left out)
    elsif jsonb_typeof(p_per) = 'object' and coalesce(array_length(p_units, 1), 0) > 0 then
      v_ok := true;
      foreach n in array p_units loop
        if not private.step_set(base || case when jsonb_typeof(p_per->n) = 'object' then p_per->n else '{}'::jsonb end, v_pick, v_feat) then
          v_ok := false; exit;
        end if;
      end loop;
    else
      v_ok := private.step_set(base, v_pick, v_feat);
    end if;
    if v_ok then v_out := v_out || jsonb_build_object(v_step, true); end if;
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------------------------
-- H-1: the buyer's submission keeps what the rep hid, and only that
-- ---------------------------------------------------------------------
create or replace function public.public_link_submit(p_code text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.sale_links; s public.submissions; ld public.sale_leads; chosen text[]; tid text; rep uuid; c jsonb; n text; what text;
  v_per boolean; v_locks jsonb;
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

  -- Steps the rep hid keep the rep's choices; a Mandatory step the rep left empty is the buyer's to answer.
  v_per := coalesce((p->>'perMode')::boolean, false) and array_length(chosen, 1) > 1 and jsonb_typeof(p->'perUnit') = 'object';
  v_locks := private.effective_locks(l.locks, l.selections, case when v_per then l.per_unit else null end, chosen,
                                     (select pr.optional from public.projects pr where pr.id = l.project_id));

  insert into public.submissions(link_code, mode, developer_id, project_id, unit_numbers, type_id, per_mode, per_unit, rep_id,
      customer, selections, lead_id, terms_version, ip, user_agent, needs_unit)
  values (l.code, l.mode, l.developer_id, l.project_id, chosen, tid,
      coalesce((p->>'perMode')::boolean, false) and array_length(chosen, 1) > 1,
      case when coalesce((p->>'perMode')::boolean, false) and array_length(chosen, 1) > 1 and jsonb_typeof(p->'perUnit') = 'object'
           then private.apply_locks_per_unit(p->'perUnit', l.selections, l.per_unit, v_locks) else null end,
      rep, c, private.apply_locks(case when jsonb_typeof(p->'selections') = 'object' then p->'selections' else '{}'::jsonb end, l.selections, v_locks), ld.id,
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
-- P-1: the signed agreement's page shows the payment details
-- ---------------------------------------------------------------------
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
    'project', private.public_project(v_project) || case when g.status = 'signed'
                 then jsonb_build_object('payment_details', (select pr.payment_details from public.projects pr where pr.id = v_project))
                 else '{}'::jsonb end,
    'rep', private.public_rep(v_rep),
    'units', (select coalesce(jsonb_agg(to_jsonb(u) order by array_position(v_units, u.number)), '[]') from public.units u where u.number = any(v_units)),
    'unitTypes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from public.unit_types t where t.id in (select u.type_id from public.units u where u.number = any(v_units))),
    'catalogue', private.public_catalogue(v_project),
    'signature', (select to_jsonb(s) from public.signatures s where s.order_id = v_order));
end $$;

-- ---------------------------------------------------------------------
-- Privileges (helpers are called only from SECURITY DEFINER code)
-- ---------------------------------------------------------------------
revoke all on function private.step_set(jsonb, text, text), private.effective_locks(jsonb, jsonb, jsonb, text[], jsonb)
  from public, anon, authenticated;

commit;
