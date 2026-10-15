-- =====================================================================
--  Revnu v2 — the IBAN in the payment details is free text (client request, 15 Oct 2026). Additive.
--   P-2  any bank's IBAN or account number is accepted as entered (Saudi IBANs carry letters in the account
--        part, and other formats must work too); the first payment % and pay-within days keep their checks
-- =====================================================================
begin;

alter table public.projects drop constraint if exists projects_payment_details_chk;
alter table public.projects add constraint projects_payment_details_chk check (payment_details is null or (
  jsonb_typeof(payment_details) = 'object'
  and coalesce(jsonb_typeof(payment_details->'iban'), 'null') in ('string', 'null')
  and coalesce(jsonb_typeof(payment_details->'firstPct'), 'null') in ('number', 'null')
  and coalesce(jsonb_typeof(payment_details->'dueDays'), 'null') in ('number', 'null')
  and coalesce(case when jsonb_typeof(payment_details->'firstPct') = 'number' then (payment_details->>'firstPct')::numeric end, 0) between 0 and 100
  and coalesce(case when jsonb_typeof(payment_details->'dueDays') = 'number' then (payment_details->>'dueDays')::numeric end, 0) between 0 and 365));

commit;
