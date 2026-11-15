import { describe, expect, test } from 'vitest';
import {
  BILLIARD_AREA, CAT_SPOTS, COLLIDERS, FURNITURE_COLLIDERS, PLACEMENTS, ROOM, SEATS, SPAWN,
  seatApproach, type Box2
} from '../src/world/layout';
import { MANIFEST } from '../src/world/manifest';

const overlaps = (a: Box2, b: Box2) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
const inside = (x: number, z: number, b: Box2) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
const inRoom = (x: number, z: number) => Math.abs(x) < ROOM.width / 2 && Math.abs(z) < ROOM.depth / 2;

describe('layout', () => {
  test('no two colliders of furniture overlap', () => {
    for (let i = 0; i < FURNITURE_COLLIDERS.length; i++)
      for (let j = i + 1; j < FURNITURE_COLLIDERS.length; j++)
        expect(overlaps(FURNITURE_COLLIDERS[i]!, FURNITURE_COLLIDERS[j]!), `${i} vs ${j}`).toBe(false);
  });

  test('every seat approach point is outside all colliders and inside the room', () => {
    for (const seat of SEATS) {
      const p = seatApproach(seat);
      expect(inRoom(p.x, p.z), seat.id).toBe(true);
      for (const c of COLLIDERS) expect(inside(p.x, p.z, c), seat.id).toBe(false);
    }
  });

  test('SPAWN is outside all colliders', () => {
    for (const c of COLLIDERS) expect(inside(SPAWN[0], SPAWN[2], c)).toBe(false);
  });

  test('every placement asset id exists in MANIFEST', () => {
    const ids = new Set(MANIFEST.map((m) => m.id));
    for (const p of PLACEMENTS) expect(ids.has(p.asset), p.asset).toBe(true);
  });

  test('BILLIARD_AREA intersects no collider', () => {
    for (const c of FURNITURE_COLLIDERS) expect(overlaps(BILLIARD_AREA, c)).toBe(false);
  });

  test('every CAT_SPOT is outside all colliders', () => {
    for (const s of CAT_SPOTS) for (const c of COLLIDERS) expect(inside(s.pos[0], s.pos[2], c), s.id).toBe(false);
  });

  test('there are 16 game chairs and at least 4 lounge seats', () => {
    expect(SEATS.filter((s) => s.kind === 'chair').length).toBe(16);
    expect(SEATS.filter((s) => s.kind !== 'chair').length).toBeGreaterThanOrEqual(4);
  });
});
