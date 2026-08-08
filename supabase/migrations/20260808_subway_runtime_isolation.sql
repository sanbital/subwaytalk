-- Subwaytalk v3.1 runtime isolation.
-- Move Subwaytalk state away from the shared public.kv table without modifying unrelated rows/services.

create table if not exists public.subway_runtime_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.subway_runtime_state enable row level security;

drop policy if exists subway_runtime_state_read on public.subway_runtime_state;
drop policy if exists subway_runtime_state_insert on public.subway_runtime_state;
drop policy if exists subway_runtime_state_update on public.subway_runtime_state;
drop policy if exists subway_runtime_state_delete on public.subway_runtime_state;

create policy subway_runtime_state_read on public.subway_runtime_state
  for select to anon, authenticated using (true);
create policy subway_runtime_state_insert on public.subway_runtime_state
  for insert to anon, authenticated with check (key like 'lounge:%' or key like 'admin:%');
create policy subway_runtime_state_update on public.subway_runtime_state
  for update to anon, authenticated using (key like 'lounge:%' or key like 'admin:%')
  with check (key like 'lounge:%' or key like 'admin:%');
create policy subway_runtime_state_delete on public.subway_runtime_state
  for delete to anon, authenticated using (key like 'lounge:%');

revoke all on table public.subway_runtime_state from anon, authenticated;
grant select, insert, update, delete on table public.subway_runtime_state to anon, authenticated;
create index if not exists subway_runtime_state_updated_idx on public.subway_runtime_state(updated_at desc);

insert into public.subway_runtime_state(key,value)
select key,value from public.kv
where key like 'lounge:%' or key like 'admin:%'
on conflict (key) do nothing;

insert into public.subway_music_rules (title, playlist_url, hashtags, priority, enabled)
select '같은 방향 기본 편성',
       'https://music.youtube.com/playlist?list=PLFgquLnL59alW3xmYiWRaoz0oh3Ffb6tZ',
       array['이동중','기본'], 10, true
where not exists (
  select 1 from public.subway_music_rules where title='같은 방향 기본 편성'
);
