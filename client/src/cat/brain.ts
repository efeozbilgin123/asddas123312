import { moveCircle } from '../avatar/collision';
import { COLLIDERS, type CatSpot } from '../world/layout';

export interface CatState {
  x: number;
  z: number;
  facing: number;
  action: 'sleep' | 'sit' | 'walk' | 'groom';
  targetId: string | null;
  /** Seconds left resting; while walking, seconds without progress. */
  timer: number;
}

export interface CatContext {
  spots: readonly CatSpot[];
  avatar: { x: number; z: number };
  rng: () => number;
}

const SPEED = 0.5;
const RADIUS = 0.15;
const ARRIVE = 0.05;
const AVOID = 0.6;
const LOOKAHEAD = 1;
const STUCK_AFTER = 3;

const between = (rng: () => number, a: number, b: number) => a + rng() * (b - a);

function restFor(spot: CatSpot, rng: () => number): Pick<CatState, 'action' | 'timer'> {
  if (spot.kind === 'sleep') return { action: 'sleep', timer: between(rng, 20, 60) };
  return { action: rng() < 0.5 ? 'sit' : 'groom', timer: between(rng, 8, 20) };
}

/** Sleep spots (near the stove) are twice as likely. */
function pickSpot(spots: readonly CatSpot[], rng: () => number, exclude: ReadonlySet<string>): CatSpot {
  const options = spots.filter((s) => !exclude.has(s.id));
  const pool = options.length ? options : [...spots];
  const weights = pool.map((s) => (s.kind === 'sleep' ? 2 : 1));
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}

export function initialCat(spots: readonly CatSpot[], rng: () => number): CatState {
  const spot = spots.find((s) => s.kind === 'sleep') ?? spots[0]!;
  return { x: spot.pos[0], z: spot.pos[2], facing: rng() * Math.PI * 2, targetId: spot.id, ...restFor(spot, rng) };
}

function pathBlocked(s: CatState, target: CatSpot, avatar: { x: number; z: number }): boolean {
  const dx = target.pos[0] - s.x;
  const dz = target.pos[2] - s.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return false;
  const reach = Math.min(LOOKAHEAD, len);
  for (let t = 0; t <= reach; t += 0.1) {
    const px = s.x + (dx / len) * t;
    const pz = s.z + (dz / len) * t;
    if (Math.hypot(px - avatar.x, pz - avatar.z) < AVOID) return true;
  }
  return false;
}

export function catStep(s: CatState, dt: number, ctx: CatContext): CatState {
  const { spots, avatar, rng } = ctx;
  if (s.action !== 'walk') {
    const timer = s.timer - dt;
    if (timer > 0) return { ...s, timer };
    const next = pickSpot(spots, rng, new Set(s.targetId ? [s.targetId] : []));
    return { ...s, action: 'walk', targetId: next.id, timer: 0 };
  }

  let target = spots.find((p) => p.id === s.targetId) ?? pickSpot(spots, rng, new Set());
  if (pathBlocked(s, target, avatar)) {
    target = pickSpot(spots, rng, new Set([target.id]));
    return { ...s, targetId: target.id, timer: 0 };
  }

  let remaining = SPEED * Math.min(dt, 0.5);
  let { x, z } = s;
  let facing = s.facing;
  while (remaining > 1e-9) {
    const dx = target.pos[0] - x;
    const dz = target.pos[2] - z;
    const dist = Math.hypot(dx, dz);
    if (dist <= ARRIVE) {
      return { x: target.pos[0], z: target.pos[2], facing, targetId: target.id, ...restFor(target, rng) };
    }
    const move = Math.min(remaining, dist, 0.1);
    facing = Math.atan2(dx, dz);
    const p = moveCircle({ x, z }, { x: x + (dx / dist) * move, z: z + (dz / dist) * move }, RADIUS, COLLIDERS);
    x = p.x;
    z = p.z;
    remaining -= move;
  }
  const progressed = Math.hypot(x - s.x, z - s.z) > SPEED * Math.min(dt, 0.5) * 0.3;
  const timer = progressed ? 0 : s.timer + dt;
  if (timer > STUCK_AFTER) {
    const next = pickSpot(spots, rng, new Set([target.id]));
    return { ...s, x, z, facing, targetId: next.id, timer: 0 };
  }
  return { ...s, x, z, facing, timer };
}
