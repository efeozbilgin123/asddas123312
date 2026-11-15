// Checks the packed preview (npm run build && node scripts/pack-preview.mjs) with the live
// animation loop running, the way a viewer opens it: real-time W walks the avatar.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4191;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: path.join(root, 'preview'), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let ok = true;
try {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/?q=low&debug`);
  await page.waitForFunction(() => window.__kh?.ready === true, null, { timeout: 240000 });
  const missing = await page.locator('.missing').count();
  const before = await page.evaluate(() => __kh.avatar());
  await page.keyboard.down('w');
  await page.waitForTimeout(4000);
  await page.keyboard.up('w');
  const after = await page.evaluate(() => __kh.avatar());
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  const fps = await page.evaluate(() => __kh.fps());
  console.log(`moved ${moved.toFixed(2)} m · fps(sw) ${fps.toFixed(1)} · missing-notice ${missing} · errors ${errors.length}`);
  ok = moved > 0.3 && missing === 0 && errors.length === 0;
} finally {
  await browser.close();
  server.kill();
}
console.log(ok ? 'PREVIEW OK' : 'PREVIEW FAIL');
process.exit(ok ? 0 : 1);
