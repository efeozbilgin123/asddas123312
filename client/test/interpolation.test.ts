import { expect, test } from 'vitest';
import { SnapshotBuffer } from '../src/net/interpolation';

const snap = (x: number, facing = 0) => ({ x, z: 0, facing, speed: 1 });

test('samples halfway between two snapshots (rendered 100 ms in the past)', () => {
  const b = new SnapshotBuffer();
  b.push(1000, snap(0));
  b.push(1100, snap(1));
  const s = b.sample(1150)!; // render time 1050
  expect(s.x).toBeCloseTo(0.5, 5);
});

test('facing interpolates the short way across ±π', () => {
  const b = new SnapshotBuffer();
  b.push(1000, snap(0, Math.PI - 0.1));
  b.push(1100, snap(0, -Math.PI + 0.1));
  const f = b.sample(1150)!.facing;
  expect(Math.abs(Math.abs(f) - Math.PI)).toBeLessThan(0.02);
});

test('holds the last snapshot when starved', () => {
  const b = new SnapshotBuffer();
  b.push(1000, snap(0));
  b.push(1100, snap(1));
  expect(b.sample(5000)!.x).toBeCloseTo(1, 5);
});

test('returns null when empty and the only snapshot when there is one', () => {
  const b = new SnapshotBuffer();
  expect(b.sample(1000)).toBeNull();
  b.push(1000, snap(3));
  expect(b.sample(1000)!.x).toBe(3);
});
