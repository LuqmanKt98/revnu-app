-- =====================================================================
--  Revnu — QA fix: saving the commission ladder failed every time
--
--  profiles(developer_id, commission_level_id) references
--  commission_levels(developer_id, id) ON DELETE SET NULL. For a
--  multi-column foreign key, SET NULL nulls EVERY referencing column, so
--  replacing the ladder (delete + insert) tried to clear developer_id on
--  every team member holding a level and the profiles_guard trigger (or the
--  revnu-xor-developer check) refused it: "reports_to must belong to the
--  same developer". Only the level column must be cleared (PostgreSQL 15+).
-- =====================================================================
alter table public.profiles drop constraint profiles_commission_level_fk;
alter table public.profiles add constraint profiles_commission_level_fk
  foreign key (developer_id, commission_level_id) references public.commission_levels(developer_id, id)
  on delete set null (commission_level_id);
