alter table public.banners
  add column if not exists theme text not null default 'gold',
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.banners'::regclass and conname='banners_theme_allowed') then
    alter table public.banners add constraint banners_theme_allowed check (theme in ('gold','blood','dark'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.banners'::regclass and conname='banners_schedule_valid') then
    alter table public.banners add constraint banners_schedule_valid check (starts_at is null or ends_at is null or ends_at > starts_at);
  end if;
end $$;

update public.banners
set visible=false, updated_at=now()
where lower(title) like '%diwali%' or lower(content) like '%diwali%';

insert into public.banners(title,content,image_url,theme,visible,display_order,starts_at,ends_at)
select 'GIVE BLOOD. GIVE LIFE.',
       E'Blood Donation Camp · 24 November 2026\nSindhi Dharamshala\nYour one donation can make a life-saving difference.',
       null,'blood',true,0,now(),'2026-11-25 00:00:00+05:30'::timestamptz
where not exists(select 1 from public.banners where title='GIVE BLOOD. GIVE LIFE.');

notify pgrst,'reload schema';