-- ============================================================
-- 같은 방향 · Lounge 공유 백엔드 스키마 (1단계: 테스터 데이터 연동)
-- Supabase SQL Editor에 붙여넣고 실행하세요.
-- ============================================================

-- 공유 키-값 저장소: 메시지/투표/카드/광고설정/광고집계/신고/접속자 등
create table if not exists public.kv (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- 광고 노출/클릭 원장 (append-only, 정확 집계용)
create table if not exists public.ad_events (
  id           bigint generated always as identity primary key,
  type         text not null check (type in ('impression','click')),
  ad_id        text not null,
  station      text,
  session_hash text,           -- 익명 세션의 해시 (개인 식별 불가)
  created_at   timestamptz not null default now()
);
create index if not exists ad_events_ad_idx on public.ad_events (ad_id, type);
create index if not exists ad_events_time_idx on public.ad_events (created_at);

-- ------------------------------------------------------------
-- RLS (Row Level Security)
-- 베타 단계: anon 키로 읽기/쓰기 허용. 운영 전 반드시 강화하세요.
--  - kv: 익명 사용자가 읽고 씀 (라운지 공유)
--  - ad_events: 익명 insert 허용, select는 집계 화면(관리자/광고주)에서 사용
-- ------------------------------------------------------------
alter table public.kv enable row level security;
alter table public.ad_events enable row level security;

drop policy if exists kv_read on public.kv;
drop policy if exists kv_insert on public.kv;
drop policy if exists kv_update on public.kv;
create policy kv_read   on public.kv for select using (true);
create policy kv_insert on public.kv for insert with check (true);
create policy kv_update on public.kv for update using (true);

drop policy if exists ae_read on public.ad_events;
drop policy if exists ae_insert on public.ad_events;
create policy ae_read   on public.ad_events for select using (true);
create policy ae_insert on public.ad_events for insert with check (true);

-- ------------------------------------------------------------
-- (선택) 일반 채팅 휘발성: 오래된 메시지 정리용 함수 예시
--  실제 휘발은 앱이 하차 시 삭제. 아래는 안전망(24h 경과 kv 메시지 정리)
-- ------------------------------------------------------------
-- delete from public.kv where key like 'lounge:%:messages' and updated_at < now() - interval '24 hours';
