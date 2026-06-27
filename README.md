# 같은 방향 · 베타 배포 (1단계: 테스터 데이터 연동)

테스터들이 같은 라운지에서 주고받은 메시지·투표·광고 노출/클릭이 **공유 DB(Supabase)** 로 모이고,
관리자·광고주 화면에서 실시간으로 집계가 보이도록 연결합니다.

> 핵심: `config.js` 의 키를 채우면 **공유 모드**, 비우면 기존처럼 **브라우저별 로컬 모드**로 동작합니다.

---

## 폴더 구성

| 파일 | 설명 |
|---|---|
| `index.html` | 진입점 (config.js → app.js 순서로 로드) |
| `app.js` | React + Supabase 포함 단일 번들 |
| `config.js` | **여기에 Supabase 키를 입력** (공개 anon 키만) |
| `supabase_schema.sql` | Supabase에 실행할 테이블/권한 SQL |
| `_redirects` | Netlify용 (GitHub Pages에선 무시돼도 무방) |

---

## 1. Supabase 프로젝트 만들기 (무료, 약 5분)

1. https://supabase.com 가입 → **New project** 생성 (Region은 `Northeast Asia (Seoul)` 권장).
2. 좌측 **SQL Editor** → `supabase_schema.sql` 내용을 붙여넣고 **Run**.
3. 좌측 **Project Settings → API** 에서 두 값을 복사:
   - **Project URL** → `SUPABASE_URL`
   - **Project API keys → anon public** → `SUPABASE_ANON_KEY`

> `service_role` 키는 절대 넣지 마세요. 프론트에는 공개해도 되는 `anon` 키만 사용합니다.

## 2. 키 입력

`config.js` 를 열어 두 값을 채웁니다.

```js
window.SAMEWAY_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi..."
};
```

## 3. 배포 (GitHub Pages)

폴더 안 파일 전체(`index.html`, `app.js`, `config.js`, `supabase_schema.sql`, `_redirects`)를 저장소에 올립니다.

```bash
git add .
git commit -m "beta: connect shared backend"
git push
```

저장소 **Settings → Pages → Branch: main / (root)** 저장. 1~2분 뒤 `https://<아이디>.github.io/<repo>/` 로 접속됩니다.
HTTPS라 위치 동의 팝업도 정상 동작합니다.

## 4. 동작 확인

1. 폰과 PC에서 각각 라운지에 입장 → 한쪽에서 보낸 채팅이 다른 쪽에 뜨면 연동 성공.
2. 광고 역(강변·건대입구)에 도착해 배너가 뜨면 → **관리자 → 역 도착 광고** 또는 **광고주 센터** 에서 노출 수가 올라갑니다.
3. 배너의 매장 보기 클릭 → 클릭 수가 올라갑니다.

---

## 지금 연동되는 것 (1단계)

- 테스터 간 **채팅 · 투표 · 좋아요 · 신고** 공유
- **광고 노출/클릭 집계**가 관리자·광고주 화면에 실시간 반영
- 위치 동의 → 가까운 역 기준 광고 노출 (앞서 구현)

`ad_events` 테이블(노출/클릭 원장)도 함께 생성됩니다. 정확 집계·부정클릭 검증 등 다음 단계에서 사용합니다.

---

## 아직 아닌 것 (v0.4 지시서 로드맵)

아래는 별도 서버·인프라가 필요한 큰 작업입니다. 단계적으로 진행 권장:

1. **서비스 분리 배포** — lounge / ads / ops 도메인·앱·인증 분리 (모노레포)
2. **DB 분리** — Lounge / Advertising / Operations / Analytics 4개 + 이벤트 연동
3. **광고주 청약·결제** — 캠페인 상태머신(DRAFT→…→RUNNING), PG 연동, KST 집행 예약, `집행하기` 게이트
4. **지역 유동 단가 + 배분** — 페이싱 점수, 가중 랜덤, 유효 노출/클릭 검증
5. **권한 기반 관리자** — 슈퍼/일반 어드민, 서버 권한 검증, 감사 로그
6. **YouTube 임베드 음악** — 라운지 내 재생, 관리자 편성, 자동재생 폴백

> 이 단계부터는 터미널/개발 환경에서 이어가는 것이 효율적입니다.
