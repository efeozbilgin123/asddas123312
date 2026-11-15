import { describe, expect, test } from 'vitest';
import { EMOTES, LOOKS, MAX_PLAYERS, RateLimiter, sanitizeChat, sanitizeName, validateMove } from '../src/protocol';
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

describe('validateMove', () => {
  const at = { x: 0, z: 4.6 };
  test('validateMove accepts a normal step', () => {
    expect(validateMove(at, { x: 0, z: 4.52, facing: Math.PI, speed: 1.6 }, 0.05, COLLIDERS)).toBe(true);
  });
  test('validateMove allows a lag burst within slack', () => {
    expect(validateMove(at, { x: 0, z: 0.1, facing: 0, speed: 3.2 }, 1, COLLIDERS)).toBe(true); // 4.5 m in 1 s
    expect(validateMove(at, { x: 0, z: -1.4, facing: 0, speed: 3.2 }, 1, COLLIDERS)).toBe(false); // 6 m in 1 s
  });
  test('validateMove rejects NaN and outside room and into furniture', () => {
    expect(validateMove(at, { x: NaN, z: 4.6, facing: 0, speed: 0 }, 1, COLLIDERS)).toBe(false);
    expect(validateMove({ x: 0, z: ROOM.depth / 2 - 0.4 }, { x: 0, z: ROOM.depth / 2 + 0.2, facing: 0, speed: 1 }, 1, COLLIDERS)).toBe(false);
    const table = PLACEMENTS.find((p) => p.id === 'masa-3')!;
    expect(validateMove({ x: table.pos[0], z: table.pos[2] + 1.6 }, { x: table.pos[0], z: table.pos[2], facing: 0, speed: 1 }, 1, COLLIDERS)).toBe(false);
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
