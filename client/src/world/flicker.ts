function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 1D value noise in [-1, 1]. */
function valueNoise(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return (hash(i) * (1 - u) + hash(i + 1) * u) * 2 - 1;
}

/** Fire brightness multiplier in [0.75, 1]: continuous, irregular. */
export function flicker(t: number, seed = 0): number {
  const n =
    Math.sin(7.3 * t + seed) +
    0.6 * Math.sin(13.1 * t + 1.7 + seed) +
    0.8 * Math.sin(2.9 * t + 0.4 + seed) +
    1.2 * valueNoise(t * 3 + seed * 17);
  return 0.875 + 0.125 * (n / 3.6);
}

/** Stove-fire colour for a flicker value in [0.75, 1]: deep orange when dim, yellower when bright. */
export function fireColor(f: number): { r: number; g: number; b: number } {
  const k = Math.min(1, Math.max(0, (f - 0.75) / 0.25));
  return { r: 1, g: 0.32 + 0.3 * k, b: 0.06 + 0.08 * k };
}
