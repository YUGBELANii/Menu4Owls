-- Manual orders extend the existing orders row and reuse checkout's token reservation/generator.
-- Prerequisite: create_order_with_token, generate_order_token, order_token_seq,
-- order_token_reservations, products and orders already exist in this project.

alter table public.orders
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists source text;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='orders_customer_name_valid') then
    alter table public.orders add constraint orders_customer_name_valid
      check (customer_name is null or char_length(btrim(customer_name)) between 1 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='orders_customer_phone_valid') then
    alter table public.orders add constraint orders_customer_phone_valid
      check (customer_phone is null or (char_length(customer_phone) between 7 and 32 and customer_phone ~ '^[+0-9(][0-9 ()-]*$' and char_length(regexp_replace(customer_phone, '[^0-9]', '', 'g')) between 7 and 15));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='orders_source_valid') then
    alter table public.orders add constraint orders_source_valid
      check (source is null or source in ('website','whatsapp','phone'));
  end if;
end
$constraints$;

create or replace function public.create_manual_order_with_token(
  p_request_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_source text,
  p_items jsonb,
  p_policy_accepted boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_customer_name text := btrim(coalesce(p_customer_name, ''));
  v_customer_phone text := btrim(coalesce(p_customer_phone, ''));
  v_token_items jsonb;
  v_items jsonb;
  v_token text;
  v_order_id uuid;
  v_subtotal numeric(10,2);
  v_existing public.orders%rowtype;
begin
  -- Match the email allowlist used by existing order SELECT/UPDATE policies.
  if lower(coalesce(auth.jwt() ->> 'email', '')) not in ('rajbelani449@gmail.com','yashbelani8777@gmail.com') then
    raise exception using errcode='42501', message='Authorized administrator required';
  end if;

  if p_request_id is null then raise exception 'A request ID is required'; end if;
  if char_length(v_customer_name) not between 1 and 120 then raise exception 'Customer name must be 1–120 characters'; end if;
  if char_length(v_customer_phone) not between 7 and 32
     or v_customer_phone !~ '^[+0-9(][0-9 ()-]*$'
     or char_length(regexp_replace(v_customer_phone, '[^0-9]', '', 'g')) not between 7 and 15 then
    raise exception 'Enter a valid customer phone number';
  end if;
  if p_source is null or p_source not in ('whatsapp','phone') then raise exception 'Source must be WhatsApp or phone'; end if;
  if p_policy_accepted is distinct from true then raise exception 'Confirm that the customer accepted the order policy'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Order items must be an array'; end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then raise exception 'Order must contain 1–50 item lines'; end if;

  -- The existing generator expects {id, quantity}; it owns the advisory lock,
  -- idempotency reservation, and atomic sequence allocation.
  select jsonb_agg(jsonb_build_object('id', e.item ->> 'id', 'quantity', e.item ->> 'qty') order by e.ordinality)
    into v_token_items
  from jsonb_array_elements(p_items) with ordinality as e(item, ordinality);

  v_token := public.generate_order_token(p_request_id, v_token_items);

  select r.order_id into v_order_id
  from public.order_token_reservations r
  where r.request_id = p_request_id;

  if v_order_id is not null then
    select * into v_existing from public.orders where id = v_order_id;
    if not found then raise exception 'Token reservation points to a missing order'; end if;
    if v_existing.customer_name is distinct from v_customer_name
       or v_existing.customer_phone is distinct from v_customer_phone
       or v_existing.source is distinct from p_source then
      raise exception 'This request ID was already used with different customer details';
    end if;
    return jsonb_build_object('order_id',v_existing.id,'token',v_existing.order_token,'status',v_existing.status,'total',v_existing.total);
  end if;

  -- Re-price and snapshot the catalogue on the server; ignore all client prices.
  select coalesce(sum(p.price * (e.item ->> 'qty')::integer),0),
         jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'price',p.price,'qty',(e.item ->> 'qty')::integer) order by e.ordinality)
    into v_subtotal, v_items
  from jsonb_array_elements(p_items) with ordinality as e(item, ordinality)
  join public.products p on p.id = (e.item ->> 'id')::uuid
  where p.available = true;

  if v_items is null or jsonb_array_length(v_items) <> jsonb_array_length(p_items) then
    raise exception 'Order contains an invalid or unavailable product';
  end if;

  insert into public.orders (
    order_token, items, subtotal, discount, delivery_fee, total, status,
    policy_accepted, policy_version, policy_accepted_at,
    customer_name, customer_phone, source
  ) values (
    v_token, v_items, v_subtotal, 0, 20, v_subtotal + 20, 'pending',
    true, 'refund-policy-v1', now(),
    v_customer_name, v_customer_phone, p_source
  ) returning id into v_order_id;

  update public.order_token_reservations
  set order_id = v_order_id
  where request_id = p_request_id and order_id is null;
  if not found then raise exception 'Could not link token reservation to the order'; end if;

  return jsonb_build_object('order_id',v_order_id,'token',v_token,'status','pending','total',v_subtotal + 20);
end;
$function$;

revoke all on function public.create_manual_order_with_token(uuid,text,text,text,jsonb,boolean) from public, anon;
grant execute on function public.create_manual_order_with_token(uuid,text,text,text,jsonb,boolean) to authenticated;
notify pgrst, 'reload schema';
