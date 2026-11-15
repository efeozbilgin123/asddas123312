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
