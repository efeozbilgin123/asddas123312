import * as THREE from 'three';
import { isOkeyTile } from '../../shared/tiles.js';

const TILE_INK = {
  red: '#C8222B',
  blue: '#1658B8',
  black: '#191F28',
  yellow: '#B87200'
};

const faceCache = new Map();
const avatarCache = new Map();
let cachedBackTexture = null;
let cachedWoodTexture = null;
let cachedFeltTexture = null;
let cachedBackdropTexture = null;

const textureLoader = new THREE.TextureLoader();

export function getWoodTexture() {
  if (cachedWoodTexture) return cachedWoodTexture;

  const tex = textureLoader.load('/assets/wood_walnut.jpg', (loaded) => {
    loaded.needsUpdate = true;
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cachedWoodTexture = tex;
  return tex;
}

export function getKahveBackdropTexture() {
  if (cachedBackdropTexture) return cachedBackdropTexture;
  const tex = textureLoader.load('/assets/kahve_backdrop.jpg', (loaded) => {
    loaded.needsUpdate = true;
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedBackdropTexture = tex;
  return tex;
}

export function getAvatarTexture(avatarId = 'avatar-1') {
  const raw = String(avatarId || '').trim();
  const isDataUrl = /^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(raw);
  const key = isDataUrl
    ? raw
    : /^avatar-[1-6]$/.test(raw)
      ? raw
      : 'avatar-1';

  if (avatarCache.has(key)) return avatarCache.get(key);

  const src = isDataUrl ? key : `/assets/${key}.jpg`;
  const tex = textureLoader.load(src, (loaded) => {
    loaded.needsUpdate = true;
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  avatarCache.set(key, tex);
  return tex;
}

export function getFeltTexture() {
  if (cachedFeltTexture) return cachedFeltTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(384, 384, 40, 384, 384, 540);
  grad.addColorStop(0, '#1D5E43');
  grad.addColorStop(0.65, '#154B35');
  grad.addColorStop(1, '#0E3425');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 768, 768);

  // Fine woven baize felt texture
  for (let i = 0; i < 14000; i += 1) {
    const x = Math.random() * 768;
    const y = Math.random() * 768;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.045)';
    ctx.fillRect(x, y, 2, 2);
  }

  // Subtle classic brass border inlay on felt
  ctx.strokeStyle = 'rgba(229, 198, 120, 0.24)';
  ctx.lineWidth = 4;
  ctx.strokeRect(32, 32, 704, 704);

  ctx.strokeStyle = 'rgba(229, 198, 120, 0.1)';
  ctx.lineWidth = 2;
  ctx.strokeRect(46, 46, 676, 676);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cachedFeltTexture = tex;
  return tex;
}

export function getTileBackTexture() {
  if (cachedBackTexture) return cachedBackTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 256, 360);
  bg.addColorStop(0, '#EEE6D4');
  bg.addColorStop(1, '#E1D5BD');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 360);

  // Soft chamfer frame
  ctx.strokeStyle = '#CFC1A5';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(16, 16, 224, 328, 14);
  ctx.stroke();

  // Subtle classic ornamental rosette on back
  ctx.save();
  ctx.translate(128, 180);
  ctx.rotate(Math.PI / 4);
  ctx.strokeStyle = 'rgba(130, 112, 82, 0.22)';
  ctx.lineWidth = 3;
  ctx.strokeRect(-26, -26, 52, 52);
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedBackTexture = tex;
  return tex;
}

function drawCrownEmblem(ctx, cx, cy, size, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-size * 0.5, size * 0.35);
  ctx.lineTo(-size * 0.55, -size * 0.25);
  ctx.lineTo(-size * 0.22, size * 0.05);
  ctx.lineTo(0, -size * 0.42);
  ctx.lineTo(size * 0.22, size * 0.05);
  ctx.lineTo(size * 0.55, -size * 0.25);
  ctx.lineTo(size * 0.5, size * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function getTileFaceTexture(tile, okeyTarget, options = {}) {
  const isOkey = isOkeyTile(tile, okeyTarget);
  const selected = Boolean(options.selected);
  const mustUse = Boolean(options.mustUse);
  const key = tile.isFakeOkey
    ? `fake-v2-${selected}-${mustUse}`
    : `v2-${tile.color}-${tile.number}-${isOkey}-${selected}-${mustUse}`;

  if (faceCache.has(key)) return faceCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 450;
  const ctx = canvas.getContext('2d');

  // Warm bone/melamine ceramic surface
  const bg = ctx.createLinearGradient(0, 0, 20, 450);
  if (selected) {
    bg.addColorStop(0, '#FFF8D6');
    bg.addColorStop(1, '#F5E39B');
  } else if (isOkey) {
    bg.addColorStop(0, '#FFFDF3');
    bg.addColorStop(1, '#F3E8C8');
  } else {
    bg.addColorStop(0, '#FCF8EE');
    bg.addColorStop(1, '#EFE6D1');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 320, 450);

  // Crisp subtle inner border
  ctx.strokeStyle = selected
    ? '#D4A017'
    : mustUse
      ? '#2563EB'
      : isOkey
        ? '#C5962C'
        : '#DDD2BC';
  ctx.lineWidth = selected || mustUse ? 11 : isOkey ? 8 : 5;
  ctx.beginPath();
  ctx.roundRect(14, 14, 292, 422, 16);
  ctx.stroke();

  if (isOkey) {
    // Delicate secondary gold filigree inset
    ctx.strokeStyle = 'rgba(197, 150, 44, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(24, 24, 272, 402, 12);
    ctx.stroke();
  }

  // Sculpted lower circular dimple (oyuk)
  const dimpleShadow = ctx.createRadialGradient(160, 322, 8, 160, 322, 56);
  dimpleShadow.addColorStop(0, '#DDD0B8');
  dimpleShadow.addColorStop(0.68, '#EAE0CB');
  dimpleShadow.addColorStop(0.92, '#F7F1E2');
  dimpleShadow.addColorStop(1, 'rgba(239, 230, 209, 0)');
  ctx.fillStyle = dimpleShadow;
  ctx.beginPath();
  ctx.arc(160, 322, 56, 0, Math.PI * 2);
  ctx.fill();

  if (tile.isFakeOkey) {
    // Classic aesthetic Joker / Sahte Okey rosette crest WITHOUT any "SAHTE" text
    ctx.save();
    ctx.translate(160, 170);

    // Outer golden halo ring
    ctx.strokeStyle = '#C5962C';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 68, 0, Math.PI * 2);
    ctx.stroke();

    // 8-point geometric rosette
    for (let i = 0; i < 8; i += 1) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 4);
      ctx.fillStyle = i % 2 === 0 ? '#C8222B' : '#1658B8';
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.quadraticCurveTo(16, -34, 0, -56);
      ctx.quadraticCurveTo(-16, -34, 0, -14);
      ctx.fill();
      ctx.restore();
    }

    // Center gold jewel
    ctx.fillStyle = '#EAB308';
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FCF8EE';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Ornamental crescent-star inside dimple (no text!)
    ctx.save();
    ctx.translate(160, 322);
    ctx.fillStyle = '#C5962C';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    const ink = TILE_INK[tile.color] || '#191F28';
    ctx.fillStyle = ink;
    ctx.font = '800 156px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(tile.number), 160, 162);

    // Crisp underline on 6 and 9
    if (tile.number === 6 || tile.number === 9) {
      ctx.fillRect(114, 238, 92, 9);
    }

    // Center jewel dot inside dimple
    ctx.fillStyle = isOkey ? '#C5962C' : ink;
    ctx.beginPath();
    ctx.arc(160, 322, isOkey ? 15 : 13, 0, Math.PI * 2);
    ctx.fill();

    if (isOkey) {
      ctx.fillStyle = '#146C43';
      ctx.beginPath();
      ctx.arc(160, 322, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (isOkey) {
    // Subtle corner gold crown emblem instead of boxy text badge
    drawCrownEmblem(ctx, 56, 54, 34, '#C5962C');
    drawCrownEmblem(ctx, 264, 54, 24, '#C5962C');
  }

  if (mustUse) {
    ctx.fillStyle = '#1658B8';
    ctx.beginPath();
    ctx.roundRect(184, 30, 104, 36, 10);
    ctx.fill();
    ctx.fillStyle = '#FCF8EE';
    ctx.font = '700 19px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('KULLAN', 236, 48);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  faceCache.set(key, tex);
  return tex;
}

export function createNameplateTexture(name, { isActive = false, opened = false, teamIndex = 0, teamMode = 'solo' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 512, 128);

  // Dark translucent pill card
  ctx.fillStyle = isActive ? 'rgba(38, 28, 14, 0.94)' : 'rgba(22, 18, 15, 0.88)';
  ctx.beginPath();
  ctx.roundRect(24, 18, 464, 92, 46);
  ctx.fill();

  const teamColor = teamMode === 'paired'
    ? teamIndex === 0
      ? '#F4C44E'
      : '#56B4E9'
    : '#9C8B7A';

  ctx.strokeStyle = isActive ? '#F4C44E' : teamMode === 'paired' ? teamColor : 'rgba(255, 236, 200, 0.28)';
  ctx.lineWidth = isActive ? 6 : 3;
  ctx.beginPath();
  ctx.roundRect(24, 18, 464, 92, 46);
  ctx.stroke();

  if (teamMode === 'paired') {
    ctx.fillStyle = teamColor;
    ctx.beginPath();
    ctx.arc(64, 64, 11, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = isActive ? '#FFEAA7' : '#F8F2E8';
  ctx.font = '700 38px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cleanName = String(name || 'Oyuncu').slice(0, 18);
  ctx.fillText(cleanName, 256, 65);

  if (opened) {
    ctx.fillStyle = '#34D399';
    ctx.beginPath();
    ctx.arc(444, 64, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const interiorCache = new Map();

export function getParquetTexture() {
  if (interiorCache.has('parquet')) return interiorCache.get('parquet');
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#3B2316';
  ctx.fillRect(0, 0, 512, 512);

  const plankW = 128;
  const plankH = 64;
  for (let row = 0; row < 8; row += 1) {
    const offset = (row % 2) * (plankW / 2);
    for (let col = -1; col < 5; col += 1) {
      const x = col * plankW + offset;
      const y = row * plankH;
      const tone = ((row * 7 + col * 11) & 3);
      const shades = ['#472B1B', '#3E2517', '#4F311F', '#372013'];
      ctx.fillStyle = shades[tone];
      ctx.fillRect(x + 2, y + 2, plankW - 4, plankH - 4);

      // Fine wood grain lines per plank
      ctx.strokeStyle = 'rgba(20, 10, 5, 0.28)';
      ctx.lineWidth = 1.5;
      for (let g = 0; g < 4; g += 1) {
        const gy = y + 10 + g * 14;
        ctx.beginPath();
        ctx.moveTo(x + 4, gy);
        ctx.bezierCurveTo(x + plankW * 0.35, gy + 3, x + plankW * 0.65, gy - 3, x + plankW - 4, gy);
        ctx.stroke();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 9);
  interiorCache.set('parquet', tex);
  return tex;
}

export function getMenuBoardTexture() {
  if (interiorCache.has('menu')) return interiorCache.get('menu');
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');

  // Slate chalkboard background
  const bg = ctx.createLinearGradient(0, 0, 0, 640);
  bg.addColorStop(0, '#1B221E');
  bg.addColorStop(1, '#121815');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 640);

  // Subtle chalk smudge
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.beginPath();
  ctx.arc(250, 300, 210, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#C99B42';
  ctx.lineWidth = 5;
  ctx.strokeRect(20, 20, 472, 600);

  ctx.fillStyle = '#F2C96B';
  ctx.font = '700 34px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('KAHVEHANE MENÜ', 256, 78);

  ctx.strokeStyle = 'rgba(242, 201, 107, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, 104);
  ctx.lineTo(448, 104);
  ctx.stroke();

  const items = [
    ['Tavşan Kanı Çay', '15 TL'],
    ['Portakallı Oralet', '20 TL'],
    ['Türk Kahvesi', '45 TL'],
    ['Nostaljik Gazoz', '35 TL'],
    ['Kaşarlı Tost', '95 TL'],
    ['Simit & Peynir', '55 TL'],
    ['Fıstıklı Baklava', '140 TL'],
    ['Karışık Çerez', '110 TL']
  ];

  items.forEach(([label, price], idx) => {
    const y = 160 + idx * 54;
    ctx.fillStyle = '#F5EFE2';
    ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, 52, y);

    ctx.fillStyle = '#E6B85C';
    ctx.font = '700 23px "Geist Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(price, 460, y);

    ctx.strokeStyle = 'rgba(245, 239, 226, 0.14)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(52, y + 16);
    ctx.lineTo(460, y + 16);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  interiorCache.set('menu', tex);
  return tex;
}

export function getWallClockTexture() {
  if (interiorCache.has('clock')) return interiorCache.get('clock');
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#F6EEDF';
  ctx.beginPath();
  ctx.arc(128, 128, 120, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#3E2618';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(128, 128, 114, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 12; i += 1) {
    const ang = (i * Math.PI) / 6;
    const x1 = 128 + Math.sin(ang) * 90;
    const y1 = 128 - Math.cos(ang) * 90;
    const x2 = 128 + Math.sin(ang) * 102;
    const y2 = 128 - Math.cos(ang) * 102;
    ctx.strokeStyle = '#241710';
    ctx.lineWidth = i % 3 === 0 ? 5 : 2.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Hour hand (~9:40 evening ambiance)
  ctx.strokeStyle = '#1E140E';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(128, 128);
  ctx.lineTo(74, 108);
  ctx.stroke();

  // Minute hand
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(128, 128);
  ctx.lineTo(188, 72);
  ctx.stroke();

  ctx.fillStyle = '#B58B3B';
  ctx.beginPath();
  ctx.arc(128, 128, 8, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  interiorCache.set('clock', tex);
  return tex;
}

export function getWallArtTexture(variant = 0) {
  const key = `art-${variant}`;
  if (interiorCache.has(key)) return interiorCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');

  if (variant % 2 === 0) {
    // Evening Galata / Bosphorus skyline painting
    const sky = ctx.createLinearGradient(0, 0, 0, 210);
    sky.addColorStop(0, '#1B2336');
    sky.addColorStop(0.55, '#6C3B31');
    sky.addColorStop(1, '#D1874B');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 512, 220);

    const sea = ctx.createLinearGradient(0, 220, 0, 320);
    sea.addColorStop(0, '#1A2D3D');
    sea.addColorStop(1, '#0F1822');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 220, 512, 100);

    // Horizon silhouettes
    ctx.fillStyle = '#1B1418';
    ctx.beginPath();
    ctx.moveTo(0, 220);
    ctx.lineTo(60, 175);
    ctx.lineTo(120, 195);
    ctx.lineTo(175, 145);
    ctx.lineTo(220, 195);
    ctx.lineTo(295, 165);
    ctx.lineTo(340, 115); // Galata Tower
    ctx.lineTo(362, 72);
    ctx.lineTo(384, 115);
    ctx.lineTo(405, 190);
    ctx.lineTo(512, 178);
    ctx.lineTo(512, 220);
    ctx.closePath();
    ctx.fill();

    // Warm shimmer lights on water
    ctx.fillStyle = 'rgba(255, 204, 110, 0.55)';
    for (let i = 0; i < 14; i += 1) {
      ctx.fillRect(60 + i * 28, 232 + (i % 3) * 14, 14, 3);
    }
  } else {
    // Rich Anatolian geometric kilim tapestry
    ctx.fillStyle = '#5B1E18';
    ctx.fillRect(0, 0, 512, 320);
    ctx.strokeStyle = '#C99B42';
    ctx.lineWidth = 10;
    ctx.strokeRect(18, 18, 476, 284);
    ctx.strokeStyle = '#E8D9B5';
    ctx.lineWidth = 4;
    ctx.strokeRect(36, 36, 440, 248);

    [156, 256, 356].forEach((cx, idx) => {
      ctx.fillStyle = idx === 1 ? '#1E4C5C' : '#C58A2B';
      ctx.beginPath();
      ctx.moveTo(cx, 80);
      ctx.lineTo(cx + 56, 160);
      ctx.lineTo(cx, 240);
      ctx.lineTo(cx - 56, 160);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#F2E5C6';
      ctx.beginPath();
      ctx.moveTo(cx, 126);
      ctx.lineTo(cx + 22, 160);
      ctx.lineTo(cx, 194);
      ctx.lineTo(cx - 22, 160);
      ctx.closePath();
      ctx.fill();
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  interiorCache.set(key, tex);
  return tex;
}

export function getWindowNightTexture() {
  if (interiorCache.has('window')) return interiorCache.get('window');
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#0E172A');
  sky.addColorStop(0.65, '#1D293E');
  sky.addColorStop(1, '#3B2C24');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 384, 512);

  // Soft amber streetlamp glow outside the kahvehane
  const bokehs = [
    [95, 340, 68, 'rgba(255, 180, 82, 0.42)'],
    [285, 365, 58, 'rgba(255, 166, 70, 0.36)'],
    [192, 410, 42, 'rgba(255, 224, 150, 0.25)']
  ];
  for (const [bx, by, br, col] of bokehs) {
    const g = ctx.createRadialGradient(bx, by, 4, bx, by, br);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }

  // Silhouetted street buildings + rain droplets
  ctx.fillStyle = '#090D16';
  ctx.fillRect(0, 390, 384, 122);
  ctx.fillRect(16, 290, 88, 110);
  ctx.fillRect(272, 310, 96, 100);

  ctx.fillStyle = 'rgba(215, 232, 255, 0.22)';
  for (let i = 0; i < 65; i += 1) {
    const rx = (i * 73) % 380;
    const ry = (i * 107) % 490;
    ctx.beginPath();
    ctx.ellipse(rx, ry, 1.5, 4.5, 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  interiorCache.set('window', tex);
  return tex;
}

