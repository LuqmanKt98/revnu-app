-- =====================================================================
--  Revnu v2 — switch on the full price check (020's private.orders_check_prices) in place of 018's
--  unit-price-only check, once the server prices matched the wizard on randomised deals.
-- =====================================================================
begin;

drop trigger if exists orders_check_unit_price on public.orders;
drop function if exists private.orders_check_unit_price();
drop trigger if exists orders_check_prices on public.orders;
create constraint trigger orders_check_prices after insert on public.orders
  deferrable initially deferred for each row execute function private.orders_check_prices();

commit;
