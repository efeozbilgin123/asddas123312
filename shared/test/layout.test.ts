import { describe, expect, test } from 'vitest';
import {
  BILLIARD_AREA, CAT_EDGES, CAT_SPOTS, COLLIDERS, FURNITURE_COLLIDERS, PLACEMENTS, ROOM, SEATS, SPAWN,
  seatApproach, type Box2
} from '../src/layout';

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

describe('cat edges', () => {
  test('every cat edge is a clear straight path (0.2 m from all colliders)', () => {
    for (const [a, b] of CAT_EDGES) {
      const p = CAT_SPOTS.find((s) => s.id === a)!.pos;
      const q = CAT_SPOTS.find((s) => s.id === b)!.pos;
      for (let t = 0; t <= 1; t += 0.01) {
        const x = p[0] + (q[0] - p[0]) * t;
        const z = p[2] + (q[2] - p[2]) * t;
        for (const c of COLLIDERS) {
          const dx = x - Math.max(c.minX, Math.min(x, c.maxX));
          const dz = z - Math.max(c.minZ, Math.min(z, c.maxZ));
          expect(Math.hypot(dx, dz), `${a}→${b} at t=${t.toFixed(2)}`).toBeGreaterThanOrEqual(0.2);
        }
      }
    }
  });

  test('cat edge graph connects every spot', () => {
    const seen = new Set([CAT_SPOTS[0]!.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [a, b] of CAT_EDGES) {
        if (seen.has(a) !== seen.has(b)) { seen.add(a); seen.add(b); grew = true; }
      }
    }
    expect(seen.size).toBe(CAT_SPOTS.length);
  });

  test('the wicker basket has a collider', () => {
    expect(PLACEMENTS.find((p) => p.id === 'basket')?.collider).toBeDefined();
  });
});

describe('reachability', () => {
  test('every seat approach point is reachable on foot from SPAWN', async () => {
    const { overlapsAny } = await import('../src/collision');
    const R = 0.3;
    const cell = 0.1;
    const W = ROOM.width / 2;
    const D = ROOM.depth / 2;
    const key = (i: number, j: number) => `${i},${j}`;
    const toIJ = (x: number, z: number) => [Math.round((x + W) / cell), Math.round((z + D) / cell)] as const;
    const free = (i: number, j: number) => !overlapsAny({ x: i * cell - W, z: j * cell - D }, R, COLLIDERS);
    const [si, sj] = toIJ(SPAWN[0], SPAWN[2]);
    const seen = new Set([key(si, sj)]);
    const queue: [number, number][] = [[si, sj]];
    while (queue.length) {
      const [i, j] = queue.pop()!;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di!, nj = j + dj!;
        const k = key(ni, nj);
        if (!seen.has(k) && free(ni, nj)) {
          seen.add(k);
          queue.push([ni, nj]);
        }
      }
    }
    const unreachable = SEATS.filter((seat) => {
      const a = seatApproach(seat);
      const [ai, aj] = toIJ(a.x, a.z);
      return ![-2, -1, 0, 1, 2].some((di) => [-2, -1, 0, 1, 2].some((dj) => seen.has(key(ai + di, aj + dj))));
    }).map((s) => s.id);
    expect(unreachable).toEqual([]);
  });
});
