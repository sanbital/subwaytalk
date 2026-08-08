import fs from 'node:fs';

const fail = (message) => { console.error(`STRUCTURE ERROR: ${message}`); process.exitCode = 1; };
const mustExist = [
  'app.js',
  'src/App.jsx',
  'runtime/storage-adapter.js',
  'runtime/location-engine.js',
  'runtime/commute-access.js',
  'runtime/location-ui.js',
  'runtime/ad-runtime.js',
  'runtime/music-runtime.js',
  'runtime/social-play.js',
  'runtime/sticker-picker-fix.js',
  'runtime/instant-chat.js',
  'runtime/chat-safety.js',
  'runtime/route-bootstrap.js',
  'supabase/functions/subway-message/index.ts',
  'supabase/migrations/20260808_subway_commute_play_v1.sql',
  'admin/index.html',
  'advertiser/index.html'
];
for (const path of mustExist) if (!fs.existsSync(path)) fail(`${path} is missing`);

for (const path of ['admin/app.js', 'advertiser/app.js', 'lounge.html', 'lounge.jsx', 'supabase_schema.sql']) {
  if (fs.existsSync(path)) fail(`${path} is obsolete and must not exist`);
}

for (const path of ['admin/index.html', 'advertiser/index.html']) {
  const html = fs.readFileSync(path, 'utf8');
  if (!html.includes('../app.js')) fail(`${path} must load ../app.js`);
  if (!html.includes('../runtime/storage-adapter.js')) fail(`${path} must load isolated storage adapter`);
  if (!html.includes('../runtime/route-bootstrap.js')) fail(`${path} must load route bootstrap`);
}

const root = fs.readFileSync('index.html', 'utf8');
for (const script of [
  './runtime/storage-adapter.js', './runtime/location-engine.js', './runtime/commute-access.js',
  './runtime/location-ui.js', './runtime/ad-runtime.js', './runtime/music-runtime.js',
  './runtime/social-play.js', './runtime/sticker-picker-fix.js', './runtime/instant-chat.js',
  './runtime/chat-safety.js', './runtime/route-bootstrap.js'
]) if (!root.includes(script)) fail(`index.html is missing ${script}`);

const config = fs.readFileSync('config.js', 'utf8');
if (/SUPABASE_SERVICE_ROLE\s*[:=]/i.test(config) || /service_role\s*[:=]\s*["'`]/i.test(config)) fail('config.js must never contain a service-role secret assignment');

const chat = fs.readFileSync('runtime/instant-chat.js','utf8');
if (!chat.includes("action:'leave'") || !chat.includes("action:'send'")) fail('instant chat must use ephemeral send/leave API');
const safety = fs.readFileSync('runtime/chat-safety.js','utf8');
if (!/性交|セックス|fuck|시발/.test(safety)) fail('multilingual immediate moderation patterns are missing');

if (!process.exitCode) console.log('Repository structure is normalized and commute-play ready.');
