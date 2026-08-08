// app.js 빌드 옵션의 단일 출처.
// npm run build 와 npm run check:build 가 반드시 같은 설정을 쓰도록 여기서만 정의한다.
export const BUILD_OPTIONS = {
  entryPoints: ['src/main.jsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2019',
  define: { 'process.env.NODE_ENV': '"production"' }
};

export const OUTFILE = 'app.js';
