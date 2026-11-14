import * as THREE from 'three';
import { createNameplateTexture, getAvatarTexture } from './textures.js';

const sharedGeo = {
  collar: null,
  arm: null,
  hand: null,
  leg: null,
  shoe: null,
  turnRing: null,
  cueStick: null
};

function getLimbGeoms() {
  if (!sharedGeo.collar) {
    sharedGeo.collar = new THREE.CylinderGeometry(0.28, 0.36, 0.18, 14);
    sharedGeo.arm = new THREE.CylinderGeometry(0.14, 0.115, 0.92, 10);
    sharedGeo.hand = new THREE.SphereGeometry(0.125, 10, 8);
    sharedGeo.leg = new THREE.CylinderGeometry(0.18, 0.14, 1.38, 10);
    sharedGeo.shoe = new THREE.BoxGeometry(0.32, 0.18, 0.48);
    sharedGeo.turnRing = new THREE.RingGeometry(1.18, 1.36, 28);
    sharedGeo.cueStick = new THREE.CylinderGeometry(0.025, 0.052, 3.25, 8);
  }
  return sharedGeo;
}

// ── Shared human figure (head, hair, neck, shoulders, torso) ────────────────
const figureGeo = {};
const figureMatCache = new Map();
const badgeMatCache = new Map();
let badgeAlphaTex = null;
const ringTexCache = new Map();

const SKIN_TONES = ['#E3B899', '#D9AD8B', '#C99873', '#B98560', '#EBC6A8'];
const HAIR_TONES = ['#1E1712', '#2E2118', '#4A3423', '#6B6B6E', '#B9B4AC', '#3A2A20'];

function hashString(str) {
  let h = 2166136261;
  const s = String(str || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function getFigureGeoms() {
  if (!figureGeo.torso) {
    figureGeo.torso = new THREE.CylinderGeometry(0.6, 0.5, 1.5, 18);
    figureGeo.shoulders = new THREE.CapsuleGeometry(0.27, 1.22, 6, 14);
    figureGeo.neck = new THREE.CylinderGeometry(0.17, 0.2, 0.3, 12);
    figureGeo.head = new THREE.SphereGeometry(0.46, 22, 18);
    figureGeo.hair = new THREE.SphereGeometry(0.485, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
    figureGeo.ear = new THREE.SphereGeometry(0.09, 8, 8);
    figureGeo.eye = new THREE.SphereGeometry(0.048, 8, 8);
    figureGeo.nose = new THREE.SphereGeometry(0.07, 8, 8);
  }
  return figureGeo;
}

function getFigureMat(key, make) {
  let mat = figureMatCache.get(key);
  if (!mat) {
    mat = make();
    figureMatCache.set(key, mat);
  }
  return mat;
}

/**
 * Head-and-shoulders figure. Origin matches the old bust: hips near y = -0.3,
 * collar at y ≈ 1.38, so chairs, arms and legs line up unchanged.
 */
export function buildHumanFigure({ vestColor = '#6A4D1F', seedKey = '', isBot = false } = {}) {
  const geo = getFigureGeoms();
  const seed = hashString(seedKey);
  const skinColor = SKIN_TONES[seed % SKIN_TONES.length];
  const hairColor = HAIR_TONES[(seed >>> 4) % HAIR_TONES.length];

  const vestMat = getFigureMat(`vest:${vestColor}`, () =>
    new THREE.MeshStandardMaterial({ color: vestColor, roughness: 0.62, metalness: 0.04 }));
  const shirtMat = getFigureMat(`shirt:${isBot ? 'b' : 'h'}`, () =>
    new THREE.MeshStandardMaterial({ color: isBot ? '#DCE6F2' : '#F4ECE0', roughness: 0.72 }));
  const skinMat = getFigureMat(`skin:${skinColor}`, () =>
    new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.68 }));
  const hairMat = getFigureMat(`hair:${hairColor}`, () =>
    new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.82 }));
  const eyeMat = getFigureMat('eye', () =>
    new THREE.MeshStandardMaterial({ color: '#1B1512', roughness: 0.3 }));

  const figure = new THREE.Group();

  const torso = new THREE.Mesh(geo.torso, vestMat);
  torso.position.y = 0.45;
  torso.scale.set(1.12, 1, 0.66);
  torso.castShadow = true;
  torso.receiveShadow = true;
  figure.add(torso);

  const shoulders = new THREE.Mesh(geo.shoulders, vestMat);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.position.y = 1.1;
  shoulders.scale.set(1, 1, 0.84);
  shoulders.castShadow = true;
  figure.add(shoulders);

  const collar = new THREE.Mesh(getLimbGeoms().collar, shirtMat);
  collar.position.set(0, 1.36, 0.02);
  figure.add(collar);

  const neck = new THREE.Mesh(geo.neck, skinMat);
  neck.position.y = 1.56;
  figure.add(neck);

  const head = new THREE.Group();
  head.position.y = 2.04;
  figure.add(head);

  const skull = new THREE.Mesh(geo.head, skinMat);
  skull.scale.set(0.93, 1.06, 0.97);
  skull.castShadow = true;
  head.add(skull);

  const hair = new THREE.Mesh(geo.hair, hairMat);
  hair.scale.set(0.95, 1.05, 1.0);
  hair.position.set(0, 0.035, -0.04);
  hair.rotation.x = -0.22;
  head.add(hair);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(geo.ear, skinMat);
    ear.position.set(side * 0.425, -0.02, 0);
    ear.scale.set(0.55, 1, 0.8);
    head.add(ear);

    const eye = new THREE.Mesh(geo.eye, eyeMat);
    eye.position.set(side * 0.155, 0.04, 0.4);
    eye.scale.set(1, 1.15, 0.5);
    head.add(eye);
  }

  const nose = new THREE.Mesh(geo.nose, skinMat);
  nose.position.set(0, -0.07, 0.44);
  nose.scale.set(0.8, 1, 0.9);
  head.add(nose);

  return { figure, head, vestMat, skinMat };
}

function getBadgeAlphaTexture() {
  if (!badgeAlphaTex) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(64, 64, 62, 0, Math.PI * 2);
    ctx.fill();
    badgeAlphaTex = new THREE.CanvasTexture(c);
  }
  return badgeAlphaTex;
}

function getRingTexture(color, glow) {
  const key = `${color}:${glow ? 1 : 0}`;
  let tex = ringTexCache.get(key);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 160;
    const ctx = c.getContext('2d');
    if (glow) {
      const g = ctx.createRadialGradient(80, 80, 56, 80, 80, 80);
      g.addColorStop(0, 'rgba(255, 224, 130, 0.75)');
      g.addColorStop(1, 'rgba(255, 224, 130, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 160, 160);
    }
    ctx.fillStyle = '#1A120C';
    ctx.beginPath();
    ctx.arc(80, 80, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(80, 80, 60, 0, Math.PI * 2);
    ctx.stroke();
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    ringTexCache.set(key, tex);
  }
  return tex;
}

/**
 * Profile photo as a round camera-facing badge, so it reads from every angle
 * (the old medallion disc turned into a dark sliver when seen from the side).
 */
export function buildPfpBadge({ avatar = 'avatar-1', name = 'O', radius = 0.6, ringColor = '#C59A4B', isActive = false } = {}) {
  const rawAv = String(avatar || 'avatar-1').trim() || 'avatar-1';
  const photoKey = `photo:${rawAv}:${isDataUrlOrFallbackKey(rawAv, name)}`;
  let photoMat = badgeMatCache.get(photoKey);
  if (!photoMat) {
    if (badgeMatCache.size > 160) {
      const oldest = badgeMatCache.keys().next().value;
      badgeMatCache.get(oldest)?.dispose();
      badgeMatCache.delete(oldest);
    }
    photoMat = new THREE.SpriteMaterial({
      map: getAvatarTexture(rawAv, name || 'O'),
      alphaMap: getBadgeAlphaTexture(),
      transparent: true,
      depthWrite: false
    });
    badgeMatCache.set(photoKey, photoMat);
  }
  const ringKey = `ring:${isActive ? '#F5C842' : ringColor}:${isActive ? 1 : 0}`;
  let ringMat = badgeMatCache.get(ringKey);
  if (!ringMat) {
    ringMat = new THREE.SpriteMaterial({
      map: getRingTexture(isActive ? '#F5C842' : ringColor, isActive),
      transparent: true,
      depthWrite: false
    });
    badgeMatCache.set(ringKey, ringMat);
  }

  const badge = new THREE.Group();
  const ringHolder = new THREE.Group();
  const ring = new THREE.Sprite(ringMat);
  ring.scale.set(radius * 2.5, radius * 2.5, 1);
  ring.renderOrder = 18;
  ringHolder.add(ring);
  badge.add(ringHolder);

  const photo = new THREE.Sprite(photoMat);
  photo.scale.set(radius * 1.86, radius * 1.86, 1);
  photo.renderOrder = 19;
  badge.add(photo);

  return { badge, ringHolder };
}

export function buildKahveCharacter({
  bustGeom,
  avatarMatCache,
  avatar = 'avatar-1',
  name = 'Oyuncu',
  vestColor = '#6A4D1F',
  teamColor = '#C59A4B',
  isBot = false,
  isActive = false,
  seated = true,
  medRadius = 0.96,
  headY = 2.75,
  showNameplate = true,
  nameplateSub = '',
  nameplateY = null,
  rearPfp = true,
  hasCueStick = false,
  disposableMats = null
} = {}) {
  const root = new THREE.Group();
  const limbs = getLimbGeoms();

  const trouserMat = new THREE.MeshStandardMaterial({
    color: '#222428',
    roughness: 0.78
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: '#18110E',
    roughness: 0.45,
    metalness: 0.15
  });

  if (Array.isArray(disposableMats)) {
    disposableMats.push(trouserMat, shoeMat);
  }

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const { figure, vestMat: bustMat, skinMat } = buildHumanFigure({
    vestColor,
    seedKey: `${name}:${avatar}`,
    isBot
  });
  bodyGroup.add(figure);

  // Articulated Left & Right Arms
  const makeArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.86, 1.1, 0.04);

    const sleeve = new THREE.Mesh(limbs.arm, bustMat);
    sleeve.position.set(0, -0.44, 0);
    sleeve.castShadow = true;
    pivot.add(sleeve);

    const hand = new THREE.Mesh(limbs.hand, skinMat);
    hand.position.set(0, -0.94, 0.04);
    pivot.add(hand);

    if (seated) {
      pivot.rotation.x = -0.78;
      pivot.rotation.z = side * 0.14;
    } else {
      pivot.rotation.x = -0.14;
      pivot.rotation.z = side * 0.08;
    }
    bodyGroup.add(pivot);
    return pivot;
  };
  const leftArmPivot = makeArm(-1);
  const rightArmPivot = makeArm(1);

  let cuePivot = null;
  if (hasCueStick) {
    cuePivot = new THREE.Group();
    const cueMat = new THREE.MeshStandardMaterial({ color: '#8C4D27', roughness: 0.42 });
    if (Array.isArray(disposableMats)) disposableMats.push(cueMat);
    const cue = new THREE.Mesh(limbs.cueStick, cueMat);
    cue.position.set(0, 0.25, 0.16);
    cue.rotation.x = 0.14;
    cuePivot.position.set(0.95, 0.2, 0.25);
    cuePivot.add(cue);
    bodyGroup.add(cuePivot);
  }

  let leftLegPivot = null;
  let rightLegPivot = null;
  if (!seated) {
    const makeLeg = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.36, -0.32, 0);

      const leg = new THREE.Mesh(limbs.leg, trouserMat);
      leg.position.set(0, -0.68, 0);
      leg.castShadow = true;
      pivot.add(leg);

      const shoe = new THREE.Mesh(limbs.shoe, shoeMat);
      shoe.position.set(0, -1.46, 0.08);
      shoe.castShadow = true;
      pivot.add(shoe);

      bodyGroup.add(pivot);
      return pivot;
    };
    leftLegPivot = makeLeg(-1);
    rightLegPivot = makeLeg(1);
  }

  // Profile photo badge floating above the head, always facing the camera
  const headGroup = new THREE.Group();
  headGroup.position.set(0, headY + 0.42, 0);
  root.add(headGroup);

  const { badge, ringHolder } = buildPfpBadge({
    avatar,
    name,
    radius: medRadius * 0.62,
    ringColor: teamColor,
    isActive
  });
  headGroup.add(badge);

  let haloMesh = null;
  if (isActive) {
    haloMesh = ringHolder;
    const turnRingMat = new THREE.MeshBasicMaterial({
      color: '#F5C842',
      transparent: true,
      opacity: 0.52,
      side: THREE.DoubleSide
    });
    if (Array.isArray(disposableMats)) disposableMats.push(turnRingMat);
    const floorRing = new THREE.Mesh(limbs.turnRing, turnRingMat);
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.position.set(0, seated ? -0.32 : -1.94, 0);
    root.add(floorRing);
  }

  let nameplateMat = null;
  if (showNameplate) {
    const displayLabel = nameplateSub ? `${name} (${nameplateSub})` : (name || 'Oyuncu');
    nameplateMat = new THREE.SpriteMaterial({
      map: createNameplateTexture(displayLabel, { isActive, isBot }),
      transparent: true,
      depthWrite: false
    });
    const np = new THREE.Sprite(nameplateMat);
    np.position.set(0, nameplateY ?? (headY + medRadius + 0.64), 0);
    np.scale.set(3.25, 0.82, 1);
    np.renderOrder = 20;
    root.add(np);
  }

  return {
    group: root,
    bodyGroup,
    headGroup,
    haloMesh,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    cuePivot,
    nameplateMat
  };
}

function isDataUrlOrFallbackKey(rawAv, name) {
  if (/^data:image\//.test(rawAv)) return 'custom';
  if (/^avatar-\d+$/.test(rawAv)) return 'preset';
  return String(name || 'O').slice(0, 8);
}
