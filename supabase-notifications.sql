-- Owlz Corner customer Web Push. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(), endpoint text not null unique,
  p256dh text not null, auth text not null, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(), type text not null check(type in ('opening','closing')),
  title text not null, message text not null, enabled boolean not null default true,
  last_used_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.notification_settings (
  id integer primary key check(id=1), opening_enabled boolean not null default true,
  closing_enabled boolean not null default true, updated_at timestamptz not null default now()
);
insert into public.notification_settings(id) values(1) on conflict do nothing;
create table if not exists public.notification_campaigns (
  id uuid primary key default gen_random_uuid(), campaign_type text not null check(campaign_type in ('manual','opening','closing')),
  business_day date, title text not null, body text not null, image_url text, destination_url text,
  scheduled_at timestamptz, status text not null default 'queued', sent_at timestamptz,
  success_count integer not null default 0, failure_count integer not null default 0, created_at timestamptz not null default now(),
  unique(campaign_type,business_day)
);
create table if not exists public.notification_logs (
  id bigint generated always as identity primary key, campaign_id uuid not null references public.notification_campaigns(id) on delete cascade,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  delivery_status text not null check(delivery_status in ('sent','failed')), error_details text,
  sent_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notification_campaigns enable row level security;
alter table public.notification_logs enable row level security;
revoke all on public.push_subscriptions, public.notification_templates, public.notification_settings, public.notification_campaigns, public.notification_logs from anon, authenticated;

create or replace function public.claim_automatic_notification(p_type text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  local_now timestamp := timezone('Asia/Kolkata', now());
  v_business_day date := (local_now::date - case when local_now::time < time '03:00' then 1 else 0 end);
  cafe_open boolean := (local_now::time >= time '18:00' or local_now::time < time '03:00');
  enabled boolean; chosen public.notification_templates%rowtype; campaign public.notification_campaigns%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('owlzz-auto-'||p_type||'-'||v_business_day::text));
  if p_type not in ('opening','closing') then return jsonb_build_object('reason','invalid-type'); end if;
  select case when p_type='opening' then opening_enabled else closing_enabled end into enabled from public.notification_settings where id=1;
  if not coalesce(enabled,false) then return jsonb_build_object('reason','disabled'); end if;
  if not cafe_open then return jsonb_build_object('reason','cafe-closed'); end if;
  if p_type='opening' and (local_now::time < time '18:00' or local_now::time >= time '19:00') then return jsonb_build_object('reason','outside-opening-window'); end if;
  if p_type='closing' and (local_now::time < time '02:55' or local_now::time >= time '03:00') then return jsonb_build_object('reason','outside-closing-window'); end if;
  if exists(select 1 from public.notification_campaigns c where c.campaign_type=p_type and c.business_day=v_business_day) then return jsonb_build_object('reason','already-sent'); end if;
  select * into chosen from public.notification_templates where type=p_type and enabled order by case when last_used_at > now()-interval '7 days' then 1 else 0 end, random() limit 1;
  if chosen.id is null then return jsonb_build_object('reason','no-enabled-template'); end if;
  insert into public.notification_campaigns(campaign_type,business_day,title,body,status,scheduled_at,destination_url)
    values(p_type,v_business_day,chosen.title,chosen.message,'sending',now(),'/') returning * into campaign;
  update public.notification_templates set last_used_at=now() where id=chosen.id;
  return jsonb_build_object('id',campaign.id,'title',campaign.title,'body',campaign.body,'image_url',campaign.image_url,'destination_url',campaign.destination_url);
end; $$;
revoke all on function public.claim_automatic_notification(text) from public, anon, authenticated;

insert into public.notification_templates(type,title,message) values
('opening','Owlz Corner is open','The Owl has awakened! Your cravings may begin.'),
('opening','Owlz Corner is open','Lights on, kitchen ready, stomachs beware!'),
('opening','Owlz Corner is open','Your midnight food destination is OPEN!'),
('closing','Owlz Corner closing soon','Five minutes left before the Owl goes to sleep!'),
('closing','Owlz Corner closing soon','Last flight departing! Place your order before closing.'),
('closing','Owlz Corner closing soon','The kitchen is about to call it a night!');

-- Store endpoint/secret in Vault before scheduling; replace URL with the production domain.
-- select vault.create_secret('https://YOUR_DOMAIN/api/notifications-admin','owlzz_notification_url');
-- select vault.create_secret('YOUR_NOTIFICATION_CRON_SECRET','owlzz_notification_cron_secret');
select cron.schedule('owlzz-opening-push','30 12 * * *', $$
 select net.http_post(url:= (select decrypted_secret from vault.decrypted_secrets where name='owlzz_notification_url'),
   headers:=jsonb_build_object('Content-Type','application/json','x-owlzz-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='owlzz_notification_cron_secret')),
   body:='{"type":"opening"}'::jsonb);
$$);
select cron.schedule('owlzz-closing-push','25 21 * * *', $$
 select net.http_post(url:= (select decrypted_secret from vault.decrypted_secrets where name='owlzz_notification_url'),
   headers:=jsonb_build_object('Content-Type','application/json','x-owlzz-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='owlzz_notification_cron_secret')),
   body:='{"type":"closing"}'::jsonb);
$$);
