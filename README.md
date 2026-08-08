# 칙칙톡톡 · 같은 방향

위치 기반 익명 지하철 라운지. 사용자가 이동 중인 노선·방향·역을 추론해 같은 이동 맥락의 라운지, 위치 광고, 상황별 음악 편성을 제공합니다.

## 빌드

`app.js` 는 **빌드 산출물**입니다. 직접 편집하지 마세요.

```bash
npm install
npm run build    # src/main.jsx → app.js
npm run check    # 문법 + 구조 + 번들 재현성 검사
```

`npm run check:build` 가 `src/` 를 다시 빌드해 커밋된 `app.js` 와 바이트 단위로 비교합니다.
과거에 `app.js` 와 `src/App.jsx` 가 서로 다른 세대로 갈라져 **배포본에서 관리자/광고주 화면이 통째로 사라진 적**이 있어, CI 가 그 재발을 막습니다.

## 구조

```text
/
├─ index.html                  사용자 라운지
├─ app.js                      빌드 산출물 (커밋됨, 직접 수정 금지)
├─ config.js                   공개 설정(anon key only, 접근 코드 없음)
├─ stations.js                 수도권 역 좌표
├─ src/
│  ├─ main.jsx                 엔트리
│  └─ App.jsx                  라운지 · 관리자 · 광고주 화면
├─ runtime/
│  ├─ storage-adapter.js       Subwaytalk 상태 저장소 + 운영 콘솔 인증 클라이언트
│  ├─ location-engine.js       선로 구간 기반 위치·방향 판정 (앱 전체의 유일한 위치 공급원)
│  ├─ location-ui.js           위치 상태 UI
│  ├─ commute-access.js        탑승 판정 게이트
│  ├─ ad-runtime.js            역/노선/반경 기반 광고
│  ├─ music-runtime.js         상황별 플레이리스트 선택기(재생은 앱 플레이어가 담당)
│  ├─ social-play.js           질문·게임·스티커 보드
│  ├─ instant-chat.js          탑승 중 임시 대화
│  ├─ chat-safety.js           클라이언트 1차 차단
│  └─ route-bootstrap.js       /admin, /advertiser 화면 라우팅
├─ supabase/functions/         subway-message · subway-admin · subway-ad-event
├─ supabase/migrations/        재현 가능한 DB 마이그레이션
└─ scripts/                    빌드 · 구조 검사
```

## 서버 시크릿

접근 코드와 서명 키는 저장소에 두지 않습니다. Supabase 프로젝트 시크릿으로 설정하세요.

| 시크릿 | 쓰이는 곳 |
| --- | --- |
| `SUBWAY_ADMIN_CODE` | 운영 콘솔 접근 코드 |
| `SUBWAY_ADV_CODE` | 광고주 콘솔 접근 코드 |
| `SUBWAY_ADMIN_SECRET` | 콘솔 세션 토큰 서명 |
| `SUBWAY_CHAT_SECRET` | 채팅 세션 토큰·익명 author 해시 서명 |

```bash
supabase secrets set SUBWAY_ADMIN_CODE=... SUBWAY_ADV_CODE=... \
  SUBWAY_ADMIN_SECRET="$(openssl rand -hex 32)" SUBWAY_CHAT_SECRET="$(openssl rand -hex 32)"
supabase functions deploy subway-message subway-admin subway-ad-event
supabase db push
```

## 위치 판정

단순 최근접 역 판정이 아니라 사용자의 연속 위치를 **노선의 역-역 segment 에 투영**합니다.

- 이전 매칭 노선 연속성 가중
- 환승역에서 순간적인 호선 점프 억제
- 연속 segment 진행도 + 기기 heading 으로 진행 방향 추론
- 철도 물리 노선명을 승객용 호선명으로 정규화
- 괄호형 부역명을 제거한 키로 매칭 (원본 역명 데이터는 변형하지 않음)
- 순환선 구간은 좌표에서 자동 감지 (인덱스 하드코딩 없음)
- 신뢰도가 낮으면 광고/음악 위치 타기팅을 보류

지하 구간에서는 위성 fix 가 잡히지 않으므로 **저정밀(와이파이/기지국) 측위와 고정밀 GPS 를 함께** 열어 두고 먼저 도착하는 값을 씁니다. 고정밀 단일 호출만 쓰던 예전 방식은 터널에서 항상 timeout 됐습니다.

### 실제 GPS 전용 (모의 주행 없음)

베타는 실제 이동 위치로만 동작합니다. 위치를 못 잡으면 가짜 주행을 보여주지 않습니다.

| 상황 | 동작 |
| --- | --- |
| 측위 성공 | 라운지 진입 |
| 6초 경과 | "지하에서는 조금 더 걸릴 수 있어요" 안내 |
| 권한 거부 | 즉시 위치 필요 화면 (타임아웃까지 기다리지 않음) |
| 15초 내 실패 | 위치 대기 화면 + 다시 시도 |
| 대기 중 신호 회복 | 자동으로 라운지 진입 |

같은 방향 매칭은 실제 이동 맥락 없이는 성립하지 않으므로, 모의 구간 주행·데모 라운지는 제거했습니다. `npm run check` 가 재도입을 막습니다.

정확한 위도·경도는 Supabase 에 저장하지 않습니다.

## 광고

노출 조건은 다음을 모두 통과해야 합니다.

- station key 일치, line key 가 지정된 캠페인은 line 까지 일치
- 위치 판정 confidence 가 low 가 아님
- 캠페인 반경 안에 있음(기본 220m)
- 동일 세션/역 중복 impression 방지

노출·클릭은 `subway-ad-event` 함수를 통해서만 기록됩니다. 함수가 캠페인 실재 여부·타겟 일치·반경·세션당 빈도를 서버에서 다시 검증하며, 익명 클라이언트의 `subway_ad_events` 직접 INSERT 는 차단돼 있습니다.

## 대화

- 방 키는 `노선|방향` 으로 안정적으로 유지됩니다(역마다 갈라지지 않음).
- 세션 토큰이 있어야 전송·퇴장이 가능하며, 자기 세션만 삭제할 수 있습니다.
- 응답에는 `session_id` 대신 방 안에서만 유효한 익명 author 해시가 나갑니다.
- 폴링은 2초에서 시작해 조용하면 최대 15초까지 늘어나고, 탭이 숨으면 멈춥니다.

## 알려진 한계

- 투표·게임·스티커는 세션 해시 단위로만 제한됩니다. 세션을 새로 만드는 방식의 어뷰징은 기기 attestation 없이는 완전히 막을 수 없습니다.
- 탑승 판정(`ENFORCE_SUBWAY_ACCESS`)은 클라이언트 신호 기반이라 우회 가능합니다. 과금·보상과 연결하려면 서버 검증이 필요합니다.
- 위치기반 서비스이므로 **위치기반서비스사업 신고**(방송통신위원회) 대상 여부를 확인해야 합니다.
