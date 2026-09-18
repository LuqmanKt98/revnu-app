-- =====================================================================
--  Revnu — order lifecycle RPCs
--  Every multi-row business transition lives here so it is atomic and
--  permission-checked on the server regardless of which UI path calls it.
--
--  Sales-driven order lifecycle (unchanged from the prototype):
--    active → issued → signed → paid        (+ cancelled / reinstated)
--  Gates (audit B-05 fixed structurally):
--    issued → signed  requires a signed_contract document
--    signed → paid    requires a payment_proof document
-- =====================================================================

create or replace function private.caller_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(name, email::text) from public.profiles where id = auth.uid();
$$;

create or replace function private.log_activity(p_order text, p_event text, p_extra jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.order_activity(order_id, event, by_user_id, by_name, extra)
  values (p_order, p_event, auth.uid(), coalesce(private.caller_name(), 'system'), coalesce(p_extra, '{}'));
end $$;

-- The prototype's NOTIFY_TEMPLATES, now an outbox row per event.
create or replace function private.queue_notification(o public.orders, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare s text; s_ar text;
begin
  s := case p_kind
         when 'issued' then 'Your agreement is ready to sign'
         when 'signed' then 'Signed agreement received'
         when 'paid'   then 'Payment confirmed — welcome aboard'
         else null end;
  s_ar := case p_kind
         when 'issued' then 'اتفاقيتك جاهزة للتوقيع'
         when 'signed' then 'تم استلام الاتفاقية الموقّعة'
         when 'paid'   then 'تم تأكيد الدفع — أهلاً بك'
         else null end;
  if s is null then return; end if;
  insert into public.notifications(order_id, kind, channel, to_email, subject, subject_ar, payload)
  values (o.id, p_kind, 'email', o.customer_email, s, s_ar,
          jsonb_build_object('orderId', o.id, 'customerName', o.customer_name, 'developerId', o.developer_id, 'projectId', o.project_id, 'status', o.status));
  perform private.log_activity(o.id, 'notification', jsonb_build_object('channel','email','to', coalesce(o.customer_email::text,'—'),'subject', s,'subjectAr', s_ar,'kind', p_kind));
end $$;

-- Who may act on an order's lifecycle: a member of that developer holding the
-- 'orders' permission, or Revnu staff holding 'orders'.
create or replace function private.can_act_on_order(p_dev text)
returns boolean language sql stable security definer set search_path = public as $$
  select (p_dev = private.my_dev() and private.dev_has('orders')) or private.revnu_has('orders');
$$;

-- ---------------------------------------------------------------------
-- reserve_order_id(): the wizard shows the real reference before submit
-- ---------------------------------------------------------------------
create or replace function public.reserve_order_id()
returns text language plpgsql security definer set search_path = public as $$
begin
  if not (private.dev_has('orders') or private.revnu_has('orders')) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  return 'REV-26-' || nextval('public.order_seq')::text;
end $$;

-- ---------------------------------------------------------------------
-- create_order(payload): the sales wizard submit. Atomic with unit locking.
-- payload keys mirror the prototype's createOrder() call exactly.
-- ---------------------------------------------------------------------
create or replace function public.create_order(p jsonb)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  v_dev text := private.my_dev();
  v_id text;
  v_units text[];
  v_status text := coalesce(p->>'status', 'active');
  u text; i int := 0;
begin
  if v_dev is null or not private.dev_has('orders') then
    raise exception 'Only a developer''s sales team can submit an order' using errcode = 'insufficient_privilege';
  end if;
  if v_status not in ('active','issued') then
    raise exception 'invalid initial status %', v_status using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.projects where id = p->>'projectId' and developer_id = v_dev) then
    raise exception 'project does not belong to your developer' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(array_agg(x order by ord), '{}') into v_units
  from jsonb_array_elements_text(coalesce(p->'unitNumbers', '[]'::jsonb)) with ordinality as t(x, ord);
  if array_length(v_units, 1) is null or array_length(v_units, 1) = 0 then
    raise exception 'an order needs at least one unit' using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(v_units) n left join public.units un on un.number = n where un.number is null or un.project_id <> p->>'projectId') then
    raise exception 'unit does not belong to this project' using errcode = 'check_violation';
  end if;

  v_id := coalesce(nullif(p->>'id',''), 'REV-26-' || nextval('public.order_seq')::text);
  if exists (select 1 from public.orders where id = v_id) then
    raise exception 'order % already submitted', v_id using errcode = 'unique_violation';
  end if;
  insert into public.orders(id, developer_id, project_id, rep_id, status, unit_number,
      customer_name, customer_national_id, customer_email, customer,
      per_unit_mode, per_unit, package_id, design_id, palette_id, smart_id, ops_id,
      fitout, fitout_cost, unit_price, furnish_cost, operator_fee, monthly_net)
  values (v_id, v_dev, p->>'projectId', auth.uid(), v_status, v_units[1],
      p->>'customerName', p->>'customerId', nullif(p->>'customerEmail',''), coalesce(p->'customer','{}'::jsonb),
      coalesce((p->>'perUnitMode')::boolean, false), p->'perUnit',
      nullif(p->>'packageId',''), nullif(p->>'designId',''), nullif(p->>'paletteId',''), nullif(p->>'smartId',''), nullif(p->>'opsId',''),
      coalesce((p->>'fitout')::boolean,false), round(coalesce((p->>'fitoutCost')::numeric,0)),
      round(coalesce((p->>'unitPrice')::numeric,0)), round(coalesce((p->>'furnishCost')::numeric,0)),
      coalesce((p->>'operatorFee')::numeric,0), round(coalesce((p->>'monthlyNet')::numeric,0)))
  returning * into o;

  foreach u in array v_units loop
    i := i + 1;
    begin
      insert into public.order_units(order_id, unit_number, sort, is_live) values (v_id, u, i, true);
    exception when unique_violation then
      raise exception 'UNIT_TAKEN:%', u using errcode = 'unique_violation';
    end;
  end loop;

  perform private.log_activity(v_id, 'created', jsonb_build_object('units', to_jsonb(v_units), 'status', v_status));
  if v_status = 'issued' then perform private.queue_notification(o, 'issued'); end if;
  return o;
end $$;

-- ---------------------------------------------------------------------
-- transition_order(order, to): exactly one step forward, gated.
-- ---------------------------------------------------------------------
create or replace function public.transition_order(p_order text, p_to text)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  flow text[] := array['active','issued','signed','paid'];
  cur_i int; to_i int;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'order not found' using errcode = 'no_data_found'; end if;
  if not private.can_act_on_order(o.developer_id) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  if o.status = 'cancelled' then raise exception 'ORDER_CANCELLED' using errcode = 'check_violation'; end if;
  cur_i := array_position(flow, case when o.status = 'completed' then 'paid' else o.status end);
  to_i  := array_position(flow, p_to);
  if to_i is null or cur_i is null or to_i <> cur_i + 1 then
    raise exception 'INVALID_TRANSITION:%→%', o.status, p_to using errcode = 'check_violation';
  end if;
  if p_to = 'signed' and not exists (select 1 from public.documents where order_id = o.id and kind = 'signed_contract') then
    raise exception 'NEEDS_SIGNED_CONTRACT' using errcode = 'check_violation';
  end if;
  if p_to = 'paid' and not exists (select 1 from public.documents where order_id = o.id and kind = 'payment_proof') then
    raise exception 'NEEDS_PAYMENT_PROOF' using errcode = 'check_violation';
  end if;

  update public.orders set
    status    = p_to,
    signed_at = case when p_to = 'signed' then coalesce(signed_at, current_date) else signed_at end,
    paid_at   = case when p_to = 'paid'   then coalesce(paid_at,   current_date) else paid_at   end
  where id = o.id returning * into o;

  perform private.log_activity(o.id, 'status', jsonb_build_object('from', flow[cur_i], 'to', p_to));
  perform private.queue_notification(o, p_to);
  if p_to = 'paid' then
    insert into public.invoices(order_id) values (o.id) on conflict do nothing;
    if found then perform private.log_activity(o.id, 'invoice', jsonb_build_object('invoice', 'INV-' || replace(o.id, 'REV-', ''))); end if;
  end if;
  return o;
end $$;

-- ---------------------------------------------------------------------
-- attach_document(): index an uploaded Storage object against an order
-- ---------------------------------------------------------------------
create or replace function public.attach_document(p_order text, p_kind text, p_path text, p_name text, p_mime text default null, p_size bigint default null, p_milestone text default null)
returns public.documents language plpgsql security definer set search_path = public as $$
declare o public.orders; d public.documents;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'order not found' using errcode = 'no_data_found'; end if;
  if p_kind = 'transfer_proof' then
    if not private.revnu_has('financials') then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  elsif not private.can_act_on_order(o.developer_id) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  -- the object must live under this order's folder
  if position(o.developer_id || '/' || o.id || '/' in p_path) <> 1 then
    raise exception 'document path does not match the order' using errcode = 'check_violation';
  end if;
  insert into public.documents(order_id, kind, milestone_id, storage_path, file_name, mime, size, uploaded_by)
  values (o.id, p_kind, p_milestone, p_path, p_name, p_mime, p_size, auth.uid())
  returning * into d;
  if p_kind = 'signed_contract' then
    update public.orders set signed_contract_url = p_name, signed_at = coalesce(signed_at, current_date) where id = o.id;
    perform private.log_activity(o.id, 'upload', jsonb_build_object('file', p_name));
  elsif p_kind = 'payment_proof' then
    update public.orders set payment_proof_url = p_name, paid_at = coalesce(paid_at, current_date) where id = o.id;
    perform private.log_activity(o.id, 'proof', jsonb_build_object('file', p_name));
  else
    perform private.log_activity(o.id, 'transfer_proof', jsonb_build_object('file', p_name, 'milestone', p_milestone));
  end if;
  return d;
end $$;

-- ---------------------------------------------------------------------
-- cancel / reinstate (soft delete with an audit trail)
-- ---------------------------------------------------------------------
create or replace function public.cancel_order(p_order text, p_reason text)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'order not found' using errcode = 'no_data_found'; end if;
  if not ((o.developer_id = private.my_dev() and private.dev_has('cancel')) or private.is_super_admin()) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  if o.status = 'cancelled' then return o; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'REASON_REQUIRED' using errcode = 'check_violation'; end if;
  update public.orders set status = 'cancelled', cancelled_at = now(), cancel_reason = trim(p_reason),
         cancelled_by = private.caller_name(), status_before_cancel = o.status
  where id = o.id returning * into o;
  perform private.log_activity(o.id, 'status', jsonb_build_object('from', o.status_before_cancel, 'to', 'cancelled'));
  perform private.log_activity(o.id, 'cancelled', jsonb_build_object('reason', trim(p_reason)));
  return o;
end $$;

create or replace function public.reinstate_order(p_order text)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders; back text;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'order not found' using errcode = 'no_data_found'; end if;
  if not ((o.developer_id = private.my_dev() and private.dev_has('cancel')) or private.is_super_admin()) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  if o.status <> 'cancelled' then return o; end if;
  back := coalesce(o.status_before_cancel, 'active');
  begin
    update public.orders set status = back, cancelled_at = null, cancel_reason = null, cancelled_by = null,
           status_before_cancel = null, reinstated_at = now()
    where id = o.id returning * into o;
  exception when unique_violation then
    -- a unit was sold to someone else meanwhile (order_units_one_live_order_per_unit)
    raise exception 'UNIT_TAKEN' using errcode = 'unique_violation';
  end;
  perform private.log_activity(o.id, 'reinstated', jsonb_build_object('to', back));
  return o;
end $$;

-- Super-admin hard delete (the prototype's removeEntity('order')). Units are released by the order_units trigger.
create or replace function public.delete_order(p_order text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_super_admin() then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  delete from public.orders where id = p_order;
end $$;

-- ---------------------------------------------------------------------
-- Revnu-side money: receivable milestones + commission payouts
-- ---------------------------------------------------------------------
create or replace function public.set_receivable_paid(p_order text, p_milestone text, p_paid boolean, p_document uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_paid then
    if not private.revnu_has('financials') then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
    insert into public.receivable_paid(order_id, milestone_id, document_id, marked_by)
    values (p_order, p_milestone, p_document, auth.uid())
    on conflict (order_id, milestone_id) do update set document_id = coalesce(excluded.document_id, public.receivable_paid.document_id), paid_at = now(), marked_by = auth.uid();
    perform private.log_activity(p_order, 'receivable_paid', jsonb_build_object('milestone', p_milestone));
  else
    -- un-ticking a received milestone is a super-admin action (prototype: CAN_DELETE)
    if not private.is_super_admin() then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
    delete from public.receivable_paid where order_id = p_order and milestone_id = p_milestone;
    perform private.log_activity(p_order, 'receivable_unpaid', jsonb_build_object('milestone', p_milestone));
  end if;
end $$;

create or replace function public.set_payout_status(p_order text, p_user uuid, p_level text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.revnu_has('financials') then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  if p_status not in ('pending','paid') then raise exception 'bad status' using errcode = 'check_violation'; end if;
  insert into public.payouts(order_id, user_id, level_id, status) values (p_order, p_user, p_level, p_status)
  on conflict (order_id, user_id, level_id) do update set status = excluded.status, updated_at = now();
end $$;

-- ---------------------------------------------------------------------
-- Profiles: self-service password flag + soft delete (used by /api/users)
-- ---------------------------------------------------------------------
create or replace function public.clear_must_change_password()
returns void language sql security definer set search_path = public as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;

-- Universal delete for catalogue kinds (prototype removeEntity) is done with plain DELETE
-- statements under the super-admin policies; orders use delete_order().

grant execute on function public.reserve_order_id(), public.create_order(jsonb), public.transition_order(text,text),
  public.attach_document(text,text,text,text,text,bigint,text), public.cancel_order(text,text), public.reinstate_order(text),
  public.delete_order(text), public.set_receivable_paid(text,text,boolean,uuid), public.set_payout_status(text,uuid,text,text),
  public.clear_must_change_password() to authenticated;
revoke execute on function public.reserve_order_id(), public.create_order(jsonb), public.transition_order(text,text),
  public.attach_document(text,text,text,text,text,bigint,text), public.cancel_order(text,text), public.reinstate_order(text),
  public.delete_order(text), public.set_receivable_paid(text,text,boolean,uuid), public.set_payout_status(text,uuid,text,text),
  public.clear_must_change_password() from anon;
