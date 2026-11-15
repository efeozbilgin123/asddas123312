import { describe, expect, test } from 'vitest';
import { resolveCircle } from '../src/avatar/collision';
import { step, type AvatarState } from '../src/avatar/controller';
import { box, WALL_COLLIDERS, type Box2 } from '../src/world/layout';

const start = (x = 0, z = 0): AvatarState => ({ x, z, facing: 0, speed: 0, mode: 'walk', seatId: null });
const run = (s: AvatarState, input: { x: number; z: number; run: boolean }, seconds: number, boxes: Box2[] = []) => {
  for (let t = 0; t < seconds; t += 1 / 60) s = step(s, input, 1 / 60, boxes);
  return s;
};
const insideBox = (x: number, z: number, b: Box2, r = 0.3) =>
  x > b.minX - r + 1e-6 && x < b.maxX + r - 1e-6 && z > b.minZ - r + 1e-6 && z < b.maxZ + r - 1e-6;

describe('controller', () => {
  test('walks forward at 1.6 m/s after acceleration', () => {
    const s = run(start(), { x: 0, z: -1, run: false }, 2);
    expect(s.speed).toBeCloseTo(1.6, 2);
    const s2 = run(s, { x: 0, z: -1, run: false }, 1);
    expect(s.z - s2.z).toBeCloseTo(1.6, 1);
  });

  test('runs at 3.2 m/s', () => {
    expect(run(start(), { x: 0, z: -1, run: true }, 2).speed).toBeCloseTo(3.2, 2);
  });

  test('diagonal input is normalized (no faster diagonal)', () => {
    const s = run(start(), { x: 1, z: -1, run: false }, 3);
    expect(s.speed).toBeCloseTo(1.6, 2);
  });

  test('step clamps dt and never ends inside a collider', () => {
    const b = box(0, -1, 0.5, 0.5); // near edge at z = -0.5
    let s = start(0, -0.5 + 0.31);
    s = { ...s, speed: 1.6 };
    s = step(s, { x: 0, z: -1, run: true }, 5, [b, ...WALL_COLLIDERS]);
    expect(insideBox(s.x, s.z, b)).toBe(false);
    for (const w of WALL_COLLIDERS) expect(insideBox(s.x, s.z, w)).toBe(false);
  });

  test('slides along a wall when moving diagonally into it', () => {
    const wall = { minX: 1, maxX: 2, minZ: -10, maxZ: 10 };
    const s = run(start(0.69, 0), { x: 1, z: -1, run: false }, 1, [wall]);
    expect(s.x).toBeLessThanOrEqual(0.7 + 1e-6);
    expect(s.z).toBeLessThan(-0.5);
  });

  test('facing turns toward movement direction', () => {
    const s = run(start(), { x: 1, z: 0, run: false }, 1);
    expect(s.facing).toBeCloseTo(Math.PI / 2, 2);
  });

  test('sitting avatar does not move', () => {
    const s: AvatarState = { ...start(), mode: 'sit', seatId: 'x' };
    expect(step(s, { x: 1, z: 1, run: true }, 0.5, [])).toEqual(s);
  });

  test('resolveCircle pushes a circle out of a box', () => {
    const p = resolveCircle({ x: 0, z: 0.6 }, 0.3, [box(0, 0, 0.5, 0.5)]);
    expect(p.z).toBeCloseTo(0.8, 5);
  });
});
