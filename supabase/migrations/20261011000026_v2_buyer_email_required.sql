-- =====================================================================
--  Revnu v2 — the buyer's e-mail is required (client feedback, 13 Oct 2026). Additive.
--   E-1  wherever the buyer's details are checked (the buyer's link, Edit buyer), the e-mail must be
--        present and valid: the agreement and the payment details after signing are sent there
-- =====================================================================
begin;

create or replace function private.clean_customer(c jsonb)
returns jsonb language plpgsql immutable as $$
declare v_out jsonb;
begin
  if jsonb_typeof(c) is distinct from 'object' then raise exception 'NAME_REQUIRED' using errcode = 'check_violation'; end if;
  if length(trim(coalesce(c->>'fullName', ''))) < 2 then raise exception 'NAME_REQUIRED' using errcode = 'check_violation'; end if;
  if not private.valid_national_id(c->>'nationalId') then raise exception 'INVALID_NATIONAL_ID' using errcode = 'check_violation'; end if;
  if not private.valid_mobile(c->>'mobileCode', c->>'mobile') then raise exception 'INVALID_MOBILE' using errcode = 'check_violation'; end if;
  if coalesce(trim(c->>'email'), '') = '' then raise exception 'EMAIL_REQUIRED' using errcode = 'check_violation'; end if;
  if not private.valid_email(c->>'email') then raise exception 'INVALID_EMAIL' using errcode = 'check_violation'; end if;
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_out
  from jsonb_each(c) as e(k, v)
  where k in ('fullName','fullNameAr','nationalId','mobileCode','mobile','email','city','dob','marital','funding','beneficiary','nationality')
    and length(v::text) <= 300;
  return v_out || jsonb_build_object('fullName', left(trim(c->>'fullName'), 120), 'nationalId', regexp_replace(c->>'nationalId', '\s', '', 'g'));
end $$;

commit;
