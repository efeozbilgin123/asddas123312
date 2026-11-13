import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hasSource =
  fs.existsSync(path.join(rootDir, 'index.html')) &&
  fs.existsSync(path.join(rootDir, 'src'));
const hasDist = fs.existsSync(path.join(rootDir, 'dist', 'index.html'));

if (!hasSource || hasDist) {
  process.exit(0);
}

const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
if (!fs.existsSync(viteBin)) {
  process.exit(0);
}

console.log('[ensure-dist] dist/index.html eksik, vite build calistiriliyor...');
execFileSync(process.execPath, [viteBin, 'build'], {
  cwd: rootDir,
  stdio: 'inherit'
});
