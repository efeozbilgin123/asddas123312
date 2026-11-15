// M1 smoke test: builds must exist (npm run build). Starts `vite preview`, drives the salon
// headlessly in ?still mode (the simulation is advanced with __kh.tick so slow software GL
// doesn't matter) and saves screenshots for the owner.
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs/superpowers/m1');
const PORT = 4179;
const URL = `http://localhost:${PORT}/?still&q=low&debug&name=Deneme`;

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

// detached → own process group, so killing it also stops vite (not just npx)
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: path.join(root, 'client'),
  stdio: 'ignore',
  detached: true
});
const stopServer = () => {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
};
process.on('exit', stopServer);
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir(outDir, { recursive: true });

async function open(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.__kh?.ready === true, null, { timeout: 180000 });
  return { page, errors };
}

try {
  // ---------- desktop ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    const { page, errors } = await open(ctx);
    const before = await page.evaluate(() => __kh.avatar());
    await page.keyboard.down('w');
    await page.evaluate(() => __kh.tick(45));
    await page.keyboard.up('w');
    const after = await page.evaluate(() => __kh.avatar());
    check('desktop: W walks forward', after.z < before.z - 0.5, `z ${before.z.toFixed(2)} → ${after.z.toFixed(2)}`);

    await page.evaluate(() => __kh.teleport(-5.0, -2.9)); // in front of the sofa
    await page.evaluate(() => __kh.tick(1));
    await page.keyboard.press('e');
    await page.evaluate(() => __kh.tick(20));
    const sat = await page.evaluate(() => __kh.avatar());
    check('desktop: E sits on the sofa', sat.mode === 'sit' && sat.seatId?.startsWith('sofa'), `${sat.mode} ${sat.seatId}`);
    await page.screenshot({ path: path.join(outDir, 'desktop-sitting.png'), timeout: 300000 });

    await page.keyboard.press('e');
    await page.evaluate(() => __kh.tick(10));
    const stood = await page.evaluate(() => __kh.avatar());
    check('desktop: E stands up', stood.mode === 'walk', stood.mode);

    await page.evaluate(() => {
      __kh.teleport(0.5, 3.2);
      __kh.tick(30);
    });
    await page.screenshot({ path: path.join(outDir, 'desktop.png'), timeout: 300000 });
    check('desktop: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------- production page exposes no debug hooks ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
    const page = await ctx.newPage();
    await page.goto(URL.replace('&debug', ''));
    await page.waitForSelector('.loading.done', { state: 'attached', timeout: 180000 });
    const exposed = await page.evaluate(() => typeof window.__kh !== 'undefined');
    check('no __kh debug hooks without ?debug', !exposed);
    await ctx.close();
  }

  // ---------- phone (landscape) ----------
  {
    const iphone = devices['iPhone 13 landscape'];
    const ctx = await browser.newContext({ ...iphone });
    const { page, errors } = await open(ctx);
    const visible = await page.isVisible('.joystick');
    check('mobile: joystick visible', visible);

    const box = await page.locator('.joystick').boundingBox();
    const before = await page.evaluate(() => __kh.avatar());
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.evaluate(
      ({ cx, cy }) => {
        const el = document.querySelector('.joystick');
        const opts = { pointerId: 7, clientX: cx, clientY: cy, bubbles: true, pointerType: 'touch' };
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        window.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientY: cy - 60 }));
      },
      { cx, cy }
    );
    await page.evaluate(() => __kh.tick(30));
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true })));
    const after = await page.evaluate(() => __kh.avatar());
    const moved = Math.hypot(after.x - before.x, after.z - before.z);
    check('mobile: joystick drag moves the avatar', moved > 0.5, `${moved.toFixed(2)} m`);

    await page.evaluate(() => {
      __kh.teleport(-5.0, -2.9);
      __kh.tick(2);
    });
    const sitVisible = await page.isVisible('.sit-btn');
    const sitText = sitVisible ? await page.textContent('.sit-btn') : '';
    check('mobile: "Otur" button near a seat', sitVisible && sitText.trim() === 'Otur', sitText);
    await page.screenshot({ path: path.join(outDir, 'mobile.png'), timeout: 300000 });
    check('mobile: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
} catch (err) {
  check('smoke run', false, err.message);
} finally {
  await browser.close();
  stopServer();
}

console.log(failures === 0 ? 'ALL OK' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
