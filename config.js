// ============================================================
// 같은 방향 · 환경설정
// 아래 두 값을 본인 Supabase 프로젝트 값으로 채우면, 테스터 데이터가
// 모두 공유 DB로 연동됩니다. (비워두면 기존처럼 브라우저별 localStorage로 동작)
//
// Supabase 대시보드 → Project Settings → API 에서 확인:
//   - Project URL        → SUPABASE_URL
//   - Project API keys → anon public → SUPABASE_ANON_KEY
//
// anon 키는 공개돼도 되는 키입니다(RLS로 보호). 비밀키(service_role)는 절대 넣지 마세요.
// ============================================================
window.SAMEWAY_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  // 관리자/광고주 페이지 접근 코드 (임시 보호). 바꿔서 쓰세요.
  ADMIN_CODE: "ops2026",
  ADV_CODE: "ads2026"
};
