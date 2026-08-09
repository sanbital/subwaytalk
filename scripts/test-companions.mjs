// AI 동행 밀도 규칙 회귀 테스트.
//
// 여기서 지키려는 불변식은 하나다: "사람이 늘면 AI 는 스스로 물러난다."
// 이 규칙이 조용히 깨지면 실제 사용자가 모인 방에서도 AI 가 계속 떠들게 되고,
// 그건 서비스의 신뢰를 직접 깎는다. 그래서 CI 에서 매번 확인한다.
//
// companions.ts 는 Deno + npm: 스펙파이어를 쓰므로, esbuild 로 번들하면서
// SDK 를 스텁으로 바꾸고 Deno.env 를 비워 기본값(TARGET=4, MAX=3, GAP=45, CAP=40)을 검증한다.
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'companions-test-'));
const stub = path.join(tmp, 'sdk-stub.mjs');
fs.writeFileSync(stub, 'export default class Anthropic { constructor() {} }\n');

const out = path.join(tmp, 'companions.mjs');
await build({
  entryPoints: ['supabase/functions/subway-message/companions.ts'],
  outfile: out,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  alias: { 'npm:@anthropic-ai/sdk': stub }
});

// 환경변수를 비워 두면 companions.ts 의 기본 상수가 그대로 쓰인다.
globalThis.Deno = { env: { get: () => undefined } };
const { shouldGenerate, generateCompanionMessage } = await import(`file://${out}`);

let failed = 0;
const check = (label, got, want) => {
  if (got === want) return;
  failed++;
  console.error(`COMPANION TEST FAIL: ${label} -> ${got} (expected ${want})`);
};
const ctx = (humans, companions) => ({
  room: '2호선|up', line: '2호선', direction: 'up', station: '강남',
  daypart: 'morning', recent: [], humans, companions
});

// 사람이 없을 때: MAX_COMPANIONS(3) 까지 채운다.
check('empty room fills up', shouldGenerate(ctx(0, 0), null, 0), true);
check('two companions still short of max', shouldGenerate(ctx(0, 2), null, 0), true);
check('max companions reached', shouldGenerate(ctx(0, 3), null, 0), false);

// 사람이 늘수록 자리를 내준다: wanted = min(MAX, TARGET - humans).
check('2 humans wants 2 companions', shouldGenerate(ctx(2, 1), null, 0), true);
check('2 humans already has 2', shouldGenerate(ctx(2, 2), null, 0), false);
check('target reached, AI withdraws', shouldGenerate(ctx(4, 0), null, 0), false);
check('busy room, AI stays out', shouldGenerate(ctx(9, 0), null, 0), false);

// 사람 대화를 덮지 않도록 최소 간격과 시간당 상한을 지킨다.
check('inside min gap', shouldGenerate(ctx(0, 0), 10, 0), false);
check('past min gap', shouldGenerate(ctx(0, 0), 60, 0), true);
check('hourly cap reached', shouldGenerate(ctx(0, 0), null, 40), false);
check('under hourly cap', shouldGenerate(ctx(0, 0), null, 39), true);

// 키가 없으면 조용히 아무것도 하지 않는다(빈 방이 가짜로 채워지지 않는다).
check('no API key means no generation', await generateCompanionMessage(ctx(0, 0)), null);

fs.rmSync(tmp, { recursive: true, force: true });

if (failed) process.exitCode = 1;
else console.log('AI companion density rules hold (AI thins out as humans arrive).');
