-- =====================================================================
--  Revnu — anonymous-role grants
--
--  0002_rls.sql revoked every table privilege from `anon` so that a
--  signed-out visitor can read nothing (audit SEC-02). Row Level Security
--  policies alone are not enough: PostgREST also needs the table GRANT.
--  Two things legitimately need the anonymous role:
--
--    1. developers_public — brand chrome for the white-labelled sign-in
--       page (granted in 0002).
--    2. leads            — the public "Interested" form on the marketing
--       site posts through /api/leads with the anon key. The RLS policy
--       "lead insert" already restricts it to status = 'new', and reading
--       leads back stays denied, so a visitor can submit but never list.
-- =====================================================================
grant insert on public.leads to anon;

-- Belt and braces: anything created in public from now on is invisible to
-- anonymous visitors unless a migration grants it explicitly.
alter default privileges in schema public revoke all on tables from anon;
