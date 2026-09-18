-- =====================================================================
--  Revnu — Storage buckets + object policies
--    documents (private): signed contracts, proofs of payment, transfer proofs
--                         path: {developer_id}/{order_id}/{kind}-{uuid}.{ext}
--    media (public):      unit-type renders / floor plans / developer logos
--                         path: developers/{developer_id}/... or projects/{project_id}/...
--  Replaces the prototype's base64-in-localStorage files (audit SEC-05 / B-06).
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 26214400,
   array['application/pdf','image/png','image/jpeg','image/webp','image/heic',
         'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('media', 'media', true, 15728640,
   array['image/png','image/jpeg','image/webp','image/svg+xml','image/gif','application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- documents: tenant-scoped by the first path segment (developer id)
create policy "documents read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (select private.can_read_dev((storage.foldername(name))[1])));

create policy "documents upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (
      (select private.revnu_has('orders')) or (select private.revnu_has('financials'))
      or ((storage.foldername(name))[1] = (select private.my_dev()) and (select private.dev_has('orders')))
    )
  );

-- objects are immutable once indexed; only super admins may remove them
create policy "documents delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (select private.is_super_admin()));

-- media: public read (bucket is public), Revnu 'developers' permission writes
create policy "media read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'media');

create policy "media write" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (select private.revnu_has('developers')));

create policy "media update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (select private.revnu_has('developers')))
  with check (bucket_id = 'media' and (select private.revnu_has('developers')));

create policy "media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (select private.revnu_has('developers')));
