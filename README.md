# 칙칙톡톡 · 같은 방향

위치 기반 익명 지하철 라운지. 사용자가 이동 중인 노선·방향·역을 추론해 같은 이동 맥락의 라운지, 위치 광고, 상황별 음악 편성을 제공합니다.

## 현재 구조

운영 배포는 GitHub Pages 정적 배포를 유지하되, 세 화면이 **하나의 canonical bundle**을 사용합니다.

```text
/
├─ index.html                  사용자 라운지
├─ app.js                      canonical production bundle
├─ config.js                   공개 Supabase 설정(anon key only)
├─ stations.js                 수도권 역 좌표
├─ src/
│  └─ App.jsx                  canonical React source
├─ runtime/
│  ├─ storage-adapter.js       Subwaytalk 전용 상태 저장소
│  ├─ location-engine.js       선로 구간 기반 위치·방향 판정
│  ├─ location-ui.js           실제 위치 상태 UI
│  ├─ ad-runtime.js            역/노선/반경 기반 광고
│  ├─ music-runtime.js         위치·시간대·날씨 기반 음악 편성
│  └─ route-bootstrap.js       /admin, /advertiser 화면 라우팅
├─ admin/index.html            canonical app.js 재사용
├─ advertiser/index.html       canonical app.js 재사용
├─ supabase/migrations/        재현 가능한 DB 마이그레이션
└─ scripts/validate-structure.mjs
```

`admin/app.js`, `advertiser/app.js`, 오래된 `lounge.html`, 루트 `lounge.jsx`, 과거 `supabase_schema.sql`은 더 이상 사용하지 않습니다.

## 위치 판정

단순 최근접 역 판정이 아니라 사용자의 연속 위치를 **노선의 역-역 segment에 투영**합니다.

- 이전 매칭 노선 연속성 가중
- 환승역에서 순간적인 호선 점프 억제
- 연속 segment 진행도 + 기기 heading으로 진행 방향 추론
- 철도 물리 노선명을 승객용 호선명으로 정규화
- 괄호형 부역명 제거 후 역 키 정규화
- 신뢰도가 낮으면 광고/음악 위치 타기팅을 보류

정확한 위도·경도는 Supabase에 저장하지 않습니다.

## 광고

광고는 `subway_ads`에서 가져옵니다. 노출 조건은 다음을 모두 통과해야 합니다.

- station key 일치
- line key가 지정된 캠페인은 line까지 일치
- 위치 판정 confidence가 low가 아님
- 캠페인 반경 안에 있음(기본 220m)
- 동일 세션/역 중복 impression 방지

광고 이벤트는 `subway_ad_events`에 coarse station/line, 익명 세션 해시, GPS 정확도와 역까지 거리만 기록합니다.

## 음악 자동 편성

`subway_music_rules`에서 현재 맥락과 가장 잘 맞는 YouTube/YouTube Music playlist를 고릅니다.

우선순위 점수는 대략 `역 > 노선 > 날씨 > 시간대 > 편집 우선순위`입니다. 날씨는 사용자의 정확한 위치가 아니라 **판정된 역 좌표**로 Open-Meteo 현재 날씨를 조회합니다. 룰이 없으면 기본 편성으로 폴백합니다.

관리자가 이후 `subway_music_rules`에 playlist와 다음 조건을 추가하면 앱 코드 수정 없이 편성을 확장할 수 있습니다.

- `station_key`
- `line_key`
- `weather_tag`: clear / cloudy / rain / snow / storm / fog
- `daypart`: dawn / morning / day / evening / night
- `hashtags`
- `priority`

## 상태 저장소

기존 프로젝트의 범용 `public.kv`는 더 이상 Subwaytalk 런타임 저장소로 사용하지 않습니다.

Subwaytalk 상태는 `public.subway_runtime_state`로 이관되었습니다. 기존 `lounge:*`, `admin:*` 데이터는 마이그레이션 시 복사되며, 프론트에서는 `runtime/storage-adapter.js`가 기존 `window.storage` 인터페이스를 유지해 UI 회귀 없이 새 테이블을 사용합니다.

네트워크 장애 시에는 브라우저 로컬 캐시로 폴백합니다.

## Supabase 테이블

Subwaytalk가 사용하는 전용 테이블은 다음과 같습니다.

- `subway_runtime_state`
- `subway_ads`
- `subway_ad_events`
- `subway_music_rules`

모두 RLS를 사용합니다. 이 저장소의 Subwaytalk 마이그레이션은 같은 Supabase 프로젝트의 Idol Camp / scoreboard / meme 관련 테이블을 수정하지 않습니다.

## 화면 경로

- `/` 사용자 라운지
- `/admin/` 운영 화면
- `/advertiser/` 광고주 화면

세 경로는 같은 `app.js`를 사용하고 `runtime/route-bootstrap.js`가 경로에 맞는 화면만 활성화합니다. 사용자 루트에서는 운영/광고주 모드 버튼을 숨깁니다.

## 검증

```bash
npm run check
```

검사는 다음을 확인합니다.

1. 모든 runtime JavaScript 문법
2. 중복 admin/advertiser 번들이 존재하지 않는지
3. 세 HTML 진입점이 canonical bundle/adapter를 참조하는지
4. 운영에 필요한 runtime 파일 존재 여부
5. `config.js`에 service-role secret이 들어가지 않았는지

GitHub Actions에서도 동일 검사를 실행합니다.

## 보안 주의

`config.js`에는 **Supabase publishable/anon key만** 둘 수 있습니다. `service_role`은 절대 브라우저에 넣지 않습니다.

현재 관리자/광고주 접근 코드는 기존 정적 UI 호환을 위해 남아 있습니다. 이것은 인증이 아니라 UI 게이트이므로, 실제 상용 광고주 계정·결제·관리자 권한을 붙일 때는 Supabase Auth + 역할 기반 RLS로 교체해야 합니다.
