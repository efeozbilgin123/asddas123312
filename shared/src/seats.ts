import { resolveCircle } from './collision';
import { AVATAR_RADIUS, type AvatarState } from './controller';
import { seatApproach, type Box2, type Seat } from './layout';

/**
 * Closest free seat within `radius`. Distance is to the seat itself; game chairs (which face a
 * table and are approached from behind) also count their approach point.
 */
export function nearestSeat(pos: { x: number; z: number }, seats: readonly Seat[], occupied: ReadonlySet<string>, radius = 1.2): Seat | null {
  let best: Seat | null = null;
  let bestD = radius;
  for (const seat of seats) {
    if (occupied.has(seat.id)) continue;
    let d = Math.hypot(pos.x - seat.pos[0], pos.z - seat.pos[2]);
    if (seat.kind === 'chair') {
      const a = seatApproach(seat);
      d = Math.min(d, Math.hypot(pos.x - a.x, pos.z - a.z));
    }
    if (d <= bestD) {
      best = seat;
      bestD = d;
    }
  }
  return best;
}

export function sitDown(s: AvatarState, seat: Seat): AvatarState {
  return { ...s, x: seat.pos[0], z: seat.pos[2], facing: seat.facingY, speed: 0, mode: 'sit', seatId: seat.id };
}

export function standUp(s: AvatarState, seat: Seat, boxes: readonly Box2[]): AvatarState {
  const p = resolveCircle(seatApproach(seat), AVATAR_RADIUS, boxes);
  return { ...s, x: p.x, z: p.z, speed: 0, mode: 'walk', seatId: null };
}
