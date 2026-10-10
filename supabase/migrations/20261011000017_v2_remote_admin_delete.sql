-- =====================================================================
--  Revnu v2 — super-admin clean-up of remote rows (same rule as every other
--  table: only the super admin hard-deletes). Deleting a share link removes
--  its submissions and leads; inbox rows can be purged as well.
-- =====================================================================
begin;

drop policy if exists "remote delete" on public.sale_links;
create policy "remote delete" on public.sale_links for delete to authenticated using ((select private.is_super_admin()));
drop policy if exists "remote delete" on public.submissions;
create policy "remote delete" on public.submissions for delete to authenticated using ((select private.is_super_admin()));
drop policy if exists "remote delete" on public.sale_leads;
create policy "remote delete" on public.sale_leads for delete to authenticated using ((select private.is_super_admin()));
drop policy if exists "inbox delete" on public.inbox_notifications;
create policy "inbox delete" on public.inbox_notifications for delete to authenticated using ((select private.is_super_admin()) or user_id = auth.uid());

commit;
