// M2 two-player test: starts the real server (serving the built client) and drives two
// browsers in ?still mode. Requires `npm run build` first.
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 2617;
const BASE = `http://localhost:${PORT}`;

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function waitFor(fn, timeoutMs, stepMs = 200) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return v;
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

// detached → own process group, so killing it also stops the tsx child (not just npx)
try {
  await fetch(`${BASE}/health`);
  console.log(`FAIL port ${PORT} already in use (stale server?)`);
  process.exit(1);
} catch {
  /* port free */
}
const server = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.join(root, 'server'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore', detached: true });
const stopServer = () => {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
};
process.on('exit', stopServer);
await waitFor(async () => {
  try {
    return (await fetch(`${BASE}/health`)).ok;
  } catch {
    return false;
  }
}, 30000, 500);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctxA = await browser.newContext({ viewport: { width: 960, height: 540 } });
const ctxB = await browser.newContext({ viewport: { width: 960, height: 540 } });

async function open(ctx, name, look) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/?debug&still&q=low&name=${encodeURIComponent(name)}&look=${look}`);
  await page.waitForFunction(() => window.__kh?.ready === true, null, { timeout: 180000 });
  return { page, errors };
}
/** Advance a page's simulation (network callbacks run between ticks). */
const pump = (page, n = 3) => page.evaluate((k) => __kh.tick(k), n);

try {
  const A = await open(ctxA, 'Ayşe', 'hardal');
  const B = await open(ctxB, 'Mehmet', 'lacivert');
  const count = (p) => p.evaluate(() => __kh.session().players().size);
  check('both online and see 2 players', (await count(A.page)) === 2 && (await count(B.page)) === 2 &&
    (await A.page.evaluate(() => __kh.session().online)) === true);

  // A walks forward ~2 m
  const aId = await A.page.evaluate(() => __kh.session().selfId);
  const start = await A.page.evaluate(() => __kh.avatar());
  await A.page.keyboard.down('w');
  for (let i = 0; i < 14; i++) {
    await pump(A.page);
    await A.page.waitForTimeout(110);
  }
  await A.page.keyboard.up('w');
  const moved = await waitFor(async () => {
    await pump(B.page, 1);
    const seen = await B.page.evaluate((id) => __kh.session().players().get(id), aId);
    return seen && Math.hypot(seen.x - start.x, seen.z - start.z) > 1.5 ? seen : null;
  }, 3000);
  check('B sees A move', !!moved, moved ? `${moved.z.toFixed(2)}` : 'no');

  // A sits on the sofa; B can't take it
  // clear route around tables, the lamp stool and the sofa
  for (const w of [[0, 3.6], [-2.8, 3.6], [-2.8, 0.5], [-2.5, -1.0], [-2.5, -3.15], [-5.0, -3.15]]) {
    await A.page.evaluate(([x, z]) => __kh.walkTo(x, z), w);
    for (let i = 0; i < 40; i++) {
      await pump(A.page, 2);
      await A.page.waitForTimeout(60);
      const a = await A.page.evaluate(() => __kh.avatar());
      if (Math.hypot(a.x - w[0], a.z - w[1]) < 0.15) break;
    }
  }
  await A.page.keyboard.press('e');
  await pump(A.page, 2);
  const seated = await waitFor(async () => {
    await pump(B.page, 1);
    const seen = await B.page.evaluate((id) => __kh.session().players().get(id), aId);
    return seen?.seatId === 'sofa-l';
  }, 3000);
  check('B sees A seated on the sofa', seated);
  const bOffered = await B.page.evaluate(() => {
    __kh.teleport(-5.0, -3.15);
    __kh.tick(1);
    return __kh.nearestFreeSeat();
  });
  check('sofa-l is not offered to B', bOffered !== 'sofa-l', String(bOffered));

  // chat + emote
  await A.page.evaluate(() => __kh.session().chat('Merhaba'));
  const chatSeen = await waitFor(async () => {
    await pump(B.page, 1);
    const t = await B.page.evaluate(() => __kh.chatText());
    return t.includes('Ayşe') && t.includes('Merhaba');
  }, 3000);
  check('B reads A\'s chat', chatSeen);
  await A.page.evaluate(() => __kh.session().emote('cay'));
  const bubble = await waitFor(async () => {
    await pump(B.page, 1);
    return B.page.evaluate((id) => __kh.hasBubble(id), aId);
  }, 3000);
  check('B sees A\'s emote bubble', bubble);

  await mkdir(path.join(root, 'docs/superpowers/m2'), { recursive: true });
  await B.page.evaluate(() => __kh.view(-3.6, 1.9, -0.6, -5.0, 0.8, -2.6));
  await B.page.screenshot({ path: path.join(root, 'docs/superpowers/m2/two-players.png'), timeout: 300000 });

  // A leaves
  await ctxA.close();
  const left = await waitFor(async () => {
    await pump(B.page, 1);
    return (await count(B.page)) === 1;
  }, 20000, 500);
  check('B sees A leave', left);
  const leaveLine = await B.page.evaluate(() => __kh.chatText());
  check('leave line in chat', leaveLine.includes('Ayşe ayrıldı'));
  check('no page errors', A.errors.length + B.errors.length === 0, [...A.errors, ...B.errors].join(' | '));
} catch (err) {
  check('multi run', false, err.message);
} finally {
  await browser.close();
  stopServer();
}
console.log(failures === 0 ? 'ALL OK' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
