import { expect, test } from 'vitest';
import { flicker } from '../src/world/flicker';

test('flicker stays within [0.75, 1]', () => {
  for (let t = 0; t < 60; t += 0.01) {
    const f = flicker(t);
    expect(f).toBeGreaterThanOrEqual(0.75);
    expect(f).toBeLessThanOrEqual(1);
  }
});

test('flicker is continuous', () => {
  for (let t = 0; t < 60; t += 0.01) expect(Math.abs(flicker(t + 0.01) - flicker(t))).toBeLessThan(0.05);
});

test('flicker varies (not constant)', () => {
  const vals = Array.from({ length: 200 }, (_, i) => flicker(i * 0.1));
  expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0.1);
});

import { fireColor } from '../src/world/flicker';

test('fireColor is a warm orange that brightens with flicker', () => {
  const dim = fireColor(0.75);
  const bright = fireColor(1);
  for (const c of [dim, bright]) {
    expect(c.r).toBe(1);
    expect(c.g).toBeGreaterThan(0.2);
    expect(c.g).toBeLessThan(0.75);
    expect(c.b).toBeLessThan(c.g);
  }
  expect(bright.g).toBeGreaterThan(dim.g);
});
