export interface Snap { x: number; z: number; facing: number; speed: number }

const DELAY_MS = 100;
const MAX_KEEP = 20;

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Buffers timestamped snapshots and samples them 100 ms in the past (no extrapolation). */
export class SnapshotBuffer {
  private readonly snaps: { t: number; s: Snap }[] = [];

  push(t: number, s: Snap): void {
    this.snaps.push({ t, s: { ...s } });
    if (this.snaps.length > MAX_KEEP) this.snaps.shift();
  }

  sample(now: number): Snap | null {
    const n = this.snaps.length;
    if (n === 0) return null;
    const rt = now - DELAY_MS;
    if (rt <= this.snaps[0]!.t) return { ...this.snaps[0]!.s };
    for (let i = n - 1; i > 0; i--) {
      const a = this.snaps[i - 1]!;
      const b = this.snaps[i]!;
      if (rt >= a.t && rt <= b.t) {
        const k = b.t === a.t ? 1 : (rt - a.t) / (b.t - a.t);
        return {
          x: a.s.x + (b.s.x - a.s.x) * k,
          z: a.s.z + (b.s.z - a.s.z) * k,
          facing: lerpAngle(a.s.facing, b.s.facing, k),
          speed: a.s.speed + (b.s.speed - a.s.speed) * k
        };
      }
    }
    return { ...this.snaps[n - 1]!.s }; // starved: hold the newest
  }
}
