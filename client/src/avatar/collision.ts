import type { Box2 } from '../world/layout';

export interface P2 { x: number; z: number }

function pushOut(p: P2, r: number, b: Box2): P2 {
  const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return p;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    return { x: cx + (dx / d) * r, z: cz + (dz / d) * r };
  }
  // Center inside the box: exit through the nearest side.
  const exits = [
    { d: p.x - b.minX, x: b.minX - r, z: p.z },
    { d: b.maxX - p.x, x: b.maxX + r, z: p.z },
    { d: p.z - b.minZ, x: p.x, z: b.minZ - r },
    { d: b.maxZ - p.z, x: p.x, z: b.maxZ + r }
  ];
  exits.sort((a, c) => a.d - c.d);
  return { x: exits[0]!.x, z: exits[0]!.z };
}

/** Pushes a circle out of every box (a few passes so corners settle). */
export function resolveCircle(pos: P2, radius: number, boxes: readonly Box2[]): P2 {
  let p = pos;
  for (let pass = 0; pass < 4; pass++) {
    const before = p;
    for (const b of boxes) p = pushOut(p, radius, b);
    if (p.x === before.x && p.z === before.z) break;
  }
  return p;
}
