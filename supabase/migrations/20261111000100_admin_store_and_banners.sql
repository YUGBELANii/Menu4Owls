-- Additive shared store settings and storefront banners.
create table if not exists public.store_settings (
  id integer primary key check (id = 1),
  operating_mode text not null default 'schedule' check (operating_mode in ('schedule','override')),
  opening_time time not null default time '18:00',
  closing_time time not null default time '03:00',
  override_mode text check (override_mode in ('open','closed','late','closed_today')),
  override_start timestamptz,
  override_end timestamptz,
  expires_at timestamptz,
  open_message text not null default '🟢 OPEN — Orders accepted',
  closed_message text not null default '🔴 CLOSED — Opens at 6:00 PM',
  late_message text not null default 'Opening later today.',
  updated_at timestamptz not null default now(),
  constraint store_settings_override_requires_mode check (operating_mode = 'schedule' or override_mode is not null),
  constraint store_settings_override_window_valid check (override_start is null or override_end is null or override_end > override_start),
  constraint store_settings_override_expiry_required check (operating_mode = 'schedule' or expires_at is not null),
  constraint store_settings_hours_distinct check (opening_time <> closing_time)
);
-- Also repair constraints if an earlier partial application created the table first.
do $settings_constraints$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.store_settings'::regclass and conname='store_settings_override_expiry_required') then
    alter table public.store_settings add constraint store_settings_override_expiry_required
      check (operating_mode = 'schedule' or expires_at is not null);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.store_settings'::regclass and conname='store_settings_hours_distinct') then
    alter table public.store_settings add constraint store_settings_hours_distinct
      check (opening_time <> closing_time);
  end if;
end
$settings_constraints$;
insert into public.store_settings(id) values (1) on conflict (id) do nothing;

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null default '',
  image_url text,
  visible boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists banners_visible_order_idx on public.banners (visible, display_order, created_at);
insert into public.banners(title,content,visible,display_order)
select '🪔 HAPPY DIWALI 🪔',
       E'Wishing You a Bright & Joyful Diwali!\nMay your celebrations be filled with happiness, warmth and delicious food.\n— Team Owlz Corner',
       true, 0
where not exists (
  select 1 from public.banners
  where title = '🪔 HAPPY DIWALI 🪔'
     or content = E'Wishing You a Bright & Joyful Diwali!\nMay your celebrations be filled with happiness, warmth and delicious food.\n— Team Owlz Corner'
);

create or replace function public.touch_store_content_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;
revoke all on function public.touch_store_content_updated_at() from public, anon, authenticated;
grant execute on function public.touch_store_content_updated_at() to service_role;
drop trigger if exists store_settings_set_updated_at on public.store_settings;
create trigger store_settings_set_updated_at before update on public.store_settings
for each row execute function public.touch_store_content_updated_at();
drop trigger if exists banners_set_updated_at on public.banners;
create trigger banners_set_updated_at before update on public.banners
for each row execute function public.touch_store_content_updated_at();

create or replace function public.validate_store_settings()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.opening_time = new.closing_time then
    raise exception 'Opening and closing times must be different';
  end if;
  if new.operating_mode = 'override' then
    if new.expires_at is null or new.expires_at <= now() then
      raise exception 'Temporary overrides require a future expiry time';
    end if;
    if new.expires_at > now() + interval '30 days' then
      raise exception 'Temporary overrides can be set for at most 30 days';
    end if;
    if new.override_start is not null and new.override_start >= new.expires_at then
      raise exception 'Override start must be before expiry';
    end if;
    if new.override_end is not null and new.override_end > new.expires_at then
      raise exception 'Override end must be at or before expiry';
    end if;
    if new.override_start is not null and new.override_end is not null and new.override_end <= new.override_start then
      raise exception 'Override end must be after its start';
    end if;
    if new.override_mode = 'late' and (new.override_start is null or new.override_end is null) then
      raise exception 'Late opening requires a start and delayed-opening end time';
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function public.validate_store_settings() from public, anon, authenticated;
grant execute on function public.validate_store_settings() to service_role;
drop trigger if exists store_settings_validate on public.store_settings;
create trigger store_settings_validate before insert or update on public.store_settings
for each row execute function public.validate_store_settings();

alter table public.store_settings enable row level security;
alter table public.banners enable row level security;
revoke all on public.store_settings, public.banners from public, anon, authenticated;
grant all on public.store_settings, public.banners to service_role;
grant select on public.banners to anon, authenticated;
drop policy if exists store_settings_public_read on public.store_settings;
drop policy if exists banners_public_visible_read on public.banners;
create policy banners_public_visible_read on public.banners for select to anon, authenticated using (visible);

create or replace function public.get_store_status()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare s public.store_settings%rowtype; local_now timestamp := timezone('Asia/Kolkata', now());
  local_time time; is_open boolean := false; late boolean := false; override_active boolean := false;
  schedule_open boolean := false;
begin
  select * into s from public.store_settings where id=1;
  if not found then raise exception 'Store settings are not configured'; end if;
  local_time := local_now::time;
  schedule_open := (s.opening_time < s.closing_time and local_time >= s.opening_time and local_time < s.closing_time)
    or (s.opening_time > s.closing_time and (local_time >= s.opening_time or local_time < s.closing_time));
  override_active := s.operating_mode='override' and
    s.expires_at > now() and
    (s.override_start is null or s.override_start <= now()) and
    (s.override_end is null or s.override_end > now());
  if override_active then
    if s.override_mode='open' then
      is_open := true;
    elsif s.override_mode='late' then
      is_open := false;
      late := true;
    else
      is_open := false;
    end if;
  else
    is_open := schedule_open;
  end if;
  return jsonb_build_object('is_open',is_open,'is_late',late,'message',case when is_open then s.open_message when late then s.late_message else s.closed_message end);
end $$;
revoke all on function public.get_store_status() from public;
grant execute on function public.get_store_status() to anon, authenticated, service_role;
notify pgrst, 'reload schema';
