import * as THREE from 'three';
import { isOkeyTile } from '../../shared/tiles.js';

const TILE_INK = {
  red: '#C8232C',
  blue: '#1658B8',
  black: '#1A2029',
  yellow: '#B87400'
};

const faceCache = new Map();
let cachedBackTexture = null;
let cachedWoodTexture = null;
let cachedFeltTexture = null;

export function getWoodTexture() {
  if (cachedWoodTexture) return cachedWoodTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#4A2B18';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 240; i += 1) {
    const y = (i / 240) * 512;
    const alpha = 0.04 + (i % 7) * 0.012;
    ctx.strokeStyle = i % 2 === 0 ? `rgba(26, 13, 6, ${alpha})` : `rgba(116, 72, 42, ${alpha})`;
    ctx.lineWidth = 1 + (i % 4);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(170, y + Math.sin(i * 0.3) * 8, 340, y - Math.cos(i * 0.25) * 8, 512, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedWoodTexture = tex;
  return tex;
}

export function getFeltTexture() {
  if (cachedFeltTexture) return cachedFeltTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(256, 256, 30, 256, 256, 360);
  grad.addColorStop(0, '#1D5E43');
  grad.addColorStop(1, '#144431');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Micro wool weave
  for (let i = 0; i < 6500; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.028)' : 'rgba(0,0,0,0.04)';
    ctx.fillRect(x, y, 2, 2);
  }

  // Subtle gold inner border ring
  ctx.strokeStyle = 'rgba(229, 198, 120, 0.22)';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, 464, 464);

  ctx.strokeStyle = 'rgba(229, 198, 120, 0.1)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(34, 34, 444, 444);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedFeltTexture = tex;
  return tex;
}

export function getTileBackTexture() {
  if (cachedBackTexture) return cachedBackTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#EAE2CF';
  ctx.fillRect(0, 0, 256, 360);

  // Subtle chamfer frame
  ctx.strokeStyle = '#D2C6AF';
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, 228, 332);

  // Subtle diamond stamp on back
  ctx.save();
  ctx.translate(128, 180);
  ctx.rotate(Math.PI / 4);
  ctx.strokeStyle = 'rgba(130, 114, 88, 0.22)';
  ctx.lineWidth = 4;
  ctx.strokeRect(-26, -26, 52, 52);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedBackTexture = tex;
  return tex;
}

export function getTileFaceTexture(tile, okeyTarget, options = {}) {
  const isOkey = isOkeyTile(tile, okeyTarget);
  const selected = Boolean(options.selected);
  const mustUse = Boolean(options.mustUse);
  const key = tile.isFakeOkey
    ? `fake-${selected}-${mustUse}`
    : `${tile.color}-${tile.number}-${isOkey}-${selected}-${mustUse}`;

  if (faceCache.has(key)) return faceCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');

  // Ivory ceramic surface
  const bg = ctx.createLinearGradient(0, 0, 0, 360);
  bg.addColorStop(0, selected ? '#FFF8D6' : '#FAF6EB');
  bg.addColorStop(1, selected ? '#F6E79C' : '#EFE7D4');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 360);

  // Crisp inner border
  ctx.strokeStyle = selected ? '#D4A516' : mustUse ? '#2563EB' : '#D8CEBA';
  ctx.lineWidth = selected || mustUse ? 10 : 6;
  ctx.strokeRect(10, 10, 236, 340);

  // Lower classic circular dimple (oyuk)
  const dimple = ctx.createRadialGradient(128, 256, 8, 128, 256, 46);
  dimple.addColorStop(0, '#DFD4BE');
  dimple.addColorStop(0.75, '#EAE0CC');
  dimple.addColorStop(1, 'rgba(239, 231, 212, 0)');
  ctx.fillStyle = dimple;
  ctx.beginPath();
  ctx.arc(128, 256, 46, 0, Math.PI * 2);
  ctx.fill();

  if (tile.isFakeOkey) {
    // Classic 4-petal star / clover emblem for Sahte Okey
    ctx.save();
    ctx.translate(128, 134);
    ctx.fillStyle = '#C8232C';
    for (let i = 0; i < 4; i += 1) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, -24, 15, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#1658B8';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#1A2029';
    ctx.font = '800 26px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SAHTE', 128, 265);
  } else {
    const ink = TILE_INK[tile.color] || '#1A2029';
    ctx.fillStyle = ink;
    ctx.font = '800 124px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(tile.number), 128, 126);

    // Small underline on 6 and 9 so orientation is unmistakable
    if (tile.number === 6 || tile.number === 9) {
      ctx.fillRect(92, 188, 72, 7);
    }

    // Center dot inside dimple
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(128, 256, 11, 0, Math.PI * 2);
    ctx.fill();
  }

  if (isOkey) {
    // Corner Okey crown badge
    ctx.fillStyle = '#146C43';
    ctx.beginPath();
    ctx.roundRect(22, 22, 62, 32, 8);
    ctx.fill();
    ctx.fillStyle = '#FAF6EB';
    ctx.font = '800 18px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OKEY', 53, 38);
  }

  if (mustUse) {
    ctx.fillStyle = '#1658B8';
    ctx.beginPath();
    ctx.roundRect(150, 22, 84, 32, 8);
    ctx.fill();
    ctx.fillStyle = '#FAF6EB';
    ctx.font = '700 17px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('KULLAN', 192, 38);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  faceCache.set(key, tex);
  return tex;
}
