import fs from 'node:fs';

const fail = (message) => { console.error(`STRUCTURE ERROR: ${message}`); process.exitCode = 1; };
const read = (path) => fs.readFileSync(path, 'utf8');

const mustExist = [
  'app.js',
  'src/main.jsx',
  'src/App.jsx',
  'scripts/build.mjs',
  'runtime/storage-adapter.js',
  'runtime/location-engine.js',
  'runtime/commute-access.js',
  'runtime/ad-runtime.js',
  'runtime/music-runtime.js',
  'runtime/social-play.js',
  'runtime/instant-chat.js',
  'runtime/chat-safety.js',
  'runtime/route-bootstrap.js',
  'supabase/functions/subway-message/index.ts',
  'supabase/functions/subway-message/companions.ts',
  'supabase/functions/subway-admin/index.ts',
  'supabase/functions/subway-ad-event/index.ts',
  'supabase/migrations/20260808094949_subway_v3_location_ads_music.sql',
  'supabase/migrations/20260808102037_subway_runtime_isolation.sql',
  'supabase/migrations/20260808121319_subway_commute_play_v1.sql',
  'supabase/migrations/20260809090000_subway_security_hardening.sql',
  'supabase/migrations/20260809120000_subway_ai_companions.sql',
  'admin/index.html',
  'advertiser/index.html'
];
for (const path of mustExist) if (!fs.existsSync(path)) fail(`${path} is missing`);

const obsolete = [
  'admin/app.js', 'advertiser/app.js', 'lounge.html', 'lounge.jsx',
  'supabase_schema.sql', 'runtime/sticker-picker-fix.js', 'runtime/location-ui.js'
];
for (const path of obsolete) if (fs.existsSync(path)) fail(`${path} is obsolete and must not exist`);

// 마이그레이션 버전은 서로 달라야 하고 파일명 순서가 곧 적용 순서여야 한다.
const versions = new Map();
for (const file of fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'))) {
  const version = file.split('_')[0];
  if (!/^\d{14}$/.test(version)) fail(`${file} must start with a 14-digit timestamp version`);
  if (versions.has(version)) fail(`duplicate migration version ${version}: ${versions.get(version)} and ${file}`);
  versions.set(version, file);
}

for (const path of ['admin/index.html', 'advertiser/index.html']) {
  const html = read(path);
  if (!html.includes('../app.js')) fail(`${path} must load ../app.js`);
  if (!html.includes('../runtime/storage-adapter.js')) fail(`${path} must load isolated storage adapter`);
  if (!html.includes('../runtime/route-bootstrap.js')) fail(`${path} must load route bootstrap`);
}

const root = read('index.html');
for (const script of [
  './runtime/storage-adapter.js', './runtime/location-engine.js', './runtime/commute-access.js',
  './runtime/ad-runtime.js', './runtime/music-runtime.js',
  './runtime/social-play.js', './runtime/instant-chat.js',
  './runtime/chat-safety.js', './runtime/route-bootstrap.js'
]) if (!root.includes(script)) fail(`index.html is missing ${script}`);
// 흔들리는 열차 안에서 확대를 막으면 안 된다.
if (/user-scalable\s*=\s*no|maximum-scale/.test(root)) fail('index.html must not block pinch zoom');

// 배포되는 화면 전환(관리자/광고주)은 상단바 버튼에 의존한다.
const appSource = read('src/App.jsx');
for (const label of ['사용자 앱', '광고주', '관리자']) {
  if (!appSource.includes(`>${label}<`)) fail(`src/App.jsx must render a "${label}" mode button for route-bootstrap`);
}
if (!/<Gate[\s\S]*<Admin\s*\/>/.test(appSource)) fail('Admin console must be wrapped in <Gate>');
if (!/<Gate[\s\S]*<Advertiser\s*\/>/.test(appSource)) fail('Advertiser console must be wrapped in <Gate>');
// 브라우저에서 모델 API 를 직접 부르면 키가 노출되거나(있을 때) 필터가 꺼진다(없을 때).
if (appSource.includes('api.anthropic.com')) fail('src/App.jsx must not call a model API directly from the browser');
// 베타는 실제 GPS 전용이다. 위치를 못 잡았을 때 가짜 주행으로 대체하면 안 된다.
for (const token of ['DEMO_STATIONS', '체험 모드', '체험 라운지', '모의 모드']) {
  if (appSource.includes(token)) fail(`src/App.jsx must not fall back to simulated movement (found "${token}")`);
}
if (!appSource.includes('screen==="nogps"')) fail('src/App.jsx must show a location-required screen instead of a simulated lounge');

// 접근 코드와 서비스 키는 클라이언트 설정 파일에 있으면 안 된다.
const config = read('config.js');
if (/SUPABASE_SERVICE_ROLE\s*[:=]/i.test(config) || /service_role\s*[:=]\s*["'`]/i.test(config)) {
  fail('config.js must never contain a service-role secret assignment');
}
if (/ADMIN_CODE\s*:|ADV_CODE\s*:/.test(config)) {
  fail('config.js must not ship access codes; they are verified by the subway-admin function');
}

// 채팅: 세션 토큰 없이는 쓰기/삭제가 불가능해야 하고, session_id 를 외부로 흘리면 안 된다.
const chat = read('runtime/instant-chat.js');
for (const action of ["action:'join'", "action:'send'", "action:'leave'", "action:'list'"]) {
  if (!chat.includes(action)) fail(`instant chat must use the ${action} API`);
}
if (!chat.includes('token:token')) fail('instant chat must send its session token with privileged actions');

const fn = read('supabase/functions/subway-message/index.ts');
if (!fn.includes('requireSession')) fail('subway-message must verify session ownership before send/leave');
if (/messages[\s\S]{0,400}session_id:\s*m\.session_id/.test(fn)) fail('subway-message must not return session_id to clients');

// AI 동행은 사람인 척하면 안 된다: 응답에 is_ai 가 실려야 하고 UI 가 배지를 붙여야 한다.
const companions = read('supabase/functions/subway-message/companions.ts');
if (!companions.includes('사람인 척하지 않는다')) fail('AI companions must be instructed not to pose as human');
if (!fn.includes('is_ai: m.is_ai === true')) fail('subway-message must expose is_ai so the client can label AI messages');
if (!chat.includes("m.is_ai?'<span class=\"ai\">AI</span>'")) fail('instant chat must render an AI badge on AI messages');
// AI 발화도 사람과 같은 모더레이션을 통과해야 한다.
if (!fn.includes('if (!moderate(generated.body).ok) return;')) fail('AI companion output must pass the same moderation as human messages');

// 광고 이벤트는 검증 함수를 통해서만 기록되어야 한다.
const ads = read('runtime/ad-runtime.js');
if (ads.includes('/rest/v1/subway_ad_events')) fail('ad events must go through the subway-ad-event function, not a direct table insert');

if (!process.exitCode) console.log('Repository structure, build wiring and privileged paths look correct.');
