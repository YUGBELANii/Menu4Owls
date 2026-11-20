-- Persist a durable fulfillment choice for customer and admin-created orders.
-- Existing orders retain their previous delivery pricing and default to delivery.
alter table public.orders
  add column if not exists fulfillment_type text not null default 'delivery';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_fulfillment_type_valid'
  ) then
    alter table public.orders
      add constraint orders_fulfillment_type_valid
      check (fulfillment_type in ('delivery', 'takeout'));
  end if;
end $$;

notify pgrst, 'reload schema';
