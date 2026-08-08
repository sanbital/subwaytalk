create extension if not exists pgcrypto;

create table if not exists public.subway_ephemeral_messages (
  id uuid primary key default gen_random_uuid(), room_key text not null, session_id text not null,
  nick text not null, body text not null check (char_length(body) between 1 and 300), language text,
  created_at timestamptz not null default now(), expires_at timestamptz not null default (now()+interval '90 minutes')
);
create index if not exists subway_ephemeral_messages_room_time_idx on public.subway_ephemeral_messages(room_key,created_at desc);
create index if not exists subway_ephemeral_messages_session_idx on public.subway_ephemeral_messages(session_id);
alter table public.subway_ephemeral_messages enable row level security;
revoke all on public.subway_ephemeral_messages from anon, authenticated;
grant select on public.subway_ephemeral_messages to anon, authenticated;
drop policy if exists subway_ephemeral_messages_read on public.subway_ephemeral_messages;
create policy subway_ephemeral_messages_read on public.subway_ephemeral_messages for select to anon,authenticated using (expires_at>now());

create table if not exists public.subway_context_questions (
 id bigint generated always as identity primary key, prompt text not null, options jsonb not null,
 tags text[] not null default '{}', line_key text, weather_tag text, daypart text,
 priority integer not null default 100, enabled boolean not null default true, created_at timestamptz not null default now()
);
alter table public.subway_context_questions enable row level security;
revoke all on public.subway_context_questions from anon,authenticated; grant select on public.subway_context_questions to anon,authenticated;
drop policy if exists subway_context_questions_read on public.subway_context_questions;
create policy subway_context_questions_read on public.subway_context_questions for select to anon,authenticated using(enabled=true);

create table if not exists public.subway_question_votes (
 id bigint generated always as identity primary key, question_id bigint not null references public.subway_context_questions(id) on delete cascade,
 room_key text not null, session_hash text not null, choice integer not null check(choice between 0 and 7), created_at timestamptz not null default now(),
 unique(question_id,room_key,session_hash)
);
alter table public.subway_question_votes enable row level security;
revoke all on public.subway_question_votes from anon,authenticated; grant select,insert on public.subway_question_votes to anon,authenticated;
drop policy if exists subway_question_votes_read on public.subway_question_votes; drop policy if exists subway_question_votes_insert on public.subway_question_votes;
create policy subway_question_votes_read on public.subway_question_votes for select to anon,authenticated using(true);
create policy subway_question_votes_insert on public.subway_question_votes for insert to anon,authenticated with check(char_length(session_hash) between 16 and 128);

create table if not exists public.subway_daily_games (
 id bigint generated always as identity primary key, game_date date not null default current_date, room_key text not null default '*',
 game_type text not null check(game_type in('majority','relay','sticker')), title text not null, payload jsonb not null default '{}'::jsonb,
 enabled boolean not null default true, created_at timestamptz not null default now(), unique(game_date,room_key,game_type,title)
);
alter table public.subway_daily_games enable row level security;
revoke all on public.subway_daily_games from anon,authenticated; grant select on public.subway_daily_games to anon,authenticated;
drop policy if exists subway_daily_games_read on public.subway_daily_games;
create policy subway_daily_games_read on public.subway_daily_games for select to anon,authenticated using(enabled=true);

create table if not exists public.subway_game_entries (
 id bigint generated always as identity primary key, game_id bigint not null references public.subway_daily_games(id) on delete cascade,
 room_key text not null, session_hash text not null, entry jsonb not null, created_at timestamptz not null default now()
);
create index if not exists subway_game_entries_game_room_idx on public.subway_game_entries(game_id,room_key,created_at);
alter table public.subway_game_entries enable row level security;
revoke all on public.subway_game_entries from anon,authenticated; grant select,insert on public.subway_game_entries to anon,authenticated;
drop policy if exists subway_game_entries_read on public.subway_game_entries; drop policy if exists subway_game_entries_insert on public.subway_game_entries;
create policy subway_game_entries_read on public.subway_game_entries for select to anon,authenticated using(true);
create policy subway_game_entries_insert on public.subway_game_entries for insert to anon,authenticated with check(char_length(session_hash) between 16 and 128 and jsonb_typeof(entry)='object');

create table if not exists public.subway_sticker_board (
 id bigint generated always as identity primary key, board_date date not null default current_date, room_key text not null,
 session_hash text not null, cell smallint not null check(cell between 0 and 63),
 sticker text not null check(sticker in('⭐','☕','🚇','☁️','💚','🐱','🌙','🍀')), created_at timestamptz not null default now(),
 unique(board_date,room_key,cell)
);
alter table public.subway_sticker_board enable row level security;
revoke all on public.subway_sticker_board from anon,authenticated; grant select,insert on public.subway_sticker_board to anon,authenticated;
drop policy if exists subway_sticker_board_read on public.subway_sticker_board; drop policy if exists subway_sticker_board_insert on public.subway_sticker_board;
create policy subway_sticker_board_read on public.subway_sticker_board for select to anon,authenticated using(true);
create policy subway_sticker_board_insert on public.subway_sticker_board for insert to anon,authenticated with check(char_length(session_hash) between 16 and 128);
