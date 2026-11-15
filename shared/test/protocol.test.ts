import { describe, expect, test } from 'vitest';
import { EMOTES, LOOKS, MAX_PLAYERS, MoveBudget, RateLimiter, sanitizeChat, sanitizeName, validateMove } from '../src/protocol';
import { COLLIDERS, PLACEMENTS, ROOM } from '../src/layout';

describe('sanitizeName', () => {
  test('sanitizeName trims and limits to 20 code points', () => {
    expect(sanitizeName('  Efe   Ö  ')).toBe('Efe Ö');
    expect(sanitizeName('ş'.repeat(30))).toBe('ş'.repeat(20));
  });
  test('sanitizeName strips tags and rejects empty', () => {
    expect(sanitizeName('<b>Ali</b>')).toBe('bAli/b');
    expect(sanitizeName('   ')).toBeNull();
    expect(sanitizeName(42)).toBeNull();
    expect(sanitizeName('a\u0000b\u0007c')).toBe('abc');
  });
  test('sanitizeName keeps emoji whole', () => {
    expect(sanitizeName('🐱'.repeat(25))).toBe('🐱'.repeat(20));
  });
});

test('sanitizeChat limits to 200 code points and rejects empty', () => {
  expect(sanitizeChat('x'.repeat(500))!.length).toBe(200);
  expect(sanitizeChat('  merhaba   dünya ')).toBe('merhaba dünya');
  expect(sanitizeChat('\n\t ')).toBeNull();
  expect(sanitizeChat({})).toBeNull();
});

describe('validateMove (shape, room, path)', () => {
  const at = { x: 0, z: 4.6 };
  test('validateMove accepts a normal step', () => {
    expect(validateMove(at, { x: 0, z: 4.52, facing: Math.PI, speed: 1.6 }, COLLIDERS)).toBe(true);
  });
  test('validateMove rejects NaN and outside room and into furniture', () => {
    expect(validateMove(at, { x: NaN, z: 4.6, facing: 0, speed: 0 }, COLLIDERS)).toBe(false);
    expect(validateMove({ x: 0, z: ROOM.depth / 2 - 0.4 }, { x: 0, z: ROOM.depth / 2 + 0.2, facing: 0, speed: 1 }, COLLIDERS)).toBe(false);
    const table = PLACEMENTS.find((p) => p.id === 'masa-3')!;
    expect(validateMove({ x: table.pos[0], z: table.pos[2] + 1.6 }, { x: table.pos[0], z: table.pos[2], facing: 0, speed: 1 }, COLLIDERS)).toBe(false);
  });
  test('validateMove rejects a path that passes through furniture even if the end is free', () => {
    const table = PLACEMENTS.find((p) => p.id === 'masa-3')!;
    expect(validateMove({ x: table.pos[0], z: table.pos[2] + 1.6 }, { x: table.pos[0], z: table.pos[2] - 1.6, facing: 0, speed: 1 }, COLLIDERS)).toBe(false);
  });
});

describe('MoveBudget (distance allowance)', () => {
  test('normal running at 10 Hz is always allowed', () => {
    const b = new MoveBudget(0);
    for (let i = 1; i <= 100; i++) expect(b.spend(0.32, i * 100), `step ${i}`).toBe(true);
  });
  test('a sustained 3x speed hack is capped at the allowed speed', () => {
    const b = new MoveBudget(0);
    let moved = 0;
    for (let i = 1; i <= 20; i++) if (b.spend(0.9, i * 100)) moved += 0.9; // tries 18 m in 2 s
    expect(moved).toBeLessThanOrEqual(3.2 * 1.5 * 2 + 1.5); // rate × time + burst
  });
  test('standing still does not bank a teleport', () => {
    const b = new MoveBudget(0);
    expect(b.spend(12, 2600)).toBe(false);
    expect(b.spend(3, 10000)).toBe(false);
  });
  test('a short network stall delivered as a burst is allowed', () => {
    const b = new MoveBudget(0);
    for (let i = 1; i <= 10; i++) b.spend(0.16, i * 100); // walking
    // 300 ms stall, then 3 queued walking messages arrive together
    expect([b.spend(0.16, 1300), b.spend(0.16, 1300), b.spend(0.16, 1300)]).toEqual([true, true, true]);
  });
});

test('RateLimiter allows 3 per 2 s', () => {
  const r = new RateLimiter(3, 2000);
  expect([r.allow(0), r.allow(100), r.allow(200)]).toEqual([true, true, true]);
  expect(r.allow(1000)).toBe(false);
  expect(r.allow(2100)).toBe(true);
});

test('LOOKS and EMOTES have unique ids and the planned sizes', () => {
  expect(MAX_PLAYERS).toBe(15);
  expect(new Set(LOOKS.map((l) => l.id)).size).toBe(6);
  expect(new Set(EMOTES.map((e) => e.id)).size).toBe(6);
  expect(LOOKS[0]).toEqual({ id: 'kiremit', label: 'Kiremit', color: '#c0583c' });
});

test('MoveBudget: rapid tiny messages cannot add up into a speed hack', () => {
  const b = new MoveBudget(0);
  let moved = 0;
  for (let i = 1; i <= 50; i++) if (b.spend(0.3, i * 20)) moved += 0.3; // 15 m/s attempt over 1 s
  expect(moved).toBeLessThan(6.5); // ≤ run speed × 1.5 + burst
});
