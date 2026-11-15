import { expect, test } from 'vitest';
import { nearestSeat, sitDown, standUp } from '../src/interact/seats';
import type { AvatarState } from '../src/avatar/controller';
import { COLLIDERS, SEATS, seatApproach, type Seat } from '../src/world/layout';

const seats: Seat[] = [
  { id: 'a', pos: [0, 0, 0], facingY: 0, kind: 'sofa' },
  { id: 'b', pos: [1, 0, 0], facingY: 0, kind: 'sofa' }
];
const walker = (x: number, z: number): AvatarState => ({ x, z, facing: 0, speed: 1, mode: 'walk', seatId: null });

test('nearestSeat returns null beyond radius and picks closest', () => {
  expect(nearestSeat({ x: 5, z: 5 }, seats, new Set())).toBeNull();
  expect(nearestSeat({ x: 0.8, z: 0.3 }, seats, new Set())?.id).toBe('b');
  expect(nearestSeat({ x: 0.1, z: 0.3 }, seats, new Set())?.id).toBe('a');
});

test('nearestSeat skips occupied seats', () => {
  expect(nearestSeat({ x: 0.8, z: 0.3 }, seats, new Set(['b']))?.id).toBe('a');
});

test('sitDown snaps to the seat and faces its direction', () => {
  const s = sitDown(walker(0.5, 0.5), { id: 'c', pos: [2, 0, 3], facingY: 1.2, kind: 'chair' });
  expect(s).toMatchObject({ x: 2, z: 3, facing: 1.2, speed: 0, mode: 'sit', seatId: 'c' });
});

test('standUp never places avatar inside a collider', () => {
  // circle (r = 0.3) vs box overlap
  const inside = (x: number, z: number) =>
    COLLIDERS.some((b) => {
      const dx = x - Math.max(b.minX, Math.min(x, b.maxX));
      const dz = z - Math.max(b.minZ, Math.min(z, b.maxZ));
      return Math.hypot(dx, dz) < 0.3 - 1e-6;
    });
  for (const seat of SEATS) {
    const s = standUp(sitDown(walker(0, 0), seat), seat, COLLIDERS);
    expect(s.mode).toBe('walk');
    expect(s.seatId).toBeNull();
    expect(inside(s.x, s.z), seat.id).toBe(false);
  }
});

test('nearestSeat measures from the seat approach point, so chairs are reachable from behind', () => {
  const chair = SEATS.find((s) => s.kind === 'chair')!;
  const a = seatApproach(chair);
  expect(nearestSeat(a, [chair], new Set())?.id).toBe(chair.id);
});
