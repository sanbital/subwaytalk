import * as esbuild from 'esbuild';
import { BUILD_OPTIONS, OUTFILE } from './build.mjs';

const result = await esbuild.build({ ...BUILD_OPTIONS, outfile: OUTFILE, metafile: true });
const bytes = Object.values(result.metafile.outputs)[0].bytes;
console.log(`built ${OUTFILE} (${(bytes / 1024).toFixed(1)} kB)`);
