import type { Box2 } from './layout';
import { moveCircle } from './collision';

export interface MoveInput { x: number; z: number; run: boolean }

export interface AvatarState {
  x: number;
  z: number;
  /** Yaw: the avatar looks along (sin facing, cos facing). */
  facing: number;
  speed: number;
  mode: 'walk' | 'sit';
  seatId: string | null;
}

export const WALK_SPEED = 1.6;
export const RUN_SPEED = 3.2;
export const AVATAR_RADIUS = 0.3;
const ACCEL = 8;
/** rad/s — a full about-face takes ~0.45 s. */
const TURN_RATE = 7;
const MAX_DT = 0.05;
const MAX_MOVE = 0.1;

function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function step(s: AvatarState, input: MoveInput, dt: number, boxes: readonly Box2[]): AvatarState {
  if (s.mode === 'sit') return s;
  dt = Math.min(Math.max(dt, 0), MAX_DT);
  const len = Math.hypot(input.x, input.z);
  const hasInput = len > 1e-3;
  // Turn toward the wanted direction first; the avatar always moves where it faces.
  let facing = s.facing;
  let align = 1;
  if (hasInput) {
    const want = Math.atan2(input.x / len, input.z / len);
    const d = angleDelta(facing, want);
    facing += Math.sign(d) * Math.min(Math.abs(d), TURN_RATE * dt);
    // slow down while the wanted direction is far behind (sharp turns), full speed when aligned
    align = Math.min(1, Math.max(0, (Math.cos(angleDelta(facing, want)) + 0.2) / 1.2));
  }
  const target = hasInput ? (input.run ? RUN_SPEED : WALK_SPEED) * Math.min(1, len) * align : 0;
  const dv = target - s.speed;
  const speed = s.speed + Math.sign(dv) * Math.min(Math.abs(dv), ACCEL * dt);
  const dir = { x: Math.sin(facing), z: Math.cos(facing) };

  const dist = speed * dt;
  const steps = Math.max(1, Math.ceil(dist / MAX_MOVE));
  let p = { x: s.x, z: s.z };
  for (let i = 0; i < steps; i++) {
    p = moveCircle(p, { x: p.x + (dir.x * dist) / steps, z: p.z + (dir.z * dist) / steps }, AVATAR_RADIUS, boxes);
  }
  return { ...s, x: p.x, z: p.z, facing, speed };
}
