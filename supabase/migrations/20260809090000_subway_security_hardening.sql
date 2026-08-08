-- Subwaytalk 보안 강화.
--
-- 이 마이그레이션 이전 상태에서는 익명 클라이언트가 다음을 할 수 있었다.
--   · subway_ad_events 에 직접 INSERT → 노출/클릭 무제한 위조(광고 과금 사고)
--   · subway_runtime_state 의 admin:% 키를 덮어쓰기/삭제 → 운영 데이터 조작
--   · subway_ephemeral_messages 를 PostgREST 로 직접 SELECT → 전 노선 대화 덤프
--   · subway_sticker_board 에 무제한 INSERT → "1회 탑승 3개" 제한이 클라이언트에만 존재
-- 쓰기 경로는 전부 edge function(service_role)으로 옮기고, 여기서는 anon 권한을 회수한다.

------------------------------------------------------------------
-- 1. 광고 이벤트: 익명 직접 INSERT 차단 (subway-ad-event 함수만 기록)
------------------------------------------------------------------
drop policy if exists subway_ad_events_public_insert on public.subway_ad_events;
revoke all privileges on table public.subway_ad_events from anon, authenticated;

------------------------------------------------------------------
-- 2. 임시 대화: 익명 직접 SELECT 차단 (subway-message 함수만 접근)
------------------------------------------------------------------
drop policy if exists subway_ephemeral_messages_read on public.subway_ephemeral_messages;
revoke all privileges on public.subway_ephemeral_messages from anon, authenticated;
create index if not exists subway_ephemeral_messages_expiry_idx
  on public.subway_ephemeral_messages(expires_at);

------------------------------------------------------------------
-- 3. 런타임 상태: lounge:% 만 익명 쓰기, admin:% 는 읽기 전용
------------------------------------------------------------------
drop policy if exists subway_runtime_state_insert on public.subway_runtime_state;
drop policy if exists subway_runtime_state_update on public.subway_runtime_state;
drop policy if exists subway_runtime_state_delete on public.subway_runtime_state;

create policy subway_runtime_state_insert on public.subway_runtime_state
  for insert to anon, authenticated with check (key like 'lounge:%');
create policy subway_runtime_state_update on public.subway_runtime_state
  for update to anon, authenticated using (key like 'lounge:%') with check (key like 'lounge:%');

revoke delete on table public.subway_runtime_state from anon, authenticated;

------------------------------------------------------------------
-- 4. 스티커 보드: 1회 탑승 3개 제한을 DB 에서 강제
------------------------------------------------------------------
create or replace function public.subway_sticker_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.subway_sticker_board
      where board_date = new.board_date
        and room_key = new.room_key
        and session_hash = new.session_hash) >= 3 then
    raise exception 'sticker limit reached for this ride';
  end if;
  return new;
end $$;

drop trigger if exists subway_sticker_cap_trg on public.subway_sticker_board;
create trigger subway_sticker_cap_trg
  before insert on public.subway_sticker_board
  for each row execute function public.subway_sticker_cap();

------------------------------------------------------------------
-- 5. 게임 참여: 세션·게임당 상한을 DB 에서 강제
------------------------------------------------------------------
create or replace function public.subway_game_entry_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.subway_game_entries
      where game_id = new.game_id
        and room_key = new.room_key
        and session_hash = new.session_hash) >= 10 then
    raise exception 'entry limit reached for this game';
  end if;
  return new;
end $$;

drop trigger if exists subway_game_entry_cap_trg on public.subway_game_entries;
create trigger subway_game_entry_cap_trg
  before insert on public.subway_game_entries
  for each row execute function public.subway_game_entry_cap();

------------------------------------------------------------------
-- 6. 만료 대화 정리
--    pg_cron 이 있으면 주기 삭제를 걸고, 없으면 edge function 의
--    기회적 정리(leave 시 만료분 삭제)에 의존한다.
------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'subway-ephemeral-cleanup', '*/15 * * * *',
      $cron$delete from public.subway_ephemeral_messages where expires_at < now()$cron$
    );
  end if;
end $$;
