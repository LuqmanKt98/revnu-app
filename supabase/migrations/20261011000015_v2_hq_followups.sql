-- =====================================================================
--  Revnu v2 — HQ follow-ups. Additive only.
--   · layout_options.summary / summary_ar: the option's description the
--     layout drawer edits (the sales step and agreement show it).
--   · developers.suspended / suspended_reason: HQ → Developer → Plan →
--     "Suspend access". The developer portal shows the reason; while
--     suspended no new order or share link can be created for that
--     developer (signing of agreements already issued is unaffected).
-- =====================================================================
begin;

alter table public.layout_options add column if not exists summary    text;
alter table public.layout_options add column if not exists summary_ar text;

alter table public.developers add column if not exists suspended        boolean not null default false;
alter table public.developers add column if not exists suspended_reason text;

create or replace function private.block_when_suspended() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.developers where id = new.developer_id and suspended) then
    raise exception 'SUSPENDED' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists orders_block_suspended on public.orders;
create trigger orders_block_suspended before insert on public.orders for each row execute function private.block_when_suspended();
drop trigger if exists sale_links_block_suspended on public.sale_links;
create trigger sale_links_block_suspended before insert on public.sale_links for each row execute function private.block_when_suspended();

commit;
