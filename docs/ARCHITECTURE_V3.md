# Subwaytalk architecture

> 이 문서의 v3 계획 중 "Next structural step" 항목은 대부분 완료되었습니다.
> 현재 상태는 README 를 먼저 보세요. 아래는 배경과 남은 항목입니다.

## Why this transition existed

프로덕션 페이지가 손으로 올린 대형 `app.js` 번들이었고, 소스(`src/App.jsx`)와 세대가 갈라져 있었습니다.
그 결과 배포본에는 관리자/광고주 화면이 아예 포함되지 않았고, 데이터도 격리 대상인
`subway_runtime_state` 가 아니라 공유 `kv` 테이블로 흘렀습니다.
지금은 esbuild 빌드가 복원되어 `app.js` 가 `src/` 에서 재현되며, CI 가 둘의 일치를 강제합니다.

## Active runtime modules

### `runtime/location-engine.js`

- Starts only after the user presses the existing location-consent CTA.
- Reads the device geolocation stream without overriding the browser geolocation API.
- Matches a moving user to **rail segments**, not only the single nearest station.
- Scores continuity with the previously matched line so transfer stations do not jump to whichever line happens to be listed first.
- Uses successive progress along the matched segment, plus device heading when available, to infer travel direction.
- Normalizes physical railway section names to passenger-facing line names (for example `경부선` -> `1호선`).
- Normalizes station display names by removing parenthetical facility aliases so targeting keys such as `강변` match `강변(동서울터미널)`.
- Does not persist raw latitude/longitude.

### `runtime/location-ui.js`

- Replaces the unreliable legacy mini-track once v3 has a real location match.
- Shows matched line, next-station direction, nearby/current station, GPS accuracy and low-confidence state.
- Uses the v3 station for the get-off and arrival copy.

### `runtime/ad-runtime.js`

- Hides the legacy location ad surface and renders only v3-qualified campaigns.
- An ad must match station, optional line, campaign radius and a non-low location confidence.
- Default campaign radius is 220 m and is configurable per campaign.
- Impression/click events store only station/line, anonymous session hash, GPS accuracy and distance-to-station. Raw coordinates are not sent to Supabase.
- A campaign impression is deduplicated per session/station.

## Supabase isolation

Subwaytalk currently shares a Supabase project with unrelated services. v3 therefore uses only tables prefixed with `subway_`:

- `subway_ads`
- `subway_ad_events`
- `subway_music_rules`

RLS is enabled on all three. Anonymous clients can only:

- `SELECT` currently active `subway_ads`
- `INSERT` `subway_ad_events`
- `SELECT` currently enabled `subway_music_rules`

No Subwaytalk migration in this change modifies Idol Camp, scoreboard or meme-event tables.

## Music automation design

The reliable model is **contextual playlist selection**, not creating a brand-new YouTube playlist for every rider.

1. Maintain a curated pool of YouTube/YouTube Music playlist URLs in `subway_music_rules`.
2. Tag rules with combinations of:
   - time of day (`morning`, `evening`, etc.)
   - line
   - station/area
   - weather tag
   - editorial hashtags/moods
3. The client sends only context keys to the selector; the rule with the highest specificity/priority wins.
4. A scheduled server function can refresh candidate playlists from the YouTube Data API. Keep API keys/server credentials off the client.
5. If Subwaytalk must create or modify playlists on a YouTube channel, that write path uses OAuth and should run server-side under a controlled channel account.
6. Weather should be resolved server-side or through a weather provider using coarse station/area context; do not upload a rider's exact coordinates for playlist selection.

완료: 규칙 선택은 `runtime/music-runtime.js` 가 순수 선택기로 수행하고, 재생은 앱 안의
YouTube IFrame 플레이어가 담당합니다. 숨긴 1px autoplay iframe 을 DOM 에 심던 방식은
iOS 에서 재생되지 않았고 MutationObserver 되먹임으로 iframe 을 무한 재생성했기 때문에 제거했습니다.

## Status

1. ~~Move lounge/admin/advertiser source into `src/` entrypoints.~~ 완료 (`src/main.jsx`, `src/App.jsx`).
2. ~~Add a build output and stop committing hand-built bundles as source of truth.~~ 완료 (esbuild + `npm run check:build`).
3. Move shared station normalization and domain types into common modules. — 부분 완료. 정규화 규칙이 아직 엔진과 앱 양쪽에 있습니다.
4. ~~Replace the legacy `kv` JSON store.~~ 완료. 앱은 `window.storage` → `subway_runtime_state` 만 사용합니다.
   남은 항목: 라운지 대화/투표가 아직 JSON blob 한 행을 read-modify-write 하므로 동시 갱신 시 유실 가능. 전용 테이블 + Realtime 으로 옮겨야 합니다.
5. ~~Replace static admin/advertiser access codes with server-enforced auth.~~ 완료.
   접근 코드는 Supabase 시크릿과만 비교되고, 통과 시 발급된 서명 토큰이 있어야 `admin:*` 을 쓸 수 있습니다.
   RLS 에서 anon 의 `admin:*` 쓰기는 차단됩니다. (정식 사용자 계정 기반 역할은 여전히 후속 과제)

## Validation

`npm run check` 는 (1) 각 런타임 모듈 문법, (2) 저장소 구조와 특권 경로 불변식,
(3) `app.js` 가 `src/` 에서 재현되는지를 검사합니다. GitHub Actions 가 같은 검사를 실행합니다.
