// ============================================================
// 같은 방향 · 환경설정 (공개 파일)
//
// 이 파일은 브라우저로 그대로 내려가므로 공개돼도 되는 값만 둔다.
// anon(publishable) 키는 공개용이며 RLS 로 보호된다. service_role 키는 절대 넣지 않는다.
//
// 운영/광고주 접근 코드는 여기 있으면 안 된다. 예전에는 이 파일에 코드가 들어 있어
// 저장소와 번들에 그대로 노출됐고, 사실상 보호 효과가 없었다.
// 지금은 Supabase 시크릿(SUBWAY_ADMIN_CODE / SUBWAY_ADV_CODE)에 두고
// subway-admin edge function 이 서버에서 검증한다.
// ============================================================
window.SAMEWAY_CONFIG = {
  SUPABASE_URL: "https://kkaoerbblpuszptiibvo.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_tPjuKan5uDF2LwGVV8DFJQ_vdiBaFAG",

  // 테스트 기간에는 false. 탑승 판정은 계속 수집·표시하되 접근은 막지 않는다.
  // 정식 운영 전 true 로 바꾸면 실제 지하철 탑승이 확인된 경우에만 라운지를 연다.
  ENFORCE_SUBWAY_ACCESS: false
};
