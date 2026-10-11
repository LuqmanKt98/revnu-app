-- =====================================================================
--  Revnu v2 — per-IP limits on the public functions, set in one place.
--  Higher than the first cut in 018: buyers at a sales event share the
--  office Wi-Fi, and mobile carriers put many phones behind one address.
--  Still a ceiling for scripts flooding leads, submissions or code guesses.
--    unknown codes 60 · lead starts 60 · submissions 30 · signatures 60 (per IP, per hour)
-- =====================================================================
begin;

create or replace function private.over_limit(p_kind text, p_max int)
returns boolean language sql stable security definer set search_path = public as $$
  select count(*) >= coalesce(('{"miss":60,"lead":60,"submit":30,"sign":60}'::jsonb ->> p_kind)::int, p_max)
  from private.public_hits
  where kind = p_kind and ip = coalesce(private.request_ip(), 'unknown') and at > now() - interval '1 hour';
$$;

commit;
