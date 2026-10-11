-- =====================================================================
--  Revnu v2 — B13 follow-up: when the buyer's e-mail is corrected, a "ready to sign" e-mail still waiting in the
--  outbox for the old address is marked superseded, so only the corrected address receives it.
-- =====================================================================
begin;

create or replace function public.update_order_customer(p_order text, p jsonb)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders; c jsonb; changed text[]; v_prev_email text;
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
  v_prev_email := o.customer_email;
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
  -- B13: a new or corrected e-mail on an issued agreement gets the "ready to sign" e-mail (the first had no address
  -- or went to the wrong one); the browser dispatches the outbox right after the edit.
  if o.status = 'issued' and o.customer_email is not null and lower(o.customer_email::text) is distinct from lower(coalesce(v_prev_email, '')) then
    update public.notifications set status = 'failed', error = 'superseded: the buyer''s e-mail was corrected'
     where order_id = o.id and kind = 'issued' and status = 'queued';
    perform private.queue_notification(o, 'issued');
  end if;
  return o;
end $$;

commit;
