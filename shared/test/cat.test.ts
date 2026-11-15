import { expect, test } from 'vitest';
import { catStep, initialCat, type CatState } from '../src/cat-brain';
import { CAT_EDGES, CAT_SPOTS, COLLIDERS } from '../src/layout';

function seeded(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const far = { x: 100, z: 100 };
const insideAny = (x: number, z: number, r = 0.15) =>
  COLLIDERS.some((b) => {
    const dx = x - Math.max(b.minX, Math.min(x, b.maxX));
    const dz = z - Math.max(b.minZ, Math.min(z, b.maxZ));
    return Math.hypot(dx, dz) < r - 1e-6;
  });

test('cat rests then walks to a different spot', () => {
  const rng = seeded(3);
  let s: CatState = initialCat(CAT_SPOTS, rng);
  const startSpot = s.targetId;
  expect(s.action).not.toBe('walk');
  let walked = false;
  for (let i = 0; i < 60 * 70; i++) {
    s = catStep(s, 1 / 60, { spots: CAT_SPOTS, avatar: far, rng });
    if (s.action === 'walk') { walked = true; break; }
  }
  expect(walked).toBe(true);
  expect(s.targetId).not.toBe(startSpot);
});

test('cat arrives and rests at its target', () => {
  const rng = seeded(5);
  let s = initialCat(CAT_SPOTS, rng);
  s = { ...s, action: 'walk', targetId: 'pencere', timer: 0 };
  for (let i = 0; i < 60 * 60 && s.action === 'walk'; i++) s = catStep(s, 1 / 60, { spots: CAT_SPOTS, avatar: far, rng });
  const spot = CAT_SPOTS.find((p) => p.id === 'pencere')!;
  expect(s.action).not.toBe('walk');
  expect(Math.hypot(s.x - spot.pos[0], s.z - spot.pos[2])).toBeLessThan(0.1);
});

test('cat picks a new target when blocked', () => {
  const rng = seeded(7);
  const spot = CAT_SPOTS.find((p) => p.id === 'pencere')!;
  let s: CatState = { x: spot.pos[0], z: spot.pos[2] + 3, facing: Math.PI, action: 'walk', targetId: 'pencere', fromId: 'masalar-arasi', timer: 0 };
  const avatar = { x: spot.pos[0], z: spot.pos[2] + 2.4 }; // standing on the path
  s = catStep(s, 1 / 60, { spots: CAT_SPOTS, avatar, rng });
  expect(s.targetId).toBe('masalar-arasi'); // turns back the way it came
  // with nowhere to turn back to, it waits instead of walking into the avatar
  let w: CatState = { ...s, targetId: 'pencere', fromId: null, action: 'walk' };
  w = catStep(w, 1 / 60, { spots: CAT_SPOTS, avatar, rng });
  expect(w.action).toBe('sit');
});

test('cat never ends a step inside a collider', () => {
  const rng = seeded(11);
  let s = initialCat(CAT_SPOTS, rng);
  for (let i = 0; i < 1000; i++) {
    s = catStep(s, 0.5, { spots: CAT_SPOTS, avatar: { x: (rng() - 0.5) * 14, z: (rng() - 0.5) * 10 }, rng });
    expect(insideAny(s.x, s.z), `step ${i}`).toBe(false);
  }
});

test('cat with the avatar standing right next to it does not walk in place forever', () => {
  const rng = seeded(13);
  const spot = CAT_SPOTS.find((p) => p.id === 'pencere')!;
  let s: CatState = { x: spot.pos[0], z: spot.pos[2] + 3, facing: Math.PI, action: 'walk', targetId: 'pencere', timer: 0 };
  const avatar = { x: s.x + 0.4, z: s.z };
  const start = { x: s.x, z: s.z };
  let walkingInPlace = 0;
  for (let i = 0; i < 60 * 60; i++) {
    const before = { x: s.x, z: s.z };
    s = catStep(s, 1 / 60, { spots: CAT_SPOTS, avatar, rng });
    if (s.action === 'walk' && Math.hypot(s.x - before.x, s.z - before.z) < 1e-6) walkingInPlace++;
  }
  expect(walkingInPlace).toBeLessThan(60 * 5); // at most a few seconds of standing in "walk"
  expect(Math.hypot(s.x - start.x, s.z - start.z) > 0.5 || s.action !== 'walk').toBe(true);
});

test('cat only travels along clear edges and reaches every target without stalling', () => {
  for (const [a, b] of CAT_EDGES) {
    const rng = seeded(17);
    const from = CAT_SPOTS.find((p) => p.id === a)!;
    let s: CatState = { x: from.pos[0], z: from.pos[2], facing: 0, action: 'walk', targetId: b, timer: 0 };
    for (let i = 0; i < 60 * 60 && s.action === 'walk' && s.targetId === b; i++)
      s = catStep(s, 1 / 60, { spots: CAT_SPOTS, avatar: far, rng });
    expect(s.targetId, `${a}→${b}`).toBe(b);
    expect(s.action, `${a}→${b}`).not.toBe('walk');
  }
});

test('cat picks its next target among neighbours of its current spot', () => {
  const rng = seeded(19);
  let s = initialCat(CAT_SPOTS, rng);
  for (let k = 0; k < 30; k++) {
    const here = s.targetId!;
    while (s.action !== 'walk') s = catStep(s, 1, { spots: CAT_SPOTS, avatar: far, rng });
    const ok = CAT_EDGES.some(([a, b]) => (a === here && b === s.targetId) || (b === here && a === s.targetId));
    expect(ok, `${here}→${s.targetId}`).toBe(true);
    while (s.action === 'walk') s = catStep(s, 1 / 30, { spots: CAT_SPOTS, avatar: far, rng });
  }
});
