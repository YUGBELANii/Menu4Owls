-- Customer notification choices are independent from actual push endpoints.
create table if not exists public.customer_notification_preferences (
  browser_id uuid primary key,
  preference text not null check (preference in ('accepted', 'refused')),
  subscription_status text not null default 'not_attempted'
    check (subscription_status in ('subscribed', 'unavailable', 'denied', 'failed', 'not_attempted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_notification_preferences_preference_updated_idx
  on public.customer_notification_preferences (preference, updated_at desc);

alter table public.customer_notification_preferences enable row level security;
revoke all on public.customer_notification_preferences from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update on public.customer_notification_preferences to service_role;
drop policy if exists customer_notification_preferences_service_role_all on public.customer_notification_preferences;
create policy customer_notification_preferences_service_role_all
  on public.customer_notification_preferences
  for all to service_role
  using (true) with check (true);

comment on table public.customer_notification_preferences is
  'Customer browser notification choices; actual push endpoints remain in push_subscriptions.';
