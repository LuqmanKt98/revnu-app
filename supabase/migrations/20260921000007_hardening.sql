-- =====================================================================
--  Revnu — acceptance-test hardening (QA 21 Sep 2026)
--
--  QA-A1  attach_document() indexed any path under the order's folder even
--         when nothing had been uploaded, so a caller with the 'orders'
--         permission could move an order to "signed" / "paid" without a real
--         file (the B-05 gate was bypassable through the API). The object
--         must now exist in the private `documents` bucket, and the path may
--         not contain a ".." segment.
--  QA-A3  create_order() accepted any client-supplied id ("HACK-1",
--         "REV-26-9999"), which lets a future legitimate reservation collide
--         with a forged one. The id must now be a reference issued by
--         reserve_order_id() (format REV-26-N with N <= the sequence).
--  QA-A6  create_order() stored negative amounts; they are refused.
--  QA-A4  EXECUTE on the RPCs was still granted to PUBLIC (the anon role
--         inherits it) although 0003 revoked it from `anon` explicitly.
--         Every RPC checks permissions internally, so nothing leaked, but the
--         grant is now what the migration intended.
-- =====================================================================

create or replace function public.create_order(p jsonb)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  v_dev text := private.my_dev();
  v_id text;
  v_units text[];
  v_status text := coalesce(p->>'status', 'active');
  v_seq bigint;
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
  if coalesce((p->>'unitPrice')::numeric, 0) < 0 or coalesce((p->>'furnishCost')::numeric, 0) < 0
     or coalesce((p->>'fitoutCost')::numeric, 0) < 0 or coalesce((p->>'monthlyNet')::numeric, 0) < 0
     or coalesce((p->>'operatorFee')::numeric, 0) < 0 then
    raise exception 'amounts cannot be negative' using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(x order by ord), '{}') into v_units
  from jsonb_array_elements_text(coalesce(p->'unitNumbers', '[]'::jsonb)) with ordinality as t(x, ord);
  if array_length(v_units, 1) is null or array_length(v_units, 1) = 0 then
    raise exception 'an order needs at least one unit' using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(v_units) n left join public.units un on un.number = n where un.number is null or un.project_id <> p->>'projectId') then
    raise exception 'unit does not belong to this project' using errcode = 'check_violation';
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
  -- the object must live under this order's folder (no traversal) ...
  if position(o.developer_id || '/' || o.id || '/' in p_path) <> 1 or p_path ~ '(^|/)\.\.(/|$)' then
    raise exception 'document path does not match the order' using errcode = 'check_violation';
  end if;
  -- ... and it must really have been uploaded: a record is never created for a file that is not in Storage.
  if not exists (select 1 from storage.objects so where so.bucket_id = 'documents' and so.name = p_path) then
    raise exception 'DOCUMENT_MISSING' using errcode = 'check_violation';
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

-- The 0003 revoke targeted `anon` directly, but EXECUTE was (by default) granted to PUBLIC.
revoke execute on function public.reserve_order_id(), public.create_order(jsonb), public.transition_order(text,text),
  public.attach_document(text,text,text,text,text,bigint,text), public.cancel_order(text,text), public.reinstate_order(text),
  public.delete_order(text), public.set_receivable_paid(text,text,boolean,uuid), public.set_payout_status(text,uuid,text,text),
  public.clear_must_change_password() from public, anon;
grant execute on function public.reserve_order_id(), public.create_order(jsonb), public.transition_order(text,text),
  public.attach_document(text,text,text,text,text,bigint,text), public.cancel_order(text,text), public.reinstate_order(text),
  public.delete_order(text), public.set_receivable_paid(text,text,boolean,uuid), public.set_payout_status(text,uuid,text,text),
  public.clear_must_change_password() to authenticated, service_role;
