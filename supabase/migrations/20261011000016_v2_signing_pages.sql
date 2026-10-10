-- =====================================================================
--  Revnu v2 — signing evidence + buyer-page privacy. Additive only.
--   · public_signing_read(): the agreement paginates on the phone after
--     first paint, so the page list grows (e.g. 7 → 10). Keep the LATEST
--     list the phone reports (until signed), so "read every page" is
--     checked against the pages the buyer actually had in front of them.
--   · public_developer(): never send HQ's suspension note to a buyer.
-- =====================================================================
begin;

create or replace function public.public_signing_read(p_code text, p_section text, p_sections jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.signing_links;
begin
  select * into g from public.signing_links where code = private.parse_code(p_code) for update;
  if g.code is null then raise exception 'LINK_NOT_FOUND' using errcode = 'no_data_found'; end if;
  if g.status not in ('live','viewed') then return jsonb_build_object('sections', g.sections, 'read_log', g.read_log); end if;
  update public.signing_links set
    sections = case when jsonb_typeof(p_sections) = 'array' and jsonb_array_length(p_sections) between 1 and 200
                    then p_sections else sections end,
    read_log = case when nullif(p_section, '') is not null and length(p_section) <= 40
                     and not exists (select 1 from jsonb_array_elements(read_log) e where e->>'id' = p_section)
                    then read_log || jsonb_build_array(jsonb_build_object('id', p_section, 'at', now())) else read_log end
  where code = g.code returning * into g;
  return jsonb_build_object('sections', g.sections, 'read_log', g.read_log);
end $$;

create or replace function private.public_developer(p_dev text, p_presigned boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(d) - 'plan' - 'revnu_terms' - 'master_agreement' - 'primary_email' - 'signatory_updated_by'
         - 'suspended_reason' - 'signatory_updated_by_name'
         - case when p_presigned then 'x' else 'signature' end - case when p_presigned then 'x' else 'stamp' end
  from public.developers d where d.id = p_dev;
$$;
revoke all on function private.public_developer(text, boolean) from public, anon, authenticated;

commit;
