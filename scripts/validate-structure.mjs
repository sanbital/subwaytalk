import fs from 'node:fs';

const fail = (message) => { console.error(`STRUCTURE ERROR: ${message}`); process.exitCode = 1; };
const mustExist = [
  'app.js',
  'src/App.jsx',
  'runtime/storage-adapter.js',
  'runtime/location-engine.js',
  'runtime/location-ui.js',
  'runtime/ad-runtime.js',
  'runtime/music-runtime.js',
  'runtime/route-bootstrap.js',
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
  './runtime/storage-adapter.js',
  './runtime/location-engine.js',
  './runtime/location-ui.js',
  './runtime/ad-runtime.js',
  './runtime/music-runtime.js',
  './runtime/route-bootstrap.js'
]) if (!root.includes(script)) fail(`index.html is missing ${script}`);

const config = fs.readFileSync('config.js', 'utf8');
if (/SUPABASE_SERVICE_ROLE\s*[:=]/i.test(config) || /service_role\s*[:=]\s*["'`]/i.test(config)) {
  fail('config.js must never contain a service-role secret assignment');
}

if (!process.exitCode) console.log('Repository structure is normalized.');
