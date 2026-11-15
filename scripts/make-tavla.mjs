// Renders a top-down backgammon (tavla) board texture to client/public/assets/decor/tavla.jpg.
import { createCanvas } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 1024;
const H = 780;
const c = createCanvas(W, H);
const g = c.getContext('2d');

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function wood(x, y, w, h, base, dark) {
  g.fillStyle = base;
  g.fillRect(x, y, w, h);
  for (let i = 0; i < 160; i++) {
    g.strokeStyle = `rgba(${dark},${0.05 + rnd() * 0.12})`;
    g.lineWidth = 1 + rnd() * 2;
    const yy = y + rnd() * h;
    g.beginPath();
    g.moveTo(x, yy);
    for (let xx = x; xx <= x + w; xx += 24) g.lineTo(xx, yy + Math.sin(xx * 0.02 + i) * 2);
    g.stroke();
  }
}

// frame and the two playing fields
wood(0, 0, W, H, '#4a2a16', '20,8,2');
const fx = 46, fy = 46, bar = 40;
const fieldW = (W - fx * 2 - bar) / 2;
const fieldH = H - fy * 2;
wood(fx, fy, fieldW, fieldH, '#c9a46c', '90,50,20');
wood(fx + fieldW + bar, fy, fieldW, fieldH, '#c9a46c', '90,50,20');

// 24 points
const pw = fieldW / 6;
const ph = fieldH * 0.42;
for (let side = 0; side < 2; side++) {
  const ox = fx + side * (fieldW + bar);
  for (let i = 0; i < 6; i++) {
    for (const top of [true, false]) {
      const x = ox + i * pw;
      g.fillStyle = (i + (top ? 0 : 1)) % 2 ? '#8e1b1b' : '#eadcbc';
      g.beginPath();
      if (top) {
        g.moveTo(x + 3, fy);
        g.lineTo(x + pw - 3, fy);
        g.lineTo(x + pw / 2, fy + ph);
      } else {
        g.moveTo(x + 3, fy + fieldH);
        g.lineTo(x + pw - 3, fy + fieldH);
        g.lineTo(x + pw / 2, fy + fieldH - ph);
      }
      g.fill();
    }
  }
}

// checkers in the opening position (point index 0..23, counted from bottom-right)
const r = pw * 0.42;
function pointXY(p, k) {
  const bottom = p < 12;
  const idx = bottom ? 11 - p : p - 12; // 0..11 left→right
  const side = idx < 6 ? 0 : 1;
  const x = fx + side * (fieldW + bar) + (idx % 6) * pw + pw / 2;
  const y = bottom ? fy + fieldH - r - k * r * 2 : fy + r + k * r * 2;
  return [x, y];
}
function checker(x, y, light) {
  const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  grd.addColorStop(0, light ? '#fbf4e4' : '#4a4a4a');
  grd.addColorStop(1, light ? '#cdbf9f' : '#141414');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = light ? '#9b8b6b' : '#000';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(x, y, r * 0.62, 0, Math.PI * 2);
  g.stroke();
}
const opening = [[0, 2, false], [11, 5, true], [16, 3, true], [18, 5, true], [23, 2, true], [12, 5, false], [7, 3, false], [5, 5, false]];
for (const [p, n, light] of opening) for (let k = 0; k < n; k++) checker(...pointXY(p, k), light);

// two dice on the bar side
for (const [x, y, pips] of [[W * 0.62, H * 0.5, 5], [W * 0.68, H * 0.47, 3]]) {
  g.fillStyle = '#f4efe4';
  g.beginPath();
  g.roundRect(x - 22, y - 22, 44, 44, 8);
  g.fill();
  g.fillStyle = '#7a1414';
  const spots = { 3: [[-10, -10], [0, 0], [10, 10]], 5: [[-10, -10], [10, -10], [0, 0], [-10, 10], [10, 10]] }[pips];
  for (const [dx, dy] of spots) {
    g.beginPath();
    g.arc(x + dx, y + dy, 4.5, 0, Math.PI * 2);
    g.fill();
  }
}

const out = path.join(root, 'client/public/assets/decor/tavla.jpg');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, await c.encode('jpeg', 88));
console.log('wrote', out);
