-- AI 동행(companion) 지원.
--
-- 초기에는 같은 노선·방향에 사람이 거의 없어 라운지가 빈 화면으로 보인다.
-- subway-message 함수가 참여자가 적을 때만 AI 발화를 채우고, 사람이 늘면 스스로 줄인다.
--
-- is_ai 는 UI 표시용이자 밀도 계산용이다. 사람인 척하지 않는 것이 전제이므로
-- 이 값은 응답에 그대로 실려 나가고 클라이언트가 배지로 표시한다.

alter table public.subway_ephemeral_messages
  add column if not exists is_ai boolean not null default false;

-- 밀도 판정은 "최근 N분간 이 방의 사람/AI 발화"를 매번 센다.
create index if not exists subway_ephemeral_messages_room_ai_time_idx
  on public.subway_ephemeral_messages(room_key, is_ai, created_at desc);

-- 익명 클라이언트는 이 테이블에 직접 접근할 수 없다(20260809090000 에서 회수).
-- AI 메시지도 service_role 을 쓰는 edge function 만 기록한다.
