import { moveCircle } from './collision';
import { CAT_EDGES, COLLIDERS, type CatSpot } from './layout';

export interface CatState {
  x: number;
  z: number;
  facing: number;
  action: 'sleep' | 'sit' | 'walk' | 'groom';
  /** While resting: the spot it rests at. While walking: where it is going. */
  targetId: string | null;
  /** The spot it last left (walking back there is always clear). */
  fromId?: string | null;
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
/** Look this far ahead (starting past the cat's own body) for the avatar. */
const LOOK_FROM = 0.35;
const LOOK_TO = 1;
const STUCK_AFTER = 3;

const between = (rng: () => number, a: number, b: number) => a + rng() * (b - a);

function restFor(spot: CatSpot, rng: () => number): Pick<CatState, 'action' | 'timer'> {
  if (spot.kind === 'sleep') return { action: 'sleep', timer: between(rng, 20, 60) };
  return { action: rng() < 0.5 ? 'sit' : 'groom', timer: between(rng, 8, 20) };
}

function neighbours(id: string | null, spots: readonly CatSpot[]): CatSpot[] {
  const ids = new Set(CAT_EDGES.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : [])));
  return spots.filter((s) => ids.has(s.id));
}

/** A neighbour of `fromId`; sleep spots (near the stove) are twice as likely. */
function pickNext(spots: readonly CatSpot[], fromId: string | null, rng: () => number): CatSpot {
  const pool = neighbours(fromId, spots);
  if (pool.length === 0) return spots.find((s) => s.id === fromId) ?? spots[0]!;
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
  return { x: spot.pos[0], z: spot.pos[2], facing: rng() * Math.PI * 2, targetId: spot.id, fromId: null, ...restFor(spot, rng) };
}

function blockedToward(s: CatState, target: CatSpot, avatar: { x: number; z: number }): boolean {
  const dx = target.pos[0] - s.x;
  const dz = target.pos[2] - s.z;
  const len = Math.hypot(dx, dz);
  if (len < LOOK_FROM) return false;
  for (let t = LOOK_FROM; t <= Math.min(LOOK_TO, len); t += 0.05) {
    if (Math.hypot(s.x + (dx / len) * t - avatar.x, s.z + (dz / len) * t - avatar.z) < AVOID) return true;
  }
  return false;
}

export function catStep(s: CatState, dt: number, ctx: CatContext): CatState {
  const { spots, avatar, rng } = ctx;
  const spot = (id: string | null | undefined) => spots.find((p) => p.id === id);

  if (s.action !== 'walk') {
    const timer = s.timer - dt;
    if (timer > 0) return { ...s, timer };
    // A cat that paused mid-path resumes toward its target; a resting cat picks a neighbour.
    const atTarget = spot(s.targetId) && Math.hypot(spot(s.targetId)!.pos[0] - s.x, spot(s.targetId)!.pos[2] - s.z) <= ARRIVE;
    if (!atTarget && s.targetId) return { ...s, action: 'walk', timer: 0 };
    const next = pickNext(spots, s.targetId, rng);
    return { ...s, action: 'walk', fromId: s.targetId, targetId: next.id, timer: 0 };
  }

  const target = spot(s.targetId) ?? pickNext(spots, s.fromId ?? null, rng);
  if (blockedToward(s, target, avatar)) {
    const back = spot(s.fromId);
    if (back && back.id !== target.id && !blockedToward(s, back, avatar)) {
      return { ...s, targetId: back.id, fromId: target.id, timer: 0 }; // turn around
    }
    return { ...s, action: 'sit', timer: between(rng, 2, 4) }; // wait for the avatar to pass
  }

  let remaining = SPEED * Math.min(dt, 0.5);
  let { x, z } = s;
  let facing = s.facing;
  while (remaining > 1e-9) {
    const dx = target.pos[0] - x;
    const dz = target.pos[2] - z;
    const dist = Math.hypot(dx, dz);
    if (dist <= ARRIVE) {
      return { x: target.pos[0], z: target.pos[2], facing, targetId: target.id, fromId: s.fromId ?? null, ...restFor(target, rng) };
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
  if (timer > STUCK_AFTER && s.fromId) {
    return { ...s, x, z, facing, targetId: s.fromId, fromId: target.id, timer: 0 }; // safety: go back
  }
  return { ...s, x, z, facing, timer };
}
