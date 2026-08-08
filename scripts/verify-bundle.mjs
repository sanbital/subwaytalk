// 커밋된 app.js 가 src/ 에서 실제로 빌드된 결과와 같은지 검증한다.
// 과거에 app.js 와 src/App.jsx 가 서로 다른 세대로 갈라져
// 관리자/광고주 화면이 배포본에서 통째로 사라진 적이 있어 그 재발을 막는 장치다.
import fs from 'node:fs';
import * as esbuild from 'esbuild';
import { BUILD_OPTIONS, OUTFILE } from './build.mjs';

if (!fs.existsSync(OUTFILE)) {
  console.error(`BUNDLE ERROR: ${OUTFILE} is missing. Run \`npm run build\`.`);
  process.exit(1);
}

const result = await esbuild.build({ ...BUILD_OPTIONS, write: false, outfile: OUTFILE });
const fresh = result.outputFiles[0].text;
const shipped = fs.readFileSync(OUTFILE, 'utf8');

if (fresh !== shipped) {
  console.error(`BUNDLE ERROR: ${OUTFILE} is out of date with src/. Run \`npm run build\` and commit the result.`);
  console.error(`  committed: ${shipped.length} bytes / rebuilt: ${fresh.length} bytes`);
  process.exit(1);
}
console.log(`Bundle matches src/ (${OUTFILE} is reproducible).`);
