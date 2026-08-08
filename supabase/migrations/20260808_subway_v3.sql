-- Subwaytalk v3: isolated ads / ad events / music context tables.
-- This migration intentionally does not touch the unrelated Idol Camp / scoreboard tables
-- that currently share the same Supabase project.

create table if not exists public.subway_ads (
  id text primary key,
  station_key text not null,
  line_key text,
  brand text not null,
  offer text not null,
  cta text not null default '매장 보기',
  target_url text not null,
  image_url text,
  radius_m integer not null default 220 check (radius_m between 80 and 800),
  priority integer not null default 100,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subway_ads_target_idx on public.subway_ads (station_key, line_key, active, priority);
alter table public.subway_ads enable row level security;
drop policy if exists subway_ads_public_read_active on public.subway_ads;
create policy subway_ads_public_read_active on public.subway_ads for select to anon, authenticated
using (active = true and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));

create table if not exists public.subway_ad_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('impression','click')),
  ad_id text not null references public.subway_ads(id) on delete cascade,
  station_key text not null,
  line_key text,
  session_hash text not null,
  accuracy_m integer,
  distance_m integer,
  created_at timestamptz not null default now()
);
create index if not exists subway_ad_events_ad_time_idx on public.subway_ad_events (ad_id, created_at desc);
create index if not exists subway_ad_events_station_time_idx on public.subway_ad_events (station_key, created_at desc);
alter table public.subway_ad_events enable row level security;
drop policy if exists subway_ad_events_public_insert on public.subway_ad_events;
create policy subway_ad_events_public_insert on public.subway_ad_events for insert to anon, authenticated
with check (
  char_length(session_hash) between 16 and 128
  and (accuracy_m is null or accuracy_m between 0 and 5000)
  and (distance_m is null or distance_m between 0 and 5000)
);

create table if not exists public.subway_music_rules (
  id bigint generated always as identity primary key,
  title text not null,
  playlist_url text not null,
  line_key text,
  station_key text,
  weather_tag text,
  daypart text check (daypart is null or daypart in ('dawn','morning','day','evening','night')),
  hashtags text[] not null default '{}',
  priority integer not null default 100,
  enabled boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subway_music_rules_context_idx on public.subway_music_rules (enabled, station_key, line_key, weather_tag, daypart, priority);
alter table public.subway_music_rules enable row level security;
drop policy if exists subway_music_rules_public_read_enabled on public.subway_music_rules;
create policy subway_music_rules_public_read_enabled on public.subway_music_rules for select to anon, authenticated
using (enabled = true and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));

-- Explicit least privilege. Newer Supabase Data API behavior should not be assumed to grant table access.
revoke all privileges on table public.subway_ads from anon, authenticated;
revoke all privileges on table public.subway_ad_events from anon, authenticated;
revoke all privileges on table public.subway_music_rules from anon, authenticated;
grant select on table public.subway_ads to anon, authenticated;
grant insert on table public.subway_ad_events to anon, authenticated;
grant select on table public.subway_music_rules to anon, authenticated;
grant usage on sequence public.subway_ad_events_id_seq to anon, authenticated;

insert into public.subway_ads
  (id, station_key, line_key, brand, offer, cta, target_url, radius_m, priority, active)
values
  ('ad_twosome', '강변', '2호선', '투썸플레이스', '오전 10시까지 아메리카노 1+1', '매장 보기', 'https://www.twosome.co.kr', 220, 100, true),
  ('ad_oy', '건대입구', null, '올리브영', '오늘만 단독 헬스앤뷰티 쿠폰', '혜택 받기', 'https://www.oliveyoung.co.kr', 220, 100, true)
on conflict (id) do update set
  station_key=excluded.station_key, line_key=excluded.line_key, brand=excluded.brand,
  offer=excluded.offer, cta=excluded.cta, target_url=excluded.target_url,
  radius_m=excluded.radius_m, priority=excluded.priority, active=excluded.active, updated_at=now();

insert into public.subway_music_rules (title, playlist_url, daypart, hashtags, priority, enabled)
select '출근길을 여는 30분',
       'https://music.youtube.com/playlist?list=PLFgquLnL59alW3xmYiWRaoz0oh3Ffb6tZ',
       'morning', array['출근','아침','이동중'], 100, true
where not exists (
  select 1 from public.subway_music_rules where title='출근길을 여는 30분' and daypart='morning'
);
