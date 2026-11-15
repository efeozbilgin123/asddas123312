// Renders a traditional Anatolian-style kilim texture (3:2) to client/public/assets/rug/kilim_2k.jpg.
import { createCanvas } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 2048;
const H = 1366;
const C = {
  red: '#8e1b1b',
  redDark: '#5c1010',
  indigo: '#1f2c55',
  ochre: '#c48f2c',
  cream: '#eadcbc',
  brown: '#38190f',
  green: '#3d5a3a'
};

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const canvas = createCanvas(W, H);
const g = canvas.getContext('2d');

// Field
g.fillStyle = C.red;
g.fillRect(0, 0, W, H);

// Stepped (pixel-woven) diamond: kilims are woven on a grid, so motifs are built from cells.
const CELL = 8;
function steppedDiamond(cx, cy, rx, ry, color) {
  g.fillStyle = color;
  const rows = Math.round(ry / CELL);
  for (let r = -rows; r <= rows; r++) {
    const half = Math.round((rx / CELL) * (1 - Math.abs(r) / rows));
    g.fillRect(cx - half * CELL, cy + r * CELL, (half * 2 + 1) * CELL, CELL);
  }
}
function hooks(cx, cy, rx, ry, color) {
  // "Elibelinde"-like hooks on the four diamond tips
  g.fillStyle = color;
  const s = CELL * 3;
  for (const [dx, dy] of [[rx, 0], [-rx, 0], [0, ry], [0, -ry]]) {
    const x = cx + dx;
    const y = cy + dy;
    g.fillRect(x - s / 2, y - s / 2, s, s);
    g.fillRect(x + (dx >= 0 ? s / 2 : -s * 1.5), y - s * 1.5, s, s);
    g.fillRect(x + (dx >= 0 ? s / 2 : -s * 1.5), y + s / 2, s, s);
  }
}
function medallion(cx, cy, scale) {
  steppedDiamond(cx, cy, 300 * scale, 260 * scale, C.brown);
  steppedDiamond(cx, cy, 270 * scale, 232 * scale, C.indigo);
  steppedDiamond(cx, cy, 210 * scale, 180 * scale, C.cream);
  steppedDiamond(cx, cy, 170 * scale, 145 * scale, C.ochre);
  steppedDiamond(cx, cy, 110 * scale, 95 * scale, C.redDark);
  steppedDiamond(cx, cy, 55 * scale, 48 * scale, C.cream);
  steppedDiamond(cx, cy, 22 * scale, 20 * scale, C.indigo);
  hooks(cx, cy, 300 * scale, 260 * scale, C.indigo);
}

// Inner field: a band of 3 medallions along the long axis
const fieldX0 = 230;
const fieldX1 = W - 230;
const cy = H / 2;
const step = (fieldX1 - fieldX0) / 3;
for (let i = 0; i < 3; i++) medallion(fieldX0 + step * (i + 0.5), cy, i === 1 ? 1.08 : 0.9);

// Small scattered motifs (star/göz) in the gaps
for (let i = 0; i < 40; i++) {
  const x = fieldX0 + 60 + rnd() * (fieldX1 - fieldX0 - 120);
  const y = 230 + rnd() * (H - 460);
  const nearMedallion = Math.abs(y - cy) < 300 && [0, 1, 2].some((k) => Math.abs(x - (fieldX0 + step * (k + 0.5))) < 340);
  if (nearMedallion) continue;
  const col = [C.cream, C.ochre, C.indigo, C.green][i % 4];
  steppedDiamond(Math.round(x / CELL) * CELL, Math.round(y / CELL) * CELL, 28, 28, col);
  steppedDiamond(Math.round(x / CELL) * CELL, Math.round(y / CELL) * CELL, 10, 10, C.redDark);
}

// Borders: outer dark band, zig-zag (running dog) band, inner thin bands
function band(inset, width, color) {
  g.fillStyle = color;
  g.fillRect(inset, inset, W - inset * 2, width);
  g.fillRect(inset, H - inset - width, W - inset * 2, width);
  g.fillRect(inset, inset, width, H - inset * 2);
  g.fillRect(W - inset - width, inset, width, H - inset * 2);
}
band(0, 110, C.brown);
band(110, 90, C.cream);
// zig-zag inside the cream band
g.fillStyle = C.red;
const zz = 48;
for (let x = 200; x < W - 200 - zz / 2; x += zz) {
  for (const y of [110, H - 200]) {
    steppedDiamond(x + zz / 2, y + 45, zz / 2, 32, (x / zz) % 2 < 1 ? C.red : C.indigo);
  }
}
for (let y = 200; y < H - 200 - zz / 2; y += zz) {
  for (const x of [110, W - 200]) {
    steppedDiamond(x + 45, y + zz / 2, 32, zz / 2, (y / zz) % 2 < 1 ? C.red : C.indigo);
  }
}
band(200, 16, C.ochre);
band(216, 10, C.brown);

// Woven texture: abrash (dye variation) stripes + weft lines + noise
const img = g.getImageData(0, 0, W, H);
const d = img.data;
const rowShade = new Float32Array(H);
let shade = 0;
for (let y = 0; y < H; y++) {
  if (rnd() < 0.01) shade = (rnd() - 0.5) * 0.12; // abrash bands
  rowShade[y] = shade + (y % 4 < 2 ? 0.04 : -0.04);
}
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const k = 1 + rowShade[y] + (rnd() - 0.5) * 0.08 + (x % 6 < 3 ? 0.015 : -0.015);
    d[i] = Math.max(0, Math.min(255, d[i] * k));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] * k));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] * k));
  }
}
g.putImageData(img, 0, 0);

// Fringe on the short ends
g.strokeStyle = C.cream;
for (let y = 46; y < H - 46; y += 7) {
  for (const [x0, x1] of [[0, 40], [W - 40, W]]) {
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x0, y + (rnd() - 0.5) * 3);
    g.lineTo(x1, y + (rnd() - 0.5) * 3);
    g.stroke();
  }
}

const out = path.join(root, 'client/public/assets/rug/kilim_2k.jpg');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, await canvas.encode('jpeg', 88));
console.log('wrote', out);
