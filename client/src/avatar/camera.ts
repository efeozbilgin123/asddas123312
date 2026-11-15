import type { Box2 } from '../world/layout';

export interface V3 { x: number; y: number; z: number }
export interface RoomSize { width: number; depth: number; height: number }

const MARGIN = 0.15;
export const MIN_CAMERA_DISTANCE = 1.0;

/** Largest t ≥ 0 with origin + dir·t still inside the room's inner box. */
function maxInside(o: V3, d: V3, room: RoomSize): number {
  const lim = [
    [o.x, d.x, -room.width / 2 + MARGIN, room.width / 2 - MARGIN],
    [o.y, d.y, MARGIN, room.height - MARGIN],
    [o.z, d.z, -room.depth / 2 + MARGIN, room.depth / 2 - MARGIN]
  ] as const;
  let t = Infinity;
  for (const [p, v, lo, hi] of lim) {
    if (v > 1e-9) t = Math.min(t, (hi - p) / v);
    else if (v < -1e-9) t = Math.min(t, (lo - p) / v);
  }
  return Math.max(0, t);
}

/**
 * Third-person camera position. The camera orbits `target` at (sin yaw, cos yaw) horizontally,
 * raised by `pitch`. Pulled in to stay inside the room; never closer than 1 m — when a wall
 * is right behind, it rises above the target instead.
 */
export function followCamera(target: V3, yaw: number, pitch: number, distance: number, _boxes: readonly Box2[], room: RoomSize): V3 {
  const dir = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
  const t = Math.min(distance, maxInside(target, dir, room));
  if (t >= MIN_CAMERA_DISTANCE) return { x: target.x + dir.x * t, y: target.y + dir.y * t, z: target.z + dir.z * t };
  const hx = dir.x * t;
  const hz = dir.z * t;
  const h2 = hx * hx + hz * hz;
  const up = Math.sqrt(Math.max(0, MIN_CAMERA_DISTANCE ** 2 - h2));
  return { x: target.x + hx, y: Math.min(room.height - MARGIN, target.y + up), z: target.z + hz };
}
