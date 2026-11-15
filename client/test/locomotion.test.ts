import { expect, test } from 'vitest';
import { locomotion } from '../src/avatar/locomotion';

const sum = (w: { idle: number; walk: number; run: number }) => w.idle + w.walk + w.run;

test('weights always sum to 1 and change smoothly with speed', () => {
  let prev = locomotion(0);
  for (let v = 0; v <= 3.4; v += 0.02) {
    const w = locomotion(v);
    expect(sum(w)).toBeCloseTo(1, 6);
    for (const k of ['idle', 'walk', 'run'] as const) expect(Math.abs(w[k] - prev[k])).toBeLessThan(0.05);
    prev = w;
  }
});

test('standing is idle, walking speed is pure walk, top speed is pure run', () => {
  expect(locomotion(0)).toMatchObject({ idle: 1, walk: 0, run: 0 });
  expect(locomotion(1.6)).toMatchObject({ idle: 0, walk: 1, run: 0 });
  expect(locomotion(3.2)).toMatchObject({ idle: 0, walk: 0, run: 1 });
});

test('stride tempo follows speed so feet do not slide', () => {
  expect(locomotion(0.8).walkScale).toBeLessThan(locomotion(1.6).walkScale);
  expect(locomotion(1.6).walkScale).toBeCloseTo(1.6 / 1.45, 2);
  expect(locomotion(3.2).runScale).toBeCloseTo(3.2 / 3.6, 2);
});
