import * as THREE from 'three';
import { isOkeyTile } from '../../shared/tiles.js';
import { isPresetAvatar, TILE_THEMES } from '../../shared/presets.js';

const TILE_INK = {
  red: '#C8222B',
  blue: '#1658B8',
  black: '#191F28',
  yellow: '#B87200'
};

const TILE_THEME_MAP = new Map(TILE_THEMES.map((t) => [t.id, t]));

const faceCache = new Map();
const avatarCache = new Map();
const feltTextureCache = new Map();
const backTextureCache = new Map();
let cachedWoodTexture = null;
let cachedBackdropTexture = null;

const FELT_PALETTES = {
  green: ['#1D5E43', '#154B35', '#0E3425'],
  burgundy: ['#6E2030', '#541623', '#360D15'],
  navy: ['#203C61', '#162C49', '#0C1A2E']
};

const textureLoader = new THREE.TextureLoader();

export function getWoodTexture() {
  if (cachedWoodTexture) return cachedWoodTexture;

  const tex = textureLoader.load('/assets/wood_walnut.jpg', (loaded) => {
    loaded.needsUpdate = true;
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
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
    : isPresetAvatar(raw)
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

export function getFeltTexture(theme = 'green') {
  const key = Object.prototype.hasOwnProperty.call(FELT_PALETTES, theme) ? theme : 'green';
  if (feltTextureCache.has(key)) return feltTextureCache.get(key);

  const palette = FELT_PALETTES[key];
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(384, 384, 40, 384, 384, 540);
  grad.addColorStop(0, palette[0]);
  grad.addColorStop(0.65, palette[1]);
  grad.addColorStop(1, palette[2]);
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
  tex.anisotropy = 4;
  feltTextureCache.set(key, tex);
  return tex;
}

export function createSpeechBubbleTexture(name, text) {
  const cleanName = String(name || 'Oyuncu').slice(0, 18);
  const cleanText = String(text || '').trim().slice(0, 46);
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 176;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 640, 176);

  // Warm parchment speech bubble card + bottom pointer triangle
  ctx.fillStyle = 'rgba(252, 245, 228, 0.96)';
  ctx.beginPath();
  ctx.roundRect(24, 16, 592, 126, 28);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(300, 140);
  ctx.lineTo(320, 170);
  ctx.lineTo(344, 140);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#C9962E';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(24, 16, 592, 126, 28);
  ctx.stroke();

  ctx.fillStyle = '#8C5B12';
  ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cleanName, 320, 48);

  ctx.fillStyle = '#1E1A16';
  ctx.font = '700 32px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(cleanText, 320, 98);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function getTileBackTexture(theme = 'ivory') {
  const palette = TILE_THEME_MAP.get(theme) || TILE_THEME_MAP.get('ivory');
  const key = palette?.id || 'ivory';
  if (backTextureCache.has(key)) return backTextureCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 256, 360);
  bg.addColorStop(0, palette?.top || '#EEE6D4');
  bg.addColorStop(1, palette?.bottom || '#E1D5BD');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 360);

  // Soft chamfer frame
  ctx.strokeStyle = palette?.border || '#CFC1A5';
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
  backTextureCache.set(key, tex);
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
  const palette = TILE_THEME_MAP.get(options.tileTheme) || TILE_THEME_MAP.get('ivory');
  const themeKey = palette?.id || 'ivory';
  const key = tile.isFakeOkey
    ? `fake-v3-${themeKey}-${selected}-${mustUse}`
    : `v3-${themeKey}-${tile.color}-${tile.number}-${isOkey}-${selected}-${mustUse}`;

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
    bg.addColorStop(0, palette?.top || '#FCF8EE');
    bg.addColorStop(1, palette?.bottom || '#EFE6D1');
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
        : palette?.border || '#DDD2BC';
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
  dimpleShadow.addColorStop(0, palette?.border || '#DDD0B8');
  dimpleShadow.addColorStop(0.68, palette?.bottom || '#EAE0CB');
  dimpleShadow.addColorStop(0.92, palette?.top || '#F7F1E2');
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
  tex.anisotropy = 4;
  faceCache.set(key, tex);
  return tex;
}

const nameplateCache = new Map();

export function createNameplateTexture(name, { isActive = false, opened = false, teamIndex = 0, teamMode = 'solo' } = {}) {
  const cleanName = String(name || 'Oyuncu').slice(0, 18);
  const cacheKey = `${cleanName}|${isActive}|${opened}|${teamIndex}|${teamMode}`;
  if (nameplateCache.has(cacheKey)) return nameplateCache.get(cacheKey);
  if (nameplateCache.size > 64) {
    const oldest = nameplateCache.keys().next().value;
    nameplateCache.get(oldest)?.dispose();
    nameplateCache.delete(oldest);
  }

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
  ctx.fillText(cleanName, 256, 65);

  if (opened) {
    ctx.fillStyle = '#34D399';
    ctx.beginPath();
    ctx.arc(444, 64, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  nameplateCache.set(cacheKey, tex);
  return tex;
}

const interiorCache = new Map();

export function getDiscardPadTexture(active = false) {
  const key = active ? 'discard-pad-active' : 'discard-pad-idle';
  if (interiorCache.has(key)) return interiorCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = active ? '#1C4D37' : '#103525';
  ctx.fillRect(0, 0, 256, 320);

  ctx.strokeStyle = active ? '#F5C842' : 'rgba(245, 200, 66, 0.45)';
  ctx.lineWidth = active ? 10 : 6;
  ctx.setLineDash([16, 10]);
  ctx.strokeRect(14, 14, 228, 292);
  ctx.setLineDash([]);

  // Clean downward drop arrow
  ctx.strokeStyle = active ? '#FFE484' : 'rgba(245, 200, 66, 0.65)';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(128, 72);
  ctx.lineTo(128, 164);
  ctx.moveTo(92, 130);
  ctx.lineTo(128, 168);
  ctx.lineTo(164, 130);
  ctx.stroke();

  ctx.fillStyle = active ? '#FFF3C4' : 'rgba(248, 236, 200, 0.78)';
  ctx.font = '800 30px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TAŞ AT', 128, 224);

  ctx.fillStyle = active ? '#F5C842' : 'rgba(245, 200, 66, 0.55)';
  ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('SÜRÜKLE BIRAK', 128, 260);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  interiorCache.set(key, tex);
  return tex;
}

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

export function createLiveClockTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  function draw(date = new Date()) {
    ctx.clearRect(0, 0, 256, 256);
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

    const secs = date.getSeconds();
    const mins = date.getMinutes() + secs / 60;
    const hours = (date.getHours() % 12) + mins / 60;

    const hourAng = (hours * Math.PI) / 6;
    ctx.strokeStyle = '#1E140E';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(128 + Math.sin(hourAng) * 58, 128 - Math.cos(hourAng) * 58);
    ctx.stroke();

    const minAng = (mins * Math.PI) / 30;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(128 + Math.sin(minAng) * 82, 128 - Math.cos(minAng) * 82);
    ctx.stroke();

    const secAng = (secs * Math.PI) / 30;
    ctx.strokeStyle = '#B83227';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(128 - Math.sin(secAng) * 14, 128 + Math.cos(secAng) * 14);
    ctx.lineTo(128 + Math.sin(secAng) * 92, 128 - Math.cos(secAng) * 92);
    ctx.stroke();

    ctx.fillStyle = '#B58B3B';
    ctx.beginPath();
    ctx.arc(128, 128, 8, 0, Math.PI * 2);
    ctx.fill();

    tex.needsUpdate = true;
  }

  draw(new Date());
  return { texture: tex, update: draw };
}

export function getWallClockTexture() {
  if (interiorCache.has('clock')) return interiorCache.get('clock');
  const { texture } = createLiveClockTexture();
  interiorCache.set('clock', texture);
  return texture;
}

export function createTvScreenTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  function draw(tvState = null) {
    const grad = ctx.createLinearGradient(0, 0, 512, 320);
    if (tvState && tvState.embedUrl) {
      grad.addColorStop(0, '#102438');
      grad.addColorStop(0.55, '#1B3A54');
      grad.addColorStop(1, '#0F1A26');
    } else {
      grad.addColorStop(0, '#181311');
      grad.addColorStop(1, '#0C0908');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 320);

    // Subtle CRT scanlines
    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    for (let y = 0; y < 320; y += 6) {
      ctx.fillRect(0, y, 512, 2);
    }

    ctx.strokeStyle = 'rgba(242, 201, 107, 0.42)';
    ctx.lineWidth = 4;
    ctx.strokeRect(18, 18, 476, 284);

    if (tvState && tvState.embedUrl) {
      // Live TV badge
      ctx.fillStyle = tvState.isLive ? '#DC2626' : '#D97706';
      ctx.beginPath();
      ctx.roundRect(38, 36, 118, 36, 8);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 18px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tvState.isLive ? '● CANLI TV' : '▶ YAYIN', 97, 54);

      const title = String(tvState.title || 'Kahvehane TV').slice(0, 28);
      ctx.fillStyle = '#F8F2E4';
      ctx.font = '800 32px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(title, 256, 152);

      const who = tvState.updatedBy ? `Açan: ${String(tvState.updatedBy).slice(0, 18)}` : 'Masayla senkronize';
      ctx.fillStyle = '#E6B85C';
      ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(who, 256, 205);

      ctx.fillStyle = 'rgba(248, 242, 228, 0.65)';
      ctx.font = '600 17px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Kanal değiştirmek için tıkla', 256, 258);
    } else {
      ctx.fillStyle = '#E6B85C';
      ctx.font = '800 34px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('KAHVEHANE TV', 256, 128);

      ctx.fillStyle = 'rgba(245, 239, 226, 0.72)';
      ctx.font = '600 21px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Yayın açmak için tıkla', 256, 178);

      ctx.fillStyle = 'rgba(230, 184, 92, 0.55)';
      ctx.font = '600 17px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('TRT 1 · Haber · Spor · Yeşilçam', 256, 222);
    }

    tex.needsUpdate = true;
  }

  draw(null);
  return { texture: tex, update: draw };
}

export function getCatPortraitTexture(catId = 'cat-1') {
  const safeId = ['cat-1', 'cat-2', 'cat-3'].includes(catId) ? catId : 'cat-1';
  const key = `portrait-${safeId}`;
  if (interiorCache.has(key)) return interiorCache.get(key);
  const tex = textureLoader.load(`/assets/${safeId}.jpg`, (loaded) => {
    loaded.needsUpdate = true;
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  interiorCache.set(key, tex);
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

export function getWindowAtmosphereTexture(atmosphere = 'rainy') {
  const mode = ['rainy', 'afternoon', 'midnight'].includes(atmosphere) ? atmosphere : 'rainy';
  const key = `window-${mode}`;
  if (interiorCache.has(key)) return interiorCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  if (mode === 'afternoon') {
    const sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#5E7FA6');
    sky.addColorStop(0.45, '#D48A5A');
    sky.addColorStop(0.8, '#F6BE6E');
    sky.addColorStop(1, '#9A5434');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 384, 512);

    const sunGlow = ctx.createRadialGradient(255, 195, 16, 255, 195, 150);
    sunGlow.addColorStop(0, 'rgba(255, 248, 210, 0.92)');
    sunGlow.addColorStop(0.4, 'rgba(255, 192, 102, 0.55)');
    sunGlow.addColorStop(1, 'rgba(255, 140, 60, 0)');
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(255, 195, 150, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#382018';
    ctx.fillRect(0, 398, 384, 114);
    ctx.fillRect(18, 310, 84, 96);
    ctx.fillRect(280, 326, 92, 82);
  } else if (mode === 'midnight') {
    const sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#050814');
    sky.addColorStop(0.65, '#0D1529');
    sky.addColorStop(1, '#1A2033');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 384, 512);

    // Stars
    ctx.fillStyle = 'rgba(244, 246, 255, 0.72)';
    for (let i = 0; i < 48; i += 1) {
      const sx = (i * 89 + 23) % 368 + 8;
      const sy = (i * 53 + 19) % 290 + 12;
      const sr = i % 5 === 0 ? 2.1 : 1.1;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crescent moon
    ctx.fillStyle = '#F7E7B4';
    ctx.beginPath();
    ctx.arc(112, 116, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#080D1C';
    ctx.beginPath();
    ctx.arc(124, 108, 23, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#070A12';
    ctx.fillRect(0, 392, 384, 120);
    ctx.fillRect(14, 300, 92, 100);
    ctx.fillRect(268, 318, 98, 92);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#0E172A');
    sky.addColorStop(0.65, '#1D293E');
    sky.addColorStop(1, '#3B2C24');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 384, 512);

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
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  interiorCache.set(key, tex);
  return tex;
}

export function getWindowNightTexture() {
  return getWindowAtmosphereTexture('rainy');
}


