-- QA: a Revnu super admin could not delete a lead (no delete policy), so the
-- RLS regression suite left its "RLS Test" lead behind on every run and spam
-- leads could never be purged. Deleting stays a super-admin action.
create policy "lead delete" on public.leads for delete to authenticated using ((select private.is_super_admin()));
