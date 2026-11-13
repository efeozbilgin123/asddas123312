import * as THREE from 'three';
import { canLayoffTile } from '../../shared/melds.js';
import { isOkeyTile } from '../../shared/tiles.js';
import { soundFX } from './sound.js';
import {
  createNameplateTexture,
  createSpeechBubbleTexture,
  getAvatarTexture,
  getDiscardPadTexture,
  getFeltTexture,
  getKahveBackdropTexture,
  getMenuBoardTexture,
  getParquetTexture,
  getTileBackTexture,
  getTileFaceTexture,
  getWallArtTexture,
  getWallClockTexture,
  getWindowNightTexture,
  getWoodTexture
} from './textures.js';

const TILE_W = 0.62;
const TILE_H = 0.88;
const TILE_D = 0.13;

const RACK_COLS = 14;
const RACK_ROWS = 2;
const RACK_SPACING_X = 0.67;

const CAMERA_PRESETS = {
  fp: {
    pos: new THREE.Vector3(0, 6.1, 12.8),
    target: new THREE.Vector3(0, 0.85, 2.0),
    fov: 50
  },
  table: {
    pos: new THREE.Vector3(0, 12.2, 14.4),
    target: new THREE.Vector3(0, 0.45, 1.5),
    fov: 42
  },
  top: {
    pos: new THREE.Vector3(0, 18.2, 4.4),
    target: new THREE.Vector3(0, 0.1, 0.6),
    fov: 42
  },
  rack: {
    pos: new THREE.Vector3(0, 7.6, 12.8),
    target: new THREE.Vector3(0, 0.75, 4.4),
    fov: 44
  }
};

function createRoundedTileGeometry(w, h, d, radius = 0.038, bevel = 0.015) {
  const innerW = w - bevel * 2;
  const innerH = h - bevel * 2;
  const hw = innerW / 2;
  const hh = innerH / 2;
  const r = Math.min(radius, hw * 0.4, hh * 0.4);

  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

  const extrudeDepth = Math.max(0.02, d - bevel * 2);
  let geom = new THREE.ExtrudeGeometry(shape, {
    depth: extrudeDepth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 6
  });

  // Center along Z around 0 -> [-d/2, +d/2]
  geom.translate(0, 0, -extrudeDepth / 2);
  geom = geom.toNonIndexed();
  geom.computeVertexNormals();

  const pos = geom.attributes.position;
  const uv = geom.attributes.uv;
  const halfD = d / 2;
  const capThreshold = halfD - 0.004;

  const frontTris = [];
  const backTris = [];
  const sideTris = [];

  for (let i = 0; i < pos.count; i += 3) {
    const z0 = pos.getZ(i);
    const z1 = pos.getZ(i + 1);
    const z2 = pos.getZ(i + 2);
    if (z0 > capThreshold && z1 > capThreshold && z2 > capThreshold) {
      frontTris.push(i);
    } else if (z0 < -capThreshold && z1 < -capThreshold && z2 < -capThreshold) {
      backTris.push(i);
    } else {
      sideTris.push(i);
    }
  }

  // Reorder vertices into 3 clean contiguous groups: 0=front, 1=back, 2=sides/bevel
  const norm = geom.attributes.normal;
  const totalVerts = pos.count;
  const newPos = new Float32Array(totalVerts * 3);
  const newNorm = new Float32Array(totalVerts * 3);
  const newUv = new Float32Array(totalVerts * 2);

  let writeIdx = 0;
  const copyTri = (triStart, mode) => {
    for (let k = 0; k < 3; k += 1) {
      const src = triStart + k;
      const vx = pos.getX(src);
      const vy = pos.getY(src);
      const vz = pos.getZ(src);

      newPos[writeIdx * 3] = vx;
      newPos[writeIdx * 3 + 1] = vy;
      newPos[writeIdx * 3 + 2] = vz;

      newNorm[writeIdx * 3] = norm.getX(src);
      newNorm[writeIdx * 3 + 1] = norm.getY(src);
      newNorm[writeIdx * 3 + 2] = norm.getZ(src);

      if (mode === 'front') {
        newUv[writeIdx * 2] = THREE.MathUtils.clamp((vx + w / 2) / w, 0, 1);
        newUv[writeIdx * 2 + 1] = THREE.MathUtils.clamp((vy + h / 2) / h, 0, 1);
      } else if (mode === 'back') {
        newUv[writeIdx * 2] = THREE.MathUtils.clamp(1 - (vx + w / 2) / w, 0, 1);
        newUv[writeIdx * 2 + 1] = THREE.MathUtils.clamp((vy + h / 2) / h, 0, 1);
      } else {
        newUv[writeIdx * 2] = uv.getX(src);
        newUv[writeIdx * 2 + 1] = uv.getY(src);
      }
      writeIdx += 1;
    }
  };

  const frontStart = 0;
  for (const t of frontTris) copyTri(t, 'front');
  const frontCount = writeIdx - frontStart;

  const backStart = writeIdx;
  for (const t of backTris) copyTri(t, 'back');
  const backCount = writeIdx - backStart;

  const sideStart = writeIdx;
  for (const t of sideTris) copyTri(t, 'side');
  const sideCount = writeIdx - sideStart;

  geom.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(newNorm, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(newUv, 2));
  geom.clearGroups();
  geom.addGroup(frontStart, frontCount, 0);
  geom.addGroup(backStart, backCount, 1);
  geom.addGroup(sideStart, sideCount, 2);

  return geom;
}

export class OkeyTable3D {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#160E09');
    this.scene.fog = new THREE.FogExp2('#160E09', 0.0065);

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(CAMERA_PRESETS.table.fov, width / height, 0.1, 130);
    this.targetFov = CAMERA_PRESETS.table.fov;
    this.camTarget = CAMERA_PRESETS.table.target.clone();
    this.camSpherical = new THREE.Spherical().setFromVector3(
      CAMERA_PRESETS.table.pos.clone().sub(this.camTarget)
    );
    this.targetSpherical = this.camSpherical.clone();
    this.targetCamLook = this.camTarget.clone();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.musicPerfMode = false;
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.setSize(width, height, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.14;

    this.demoMode = true;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.lastHoverCheckTime = 0;
    this.interactables = [];
    this.rackSlotMeshes = [];
    this.handSlotData = new Array(RACK_COLS * RACK_ROWS).fill(null);
    this.selectedTileIds = new Set();
    this.flippedTileIds = new Set();
    this.lastTileTap = null;
    this.currentState = null;

    this.dragState = null;
    this.dragTargetPos = null;
    this.dragTargetQuat = null;
    this.dragTargetScale = null;
    this.rackDragPlane = null;
    this.orbitDrag = null;
    this.activePointerId = null;
    this.tileAnimations = [];
    this.trackedMeshes = new Map();
    this.discardTopMeshes = new Map();
    this.meldTileMeshes = new Map();
    this.lastDiscardTopIds = [null, null, null, null];
    this.lastTableTileIds = new Set();
    this.lastHandIds = new Set();

    // Cached geometries and materials to eliminate per-click / per-frame GC stalls
    this.tileGeom = createRoundedTileGeometry(TILE_W, TILE_H, TILE_D, 0.038, 0.015);
    this.sideTileMat = new THREE.MeshStandardMaterial({
      color: '#EAE1CE',
      roughness: 0.28,
      metalness: 0.04
    });
    this.backTileMat = new THREE.MeshStandardMaterial({
      map: getTileBackTexture(),
      roughness: 0.3,
      metalness: 0.04
    });
    this.tileFaceMatCache = new Map();
    this.avatarMatCache = new Map();
    this.colorMatCache = new Map();
    this.headGeomCache = new Map();
    this.nameplateMatCache = new Map();

    const bustProfile = [
      new THREE.Vector2(0.01, -0.35),
      new THREE.Vector2(0.92, -0.35),
      new THREE.Vector2(0.96, 0.38),
      new THREE.Vector2(0.9, 0.92),
      new THREE.Vector2(0.7, 1.24),
      new THREE.Vector2(0.32, 1.44),
      new THREE.Vector2(0.24, 1.64),
      new THREE.Vector2(0.23, 1.94),
      new THREE.Vector2(0.01, 1.94)
    ];
    this.bustGeom = new THREE.LatheGeometry(bustProfile, 24);
    this.rearCapMat = new THREE.MeshStandardMaterial({
      color: '#0E0E10',
      roughness: 0.92,
      metalness: 0.04
    });
    this.coverWoodMat = new THREE.MeshStandardMaterial({
      map: getWoodTexture(),
      color: '#5B361D',
      roughness: 0.46,
      metalness: 0.08
    });
    this.coverBrassMat = new THREE.MeshStandardMaterial({
      color: '#B89242',
      roughness: 0.34,
      metalness: 0.65
    });
    this.oppShieldGeom = new THREE.BoxGeometry(9.5, 2.02, 0.24);
    this.oppTrimGeom = new THREE.BoxGeometry(9.54, 0.07, 0.26);
    this.gStandGeom = new THREE.BoxGeometry(0.84, 0.12, 1.08);
    this.gStandMat = new THREE.MeshStandardMaterial({
      map: getWoodTexture(),
      color: '#8A5630',
      roughness: 0.48
    });
    this.meldTrayGeomUnit = new THREE.BoxGeometry(1, 0.04, TILE_H * 0.74 + 0.14);
    this.meldTrayMatDefault = new THREE.MeshStandardMaterial({
      color: '#0E3122',
      roughness: 0.85
    });
    this.meldTrayMatLayoff = new THREE.MeshStandardMaterial({
      color: '#3FA876',
      emissive: '#1F6B47',
      roughness: 0.85
    });
    this.deckGlowRingGeom = new THREE.RingGeometry(0.6, 0.74, 24);
    this.deckGlowRingMat = new THREE.MeshBasicMaterial({ color: '#F3CF42', side: THREE.DoubleSide });
    this.leftDiscardRingGeom = new THREE.RingGeometry(0.62, 0.78, 24);
    this.leftDiscardRingMat = new THREE.MeshBasicMaterial({ color: '#4ADE80', side: THREE.DoubleSide });
    this.turnRingGeom = new THREE.RingGeometry(1.18, 1.32, 24);
    this.steamPuffGeom = new THREE.SphereGeometry(0.075, 10, 8);

    this.dynamicGroup = new THREE.Group();
    this.scene.add(this.dynamicGroup);

    this.orderGroup = new THREE.Group();
    this.scene.add(this.orderGroup);
    this.bubbleGroup = new THREE.Group();
    this.scene.add(this.bubbleGroup);
    this.celebrationGroup = new THREE.Group();
    this.scene.add(this.celebrationGroup);
    this.steamParticles = [];
    this.speechBubbles = new Map();
    this.celebrationParticles = [];
    this.nudgeShake = null;
    this.tableTheme = 'green';
    this.tableFeltMat = null;
    this.sideFeltMats = [];
    this.confettiGeom = new THREE.PlaneGeometry(0.18, 0.11);
    this.confettiMats = ['#F5C842', '#3FA876', '#E55B5B', '#56B4E9', '#FFF4DC'].map(
      (color) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 1 })
    );
    this.currentOrders = null;
    this.currentViewerIdx = 0;

    this.buildEnvironment();
    this.buildTable();
    this.buildRacks();
    this.buildDemoSetup();
    this.bindEvents();

    this.clock = new THREE.Clock();
    this.rafId = null;
    this.animate = this.animate.bind(this);
    this.animate();
  }

  setMusicPerformanceMode(active) {
    const next = Boolean(active);
    if (this.musicPerfMode === next) return;
    this.musicPerfMode = next;
    const targetRatio = next
      ? Math.min(window.devicePixelRatio || 1, 1.15)
      : this.basePixelRatio;
    this.renderer.setPixelRatio(targetRatio);
    this.onResize();
  }

  getRackSlots() {
    return this.handSlotData;
  }

  buildPendantLamp(x, y, z, scale = 1, addLight = false) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const brassMat = new THREE.MeshStandardMaterial({
      color: '#C79B42',
      roughness: 0.28,
      metalness: 0.8
    });
    const chainHeight = Math.max(1.2, 13.4 - y);
    const chain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, chainHeight, 8),
      brassMat
    );
    chain.position.y = chainHeight / 2;
    group.add(chain);

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(0.48 * scale, 0.4 * scale, 16),
      brassMat
    );
    cap.position.y = 0.24 * scale;
    group.add(cap);

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(0.45 * scale, 20, 16),
      new THREE.MeshStandardMaterial({
        color: '#FFE6A8',
        emissive: '#FF9F38',
        emissiveIntensity: 1.75,
        roughness: 0.2
      })
    );
    globe.position.y = -0.18 * scale;
    group.add(globe);

    const finial = new THREE.Mesh(
      new THREE.ConeGeometry(0.14 * scale, 0.28 * scale, 12),
      brassMat
    );
    finial.rotation.x = Math.PI;
    finial.position.y = -0.7 * scale;
    group.add(finial);

    if (addLight) {
      const pt = new THREE.PointLight('#FFC06E', 24, 28, 1.4);
      pt.position.y = -0.35 * scale;
      group.add(pt);
    }

    this.scene.add(group);
  }

  buildWoodenChair(woodMat, leatherMat) {
    const chair = new THREE.Group();

    const legOffsets = [
      [-0.72, -1.48, -0.68],
      [0.72, -1.48, -0.68],
      [-0.72, -1.48, 0.68],
      [0.72, -1.48, 0.68]
    ];
    for (const [lx, ly, lz] of legOffsets) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.055, 1.74, 8),
        woodMat
      );
      leg.position.set(lx, ly, lz);
      chair.add(leg);
    }

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.14, 1.56), woodMat);
    frame.position.set(0, -0.58, 0);
    chair.add(frame);

    const cushion = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.14, 1.44), leatherMat);
    cushion.position.set(0, -0.46, 0.02);
    chair.add(cushion);

    for (const sx of [-0.74, 0.74]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 2.28, 8), woodMat);
      post.position.set(sx, 0.56, -0.72);
      post.rotation.x = -0.06;
      chair.add(post);
    }

    for (const sx of [-0.46, 0, 0.46]) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.42, 0.07), woodMat);
      slat.position.set(sx, 0.72, -0.73);
      slat.rotation.x = -0.06;
      chair.add(slat);
    }

    const crestRail = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.26, 0.14), woodMat);
    crestRail.position.set(0, 1.58, -0.78);
    crestRail.rotation.x = -0.06;
    chair.add(crestRail);

    return chair;
  }

  buildSideKahveTable(x, z, rotY, hasTavla = false) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;

    const woodMat = new THREE.MeshStandardMaterial({
      map: getWoodTexture(),
      color: '#75492B',
      roughness: 0.55
    });
    const darkWoodMat = new THREE.MeshStandardMaterial({
      map: getWoodTexture(),
      color: '#52311D',
      roughness: 0.65
    });
    const leatherMat = new THREE.MeshStandardMaterial({
      color: '#2B1B14',
      roughness: 0.65
    });

    const top = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.24, 4.4), woodMat);
    top.position.y = -0.14;
    group.add(top);

    const sideFeltMat = new THREE.MeshStandardMaterial({
      map: getFeltTexture(this.tableTheme),
      roughness: 0.9
    });
    this.sideFeltMats.push(sideFeltMat);
    const feltCenter = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.04, 3.6),
      sideFeltMat
    );
    feltCenter.position.y = -0.01;
    group.add(feltCenter);

    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.55, 2.2, 12), darkWoodMat);
    col.position.y = -1.25;
    group.add(col);

    const baseFoot = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.35, 0.16, 12), darkWoodMat);
    baseFoot.position.y = -2.27;
    group.add(baseFoot);

    if (hasTavla) {
      const tavla = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.12, 1.15), darkWoodMat);
      tavla.position.set(0, 0.06, 0);
      tavla.rotation.y = 0.25;
      group.add(tavla);
    } else {
      [
        [0, 0.08, 1.5, 0],
        [0, 0.08, -1.5, Math.PI]
      ].forEach(([rx, ry, rz, rRot]) => {
        const rack = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.28, 0.22), woodMat);
        rack.position.set(rx, ry, rz);
        rack.rotation.y = rRot;
        group.add(rack);
      });
    }

    const saucerMat = new THREE.MeshStandardMaterial({ color: '#F0EAE0', roughness: 0.25 });
    const teaMat = new THREE.MeshStandardMaterial({ color: '#8E250B', roughness: 0.15 });
    for (const [gx, gz] of [
      [-1.4, -1.3],
      [1.45, 1.35]
    ]) {
      const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.03, 12), saucerMat);
      saucer.position.set(gx, 0.03, gz);
      group.add(saucer);

      const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.26, 10), teaMat);
      tea.position.set(gx, 0.17, gz);
      group.add(tea);
    }

    const chairConfigs = [
      [0, 0, 2.75, Math.PI],
      [0, 0, -2.75, 0],
      [2.75, 0, 0, -Math.PI / 2],
      [-2.75, 0, 0, Math.PI / 2]
    ];
    for (const [cx, cy, cz, cRot] of chairConfigs) {
      const ch = this.buildWoodenChair(darkWoodMat, leatherMat);
      ch.position.set(cx, cy, cz);
      ch.rotation.y = cRot;
      group.add(ch);
    }

    this.scene.add(group);
  }

  buildPottedPlant(x, z, scale = 1) {
    const group = new THREE.Group();
    group.position.set(x, -2.35, z);
    group.scale.setScalar(scale);

    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.46, 1.15, 12),
      new THREE.MeshStandardMaterial({ color: '#7D3B22', roughness: 0.78 })
    );
    pot.position.y = 0.58;
    group.add(pot);

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 1.9, 8),
      new THREE.MeshStandardMaterial({ color: '#4A3122', roughness: 0.9 })
    );
    trunk.position.y = 1.65;
    group.add(trunk);

    const leafMat = new THREE.MeshStandardMaterial({ color: '#295732', roughness: 0.72 });
    const leafClusters = [
      [0, 2.75, 0, 0.65],
      [-0.45, 2.35, 0.3, 0.5],
      [0.48, 2.42, -0.25, 0.52],
      [0.18, 2.55, 0.46, 0.48],
      [-0.25, 2.48, -0.45, 0.46]
    ];
    for (const [lx, ly, lz, lr] of leafClusters) {
      const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(lr, 0), leafMat);
      crown.position.set(lx, ly, lz);
      group.add(crown);
    }

    this.scene.add(group);
  }

  buildEnvironment() {
    const hemi = new THREE.HemisphereLight('#FFEBD2', '#2B1C13', 1.15);
    this.scene.add(hemi);

    // Single warm kahvehane overhead key point light + shadow-casting directional
    const pendantLight = new THREE.PointLight('#FFD18C', 52, 54, 1.25);
    pendantLight.position.set(0, 9.6, 0.5);
    this.scene.add(pendantLight);

    const keyLight = new THREE.DirectionalLight('#FFF0D4', 1.25);
    keyLight.position.set(6, 16, 9);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 38;
    const d = 13.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#CBD8FF', 0.32);
    rimLight.position.set(-10, 9, -12);
    this.scene.add(rimLight);

    // Herringbone/plank walnut parquet floor + ornate central rug
    const floorMat = new THREE.MeshStandardMaterial({
      map: getParquetTexture(),
      roughness: 0.72
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(58, 58), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.35;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const rugOuter = new THREE.Mesh(
      new THREE.BoxGeometry(21.5, 0.04, 21.5),
      new THREE.MeshStandardMaterial({ color: '#612119', roughness: 0.94 })
    );
    rugOuter.position.y = -2.33;
    rugOuter.receiveShadow = true;
    this.scene.add(rugOuter);

    const rugBorder = new THREE.Mesh(
      new THREE.BoxGeometry(18.8, 0.045, 18.8),
      new THREE.MeshStandardMaterial({ color: '#8F642B', roughness: 0.9 })
    );
    rugBorder.position.y = -2.326;
    this.scene.add(rugBorder);

    const rugInner = new THREE.Mesh(
      new THREE.BoxGeometry(17.6, 0.05, 17.6),
      new THREE.MeshStandardMaterial({ color: '#4E1A15', roughness: 0.95 })
    );
    rugInner.position.y = -2.322;
    this.scene.add(rugInner);

    // Pedestal table leg under main center okey table
    const legMat = new THREE.MeshStandardMaterial({
      map: getWoodTexture(),
      color: '#633D26',
      roughness: 0.65
    });
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.2, 2.1, 20), legMat);
    pedestal.position.y = -1.35;
    this.scene.add(pedestal);

    // 3D Kahvehane Interior Room (Warm Plaster, Walnut Wainscoting, Windows, Pilasters)
    const wallPlasterMat = new THREE.MeshStandardMaterial({
      color: '#3B251A',
      roughness: 0.9
    });
    const wainscotMat = new THREE.MeshStandardMaterial({
      map: getWoodTexture(),
      color: '#5C3722',
      roughness: 0.68
    });
    const trimBrassMat = new THREE.MeshStandardMaterial({
      color: '#C79B42',
      roughness: 0.34,
      metalness: 0.68
    });
    const artMat0 = new THREE.MeshStandardMaterial({ map: getWallArtTexture(0), roughness: 0.6 });
    const artMat1 = new THREE.MeshStandardMaterial({ map: getWallArtTexture(1), roughness: 0.72 });
    const menuMat = new THREE.MeshStandardMaterial({ map: getMenuBoardTexture(), roughness: 0.75 });
    const clockMat = new THREE.MeshBasicMaterial({ map: getWallClockTexture() });
    const windowMat = new THREE.MeshBasicMaterial({ map: getWindowNightTexture() });
    const photoMat = new THREE.MeshStandardMaterial({ map: getKahveBackdropTexture(), roughness: 0.65 });
    const sconceMat = new THREE.MeshStandardMaterial({
      color: '#FFE4A3',
      emissive: '#FF9E3D',
      emissiveIntensity: 1.55
    });

    const roomHalf = 25.5;
    const wallSpecs = [
      { pos: [0, 5.4, -roomHalf], rotY: 0 },
      { pos: [0, 5.4, roomHalf], rotY: Math.PI },
      { pos: [-roomHalf, 5.4, 0], rotY: Math.PI / 2 },
      { pos: [roomHalf, 5.4, 0], rotY: -Math.PI / 2 }
    ];

    wallSpecs.forEach((ws, wallIdx) => {
      const wallGroup = new THREE.Group();
      wallGroup.position.set(...ws.pos);
      wallGroup.rotation.y = ws.rotY;

      const upper = new THREE.Mesh(new THREE.PlaneGeometry(52, 16), wallPlasterMat);
      wallGroup.add(upper);

      const lowerWood = new THREE.Mesh(new THREE.BoxGeometry(52, 5.4, 0.28), wainscotMat);
      lowerWood.position.set(0, -5.1, 0.14);
      wallGroup.add(lowerWood);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(52, 0.26, 0.42), trimBrassMat);
      rail.position.set(0, -2.35, 0.2);
      wallGroup.add(rail);

      for (const px of [-20, -10, 10, 20]) {
        const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.65, 15.6, 0.38), wainscotMat);
        pilaster.position.set(px, 0, 0.18);
        wallGroup.add(pilaster);
      }

      [-15, 0, 15].forEach((px, pIdx) => {
        if (wallIdx === 0 && px === 0) return;
        if (wallIdx === 0 && px === 15) {
          const mFrame = new THREE.Mesh(new THREE.BoxGeometry(4.6, 5.6, 0.2), wainscotMat);
          mFrame.position.set(px, 1.45, 0.12);
          wallGroup.add(mFrame);
          const mFace = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 5.1), menuMat);
          mFace.position.set(px, 1.45, 0.25);
          wallGroup.add(mFace);
          return;
        }
        const frame = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.4, 0.18), wainscotMat);
        frame.position.set(px, 1.35, 0.12);
        wallGroup.add(frame);

        const chosenMat = pIdx === 1 ? photoMat : (wallIdx + pIdx) % 2 === 0 ? artMat0 : artMat1;
        const art = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.85), chosenMat);
        art.position.set(px, 1.35, 0.24);
        wallGroup.add(art);
      });

      [-10, 10].forEach((sx) => {
        const sconce = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), sconceMat);
        sconce.position.set(sx, 2.2, 0.45);
        wallGroup.add(sconce);
      });

      this.scene.add(wallGroup);
    });

    // Classic Round Wall Clock on North back wall (left of Ocakbaşı)
    const clockGroup = new THREE.Group();
    clockGroup.position.set(-7.6, 7.6, -roomHalf + 0.24);
    const clockCase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.38, 1.48, 0.28, 24),
      wainscotMat
    );
    clockCase.rotation.x = Math.PI / 2;
    clockGroup.add(clockCase);
    const clockFace = new THREE.Mesh(new THREE.CircleGeometry(1.18, 24), clockMat);
    clockFace.position.z = 0.16;
    clockGroup.add(clockFace);
    this.scene.add(clockGroup);

    // Rain-kissed Evening Windows on East & West walls with velvet drapes
    const curtainMat = new THREE.MeshStandardMaterial({ color: '#53191B', roughness: 0.88 });
    [-1, 1].forEach((side) => {
      [-5.5, 5.5].forEach((wz) => {
        const winGroup = new THREE.Group();
        winGroup.position.set(side * (roomHalf - 0.18), 2.1, wz);
        winGroup.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;

        const pane = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 5.6), windowMat);
        winGroup.add(pane);

        const frameOuter = new THREE.Mesh(new THREE.BoxGeometry(4.9, 6.1, 0.24), wainscotMat);
        frameOuter.position.z = -0.14;
        winGroup.add(frameOuter);

        for (const mx of [-0.75, 0.75]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 5.6, 0.16), wainscotMat);
          bar.position.set(mx, 0, 0.08);
          winGroup.add(bar);
        }
        for (const my of [-0.95, 0.95]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 0.16), wainscotMat);
          bar.position.set(0, my, 0.08);
          winGroup.add(bar);
        }

        for (const cx of [-2.45, 2.45]) {
          const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 6.4, 10), curtainMat);
          drape.position.set(cx, 0, 0.16);
          winGroup.add(drape);
        }

        this.scene.add(winGroup);
      });
    });

    // Ceiling & Exposed Timber Beams
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(54, 54),
      new THREE.MeshStandardMaterial({ color: '#1F130D', roughness: 0.95 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 13.4;
    this.scene.add(ceiling);

    [-18, -9, 0, 9, 18].forEach((bz) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(52, 0.58, 0.72), wainscotMat);
      beam.position.set(0, 13.1, bz);
      this.scene.add(beam);
    });

    // Kahvehane Ocakbaşı (Tea Counter + Copper/Brass Çay Kazanı & Demlik + Tea Glass Shelves)
    const barGroup = new THREE.Group();
    barGroup.position.set(0, -2.35, -22.6);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(12.2, 2.75, 2.4), wainscotMat);
    counter.position.y = 1.38;
    barGroup.add(counter);

    const counterTop = new THREE.Mesh(
      new THREE.BoxGeometry(12.6, 0.2, 2.65),
      new THREE.MeshStandardMaterial({ color: '#945F37', roughness: 0.35 })
    );
    counterTop.position.y = 2.84;
    barGroup.add(counterTop);

    const copperMat = new THREE.MeshStandardMaterial({
      color: '#B86535',
      roughness: 0.26,
      metalness: 0.78
    });
    const kazanBody = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.7, 1.35), copperMat);
    kazanBody.position.set(-2.4, 3.78, 0);
    barGroup.add(kazanBody);

    const kazanRim = new THREE.Mesh(new THREE.BoxGeometry(2.74, 0.14, 1.46), trimBrassMat);
    kazanRim.position.set(-2.4, 4.65, 0);
    barGroup.add(kazanRim);

    const demlik = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 10), trimBrassMat);
    demlik.scale.set(1.05, 0.88, 1.05);
    demlik.position.set(-2.4, 5.1, 0);
    barGroup.add(demlik);

    for (const sy of [4.8, 6.3]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.16, 0.95), wainscotMat);
      shelf.position.set(1.0, sy, -1.7);
      barGroup.add(shelf);
    }
    const barGlassMat = new THREE.MeshStandardMaterial({ color: '#DCE8EB', transparent: true, opacity: 0.6, roughness: 0.1 });
    for (let i = 0; i < 8; i += 1) {
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.34, 10), barGlassMat);
      glass.position.set(-1.6 + i * 0.72, 5.05, -1.7);
      barGroup.add(glass);
    }
    this.scene.add(barGroup);

    // 4 Cozy Ambient Side Kahvehane Tables around the room
    this.buildSideKahveTable(-16.2, -15.2, 0.18, false);
    this.buildSideKahveTable(16.2, -15.2, -0.22, true);
    this.buildSideKahveTable(-17.4, 10.2, -0.15, true);
    this.buildSideKahveTable(17.4, 10.2, 0.2, false);

    // Potted Kahvehane Ficus Plants in Room Corners
    this.buildPottedPlant(-23.2, -23.2, 1.15);
    this.buildPottedPlant(23.2, -23.2, 1.1);
    this.buildPottedPlant(-23.2, 22.8, 1.05);
    this.buildPottedPlant(23.2, 22.8, 1.1);

    // Hanging Brass Mosaic Pendant Lamps over center & corner tables (emissive globes, single central PointLight)
    this.buildPendantLamp(0, 10.4, 0, 1.25, false);
    this.buildPendantLamp(-16.2, 7.2, -15.2, 1.05, false);
    this.buildPendantLamp(16.2, 7.2, -15.2, 1.05, false);
    this.buildPendantLamp(-17.4, 7.2, 10.2, 1.0, false);
    this.buildPendantLamp(17.4, 7.2, 10.2, 1.0, false);
  }

  buildTable() {
    const woodMat = new THREE.MeshStandardMaterial({
      map: getWoodTexture(),
      color: '#C79A74',
      roughness: 0.48,
      metalness: 0.06
    });
    this.tableFeltMat = new THREE.MeshStandardMaterial({
      map: getFeltTexture(this.tableTheme),
      roughness: 0.9,
      metalness: 0.02
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: '#C7A049',
      roughness: 0.3,
      metalness: 0.75
    });

    // Outer walnut table base
    const outer = new THREE.Mesh(new THREE.BoxGeometry(18.8, 0.65, 18.8), woodMat);
    outer.position.y = -0.34;
    outer.receiveShadow = true;
    outer.castShadow = true;
    this.scene.add(outer);

    // Wool felt playing surface
    const felt = new THREE.Mesh(new THREE.BoxGeometry(16.6, 0.08, 16.6), this.tableFeltMat);
    felt.position.y = -0.02;
    felt.receiveShadow = true;
    this.scene.add(felt);

    // Brass corner accents
    const cornerOffsets = [
      [-8.95, -8.95],
      [8.95, -8.95],
      [-8.95, 8.95],
      [8.95, 8.95]
    ];
    for (const [cx, cz] of cornerOffsets) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.68, 0.95), brassMat);
      cap.position.set(cx, -0.33, cz);
      this.scene.add(cap);
    }

    // Flat table drag plane
    this.tableDragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.95);

    // Four discard pad coordinates: each seat discards to their RIGHT,
    // so seat rel=3 (left neighbor) discards RIGHT NEXT to the left edge of your South rack!
    this.discardZoneCoords = [
      new THREE.Vector3(5.85, 0.04, 6.25),   // rel 0 (Your right edge of rack)
      new THREE.Vector3(6.25, 0.04, -5.85),  // rel 1
      new THREE.Vector3(-5.85, 0.04, -6.25), // rel 2
      new THREE.Vector3(-5.85, 0.04, 6.25)   // rel 3 (Directly left of your rack!)
    ];

    this.discardPadMatIdle = new THREE.MeshStandardMaterial({
      map: getDiscardPadTexture(false),
      roughness: 0.76
    });
    this.discardPadMatActive = new THREE.MeshStandardMaterial({
      map: getDiscardPadTexture(true),
      emissive: '#6B4E0C',
      emissiveIntensity: 0.45,
      roughness: 0.56
    });
    const otherPadMat = new THREE.MeshStandardMaterial({
      color: '#0F3625',
      roughness: 0.88
    });

    for (let rel = 0; rel < 4; rel += 1) {
      const pos = this.discardZoneCoords[rel];
      if (rel === 0) {
        const pad = new THREE.Mesh(
          new THREE.PlaneGeometry(1.32, 1.62),
          this.discardPadMatIdle
        );
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(pos.x, 0.032, pos.z);
        pad.receiveShadow = true;
        this.rightDiscardPadMesh = pad;
        this.scene.add(pad);

        // Glowing golden perimeter ring around right discard drop zone
        this.rightDiscardRingMat = new THREE.MeshBasicMaterial({
          color: '#F5C842',
          transparent: true,
          opacity: 0.0,
          side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.84, 0.96, 32),
          this.rightDiscardRingMat
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(pos.x, 0.038, pos.z);
        this.rightDiscardRing = ring;
        this.scene.add(ring);

        // Tall invisible 3D hit column so First-Person drag drops never miss the pad (clear of rack x <= 4.99)
        this.rightDiscardHitBox = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 1.4, 2.2),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        this.rightDiscardHitBox.position.set(pos.x + 0.15, 0.62, pos.z);
        this.scene.add(this.rightDiscardHitBox);
      } else {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.03, 1.38), otherPadMat);
        pad.position.set(pos.x, 0.02, pos.z);
        pad.receiveShadow = true;
        this.scene.add(pad);
      }
    }
  }

  buildRacks() {
    const rackWoodMat = new THREE.MeshStandardMaterial({
      map: getWoodTexture(),
      color: '#CFA076',
      roughness: 0.44,
      metalness: 0.05
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: '#C7A049',
      roughness: 0.34,
      metalness: 0.68
    });

    const rackSpecs = [
      { rel: 0, pos: [0, 0.22, 6.85], rotY: 0 },
      { rel: 1, pos: [6.85, 0.22, 0], rotY: Math.PI / 2 },
      { rel: 2, pos: [0, 0.22, -6.85], rotY: Math.PI },
      { rel: 3, pos: [-6.85, 0.22, 0], rotY: -Math.PI / 2 }
    ];

    this.southRackGroup = null;

    for (const spec of rackSpecs) {
      const group = new THREE.Group();
      group.position.set(...spec.pos);
      group.rotation.y = spec.rotY;

      const rackTilt = new THREE.Group();
      rackTilt.rotation.x = -0.32;
      group.add(rackTilt);

      // Backboard (front face at z = -0.12)
      const back = new THREE.Mesh(new THREE.BoxGeometry(9.9, 2.3, 0.12), rackWoodMat);
      back.position.set(0, 1.15, -0.18);
      back.castShadow = true;
      back.receiveShadow = true;
      rackTilt.add(back);

      // Lower ledge (y = 0.00..0.14 -> bottom row tiles sit cleanly at y = 0.14 + TILE_H/2)
      const ledge1 = new THREE.Mesh(new THREE.BoxGeometry(9.9, 0.14, 0.38), rackWoodMat);
      ledge1.position.set(0, 0.07, 0.03);
      ledge1.castShadow = true;
      ledge1.receiveShadow = true;
      rackTilt.add(ledge1);

      // Upper ledge (y = 1.09..1.21 -> clears bottom-row tile top y = 1.02 with 0.07 gap!)
      const ledge2 = new THREE.Mesh(new THREE.BoxGeometry(9.9, 0.12, 0.34), rackWoodMat);
      ledge2.position.set(0, 1.15, 0.01);
      ledge2.castShadow = true;
      ledge2.receiveShadow = true;
      rackTilt.add(ledge2);

      // Brass end caps
      for (const side of [-4.99, 4.99]) {
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.34, 0.44), brassMat);
        bracket.position.set(side, 1.16, -0.02);
        rackTilt.add(bracket);
      }

      if (spec.rel === 0) {
        this.southRackGroup = rackTilt;
        this.southRackWorldGroup = group;
        this.buildSouthSlotMarkers(rackTilt);
      }

      this.scene.add(group);
    }

    if (this.southRackWorldGroup && this.southRackGroup) {
      this.southRackWorldGroup.updateMatrixWorld(true);
      const p0 = new THREE.Vector3(0, 1.1, 0.28).applyMatrix4(this.southRackGroup.matrixWorld);
      const p1 = new THREE.Vector3(1, 1.1, 0.28).applyMatrix4(this.southRackGroup.matrixWorld);
      const p2 = new THREE.Vector3(0, 2.1, 0.28).applyMatrix4(this.southRackGroup.matrixWorld);
      this.rackDragPlane = new THREE.Plane().setFromCoplanarPoints(p0, p1, p2);
    }
  }

  buildSouthSlotMarkers(rackTilt) {
    const markerMat = new THREE.MeshBasicMaterial({
      color: '#F5D66B',
      transparent: true,
      opacity: 0.0
    });
    const slotGeom = new THREE.PlaneGeometry(TILE_W * 0.96, TILE_H * 0.96);

    this.rackSlotMeshes = [];
    for (let row = 0; row < RACK_ROWS; row += 1) {
      for (let col = 0; col < RACK_COLS; col += 1) {
        const slotIdx = row * RACK_COLS + col;
        const pos = this.getLocalRackSlotPosition(slotIdx);
        const marker = new THREE.Mesh(slotGeom, markerMat.clone());
        marker.position.set(pos.x, pos.y, pos.z - 0.075);
        marker.userData = { kind: 'rackSlot', slotIdx };
        rackTilt.add(marker);
        this.rackSlotMeshes.push(marker);
      }
    }
  }

  getLocalRackSlotPosition(slotIdx) {
    const row = Math.floor(slotIdx / RACK_COLS); // 0 = top row, 1 = bottom row
    const col = slotIdx % RACK_COLS;
    const x = (col - (RACK_COLS - 1) / 2) * RACK_SPACING_X;
    // Top row rests flush on ledge2 top (1.21 + 0.44 = 1.65)
    // Bottom row rests flush on ledge1 top (0.14 + 0.44 = 0.58)
    const y = row === 0 ? 1.65 : 0.58;
    const z = -0.02;
    return new THREE.Vector3(x, y, z);
  }

  findNearestRackSlot(localPt) {
    const row = localPt.y >= 1.115 ? 0 : 1;
    const colRaw = Math.round(localPt.x / RACK_SPACING_X + (RACK_COLS - 1) / 2);
    const col = THREE.MathUtils.clamp(colRaw, 0, RACK_COLS - 1);
    return row * RACK_COLS + col;
  }

  createTileMesh(tile, { faceUp = true, okeyTarget = null, selected = false, mustUse = false } = {}) {
    let faceMat = this.backTileMat;
    if (faceUp) {
      const isOkey = isOkeyTile(tile, okeyTarget);
      const cacheKey = tile.isFakeOkey
        ? `fake-${selected}-${mustUse}`
        : `${tile.color}-${tile.number}-${isOkey}-${selected}-${mustUse}`;
      faceMat = this.tileFaceMatCache.get(cacheKey);
      if (!faceMat) {
        faceMat = new THREE.MeshStandardMaterial({
          map: getTileFaceTexture(tile, okeyTarget, { selected, mustUse }),
          roughness: 0.22,
          metalness: 0.04
        });
        this.tileFaceMatCache.set(cacheKey, faceMat);
      }
    }

    // Group 0: front, Group 1: back, Group 2: bevel & sides
    const materials = [faceMat, this.backTileMat, this.sideTileMat];
    const mesh = new THREE.Mesh(this.tileGeom, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  getCachedMat(key, factory) {
    let mat = this.colorMatCache.get(key);
    if (!mat) {
      mat = factory();
      this.colorMatCache.set(key, mat);
    }
    return mat;
  }

  getHeadGeoms(medRadius) {
    const key = String(medRadius);
    let entry = this.headGeomCache.get(key);
    if (!entry) {
      entry = {
        bezel: new THREE.CylinderGeometry(medRadius + 0.09, medRadius + 0.09, 0.22, 28),
        frontDisc: new THREE.CircleGeometry(medRadius, 28),
        rearDisc: new THREE.CircleGeometry(medRadius + 0.01, 28),
        halo: new THREE.RingGeometry(medRadius + 0.13, medRadius + 0.21, 28)
      };
      this.headGeomCache.set(key, entry);
    }
    return entry;
  }

  getNameplateMat(seat, isActive, teamMode) {
    const key = `${seat.name || ''}|${isActive}|${Boolean(seat.opened)}|${seat.teamIndex ?? 0}|${teamMode}`;
    let mat = this.nameplateMatCache.get(key);
    if (!mat) {
      if (this.nameplateMatCache.size >= 40) {
        const oldestKey = this.nameplateMatCache.keys().next().value;
        const oldest = this.nameplateMatCache.get(oldestKey);
        oldest?.map?.dispose();
        oldest?.dispose();
        this.nameplateMatCache.delete(oldestKey);
      }
      mat = new THREE.SpriteMaterial({
        map: createNameplateTexture(seat.name, {
          isActive,
          opened: seat.opened,
          teamIndex: seat.teamIndex,
          teamMode
        }),
        transparent: true,
        depthTest: false
      });
      this.nameplateMatCache.set(key, mat);
    }
    return mat;
  }

  buildPlayerCharacterModel({ vestColor, teamColor, isActive }) {
    const char = new THREE.Group();

    const bustMat = this.getCachedMat(`bust-${vestColor}`, () =>
      new THREE.MeshStandardMaterial({
        color: vestColor,
        roughness: 0.56,
        metalness: 0.08
      })
    );

    const bust = new THREE.Mesh(this.bustGeom, bustMat);
    bust.scale.set(1.26, 1.0, 0.58);
    bust.castShadow = true;
    bust.receiveShadow = true;
    char.add(bust);

    if (isActive) {
      const turnMat = this.getCachedMat(`turn-${teamColor}`, () =>
        new THREE.MeshBasicMaterial({
          color: teamColor,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide
        })
      );
      const turnRing = new THREE.Mesh(this.turnRingGeom, turnMat);
      turnRing.rotation.x = -Math.PI / 2;
      turnRing.position.set(0, -0.33, 0);
      char.add(turnRing);
    }

    return char;
  }

  renderPlayerHeads(state, viewerIdx) {
    const teamMode = state.options?.teamMode || 'solo';
    const seatPositions = [
      { rel: 1, pos: [8.85, 0.0, 0], headY: 2.78, medRadius: 0.98 },
      { rel: 2, pos: [0, 0.0, -8.85], headY: 2.92, medRadius: 1.06 },
      { rel: 3, pos: [-8.85, 0.0, 0], headY: 2.78, medRadius: 0.98 }
    ];

    const vestPalette = ['#6A4D1F', '#1F4B6A', '#4A2B26', '#2B4A38'];

    for (const cfg of seatPositions) {
      const seatIdx = (viewerIdx + cfg.rel) % 4;
      const seat = state.seats[seatIdx];
      if (!seat) continue;

      const isActive = state.phase === 'playing' && state.currentSeat === seatIdx;
      const teamColor = teamMode === 'paired'
        ? seat.teamIndex === 0
          ? '#F4C44E'
          : '#56B4E9'
        : '#C59A4B';

      const holder = new THREE.Group();
      holder.position.set(...cfg.pos);
      holder.lookAt(0, 0, 0);

      const vestColor = teamMode === 'paired'
        ? (seat.teamIndex === 0 ? '#72501B' : '#1E4C6C')
        : vestPalette[seatIdx % vestPalette.length];

      const character = this.buildPlayerCharacterModel({
        vestColor,
        teamColor,
        isActive
      });
      holder.add(character);

      this.dynamicGroup.add(holder);
      holder.updateMatrixWorld(true);

      const headY = cfg.headY;
      const medRadius = cfg.medRadius;
      const headGeoms = this.getHeadGeoms(medRadius);
      const headGroup = new THREE.Group();
      headGroup.position.set(0, headY, 0);
      holder.add(headGroup);
      headGroup.updateMatrixWorld(true);
      headGroup.lookAt(0, headY, 0);

      const ringMat = this.getCachedMat(`bezel-${isActive}-${teamColor}`, () =>
        new THREE.MeshStandardMaterial({
          color: isActive ? '#F4C44E' : teamColor,
          emissive: isActive ? '#9A6F14' : '#000000',
          roughness: 0.28,
          metalness: 0.72
        })
      );

      const bezel = new THREE.Mesh(headGeoms.bezel, ringMat);
      bezel.rotation.x = Math.PI / 2;
      bezel.castShadow = true;
      headGroup.add(bezel);

      const avatarKey = String(seat.avatar || 'avatar-1');
      let avatarMat = this.avatarMatCache.get(avatarKey);
      if (!avatarMat) {
        avatarMat = new THREE.MeshBasicMaterial({
          map: getAvatarTexture(avatarKey)
        });
        this.avatarMatCache.set(avatarKey, avatarMat);
      }
      const frontDisc = new THREE.Mesh(headGeoms.frontDisc, avatarMat);
      frontDisc.position.z = 0.115;
      headGroup.add(frontDisc);

      const rearDisc = new THREE.Mesh(headGeoms.rearDisc, this.rearCapMat);
      rearDisc.rotation.y = Math.PI;
      rearDisc.position.z = -0.114;
      headGroup.add(rearDisc);

      if (isActive) {
        const haloMat = this.getCachedMat('active-halo', () =>
          new THREE.MeshBasicMaterial({
            color: '#FFE082',
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
          })
        );
        const halo = new THREE.Mesh(headGeoms.halo, haloMat);
        halo.position.z = 0.04;
        headGroup.add(halo);
      }

      const spriteMat = this.getNameplateMat(seat, isActive, teamMode);
      const nameplate = new THREE.Sprite(spriteMat);
      nameplate.position.set(0, headY + medRadius + 0.62, 0);
      nameplate.scale.set(3.25, 0.8, 1);
      nameplate.renderOrder = 20;
      holder.add(nameplate);
    }
  }

  setRoomOrders(orders, viewerIdx = 0) {
    this.currentOrders = orders || null;
    this.currentViewerIdx = Number.isFinite(viewerIdx) ? viewerIdx : 0;
    this.renderTableOrders();
  }

  addSteamEffect(parentGroup, baseY = 0.48) {
    for (let i = 0; i < 3; i += 1) {
      const puffMat = new THREE.MeshBasicMaterial({
        color: '#FFF8EC',
        transparent: true,
        opacity: 0.32,
        depthWrite: false
      });
      const puff = new THREE.Mesh(this.steamPuffGeom, puffMat);
      puff.position.set((i - 1) * 0.04, baseY + i * 0.16, 0);
      parentGroup.add(puff);
      this.steamParticles.push({
        mesh: puff,
        baseX: puff.position.x,
        baseY,
        phase: i * 0.33
      });
    }
  }

  buildOrderMesh(itemId) {
    const g = new THREE.Group();
    const porcelainMat = new THREE.MeshStandardMaterial({ color: '#F6F2EA', roughness: 0.18 });
    const brassMat = new THREE.MeshStandardMaterial({ color: '#C79B42', roughness: 0.28, metalness: 0.78 });
    const silverMat = new THREE.MeshStandardMaterial({ color: '#D4DCE2', roughness: 0.22, metalness: 0.85 });

    if (itemId === 'cay' || itemId === 'oralet') {
      const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.28, 0.04, 24), porcelainMat);
      saucer.position.y = 0.02;
      g.add(saucer);

      const saucerAccent = new THREE.Mesh(
        new THREE.RingGeometry(0.28, 0.35, 24),
        new THREE.MeshBasicMaterial({ color: '#B32428', side: THREE.DoubleSide })
      );
      saucerAccent.rotation.x = -Math.PI / 2;
      saucerAccent.position.y = 0.042;
      g.add(saucerAccent);

      // Ince belli lathe liquid + glass profile
      const liquidColor = itemId === 'oralet' ? '#F27D16' : '#8F1E09';
      const liquidPts = [
        new THREE.Vector2(0.01, 0.05),
        new THREE.Vector2(0.14, 0.05),
        new THREE.Vector2(0.18, 0.16),
        new THREE.Vector2(0.13, 0.28),
        new THREE.Vector2(0.17, 0.38),
        new THREE.Vector2(0.01, 0.38)
      ];
      const liquid = new THREE.Mesh(
        new THREE.LatheGeometry(liquidPts, 20),
        new THREE.MeshStandardMaterial({
          color: liquidColor,
          emissive: itemId === 'oralet' ? '#5A2400' : '#260500',
          roughness: 0.12
        })
      );
      g.add(liquid);

      const glassPts = [
        new THREE.Vector2(0.145, 0.045),
        new THREE.Vector2(0.19, 0.16),
        new THREE.Vector2(0.14, 0.28),
        new THREE.Vector2(0.205, 0.45)
      ];
      const glass = new THREE.Mesh(
        new THREE.LatheGeometry(glassPts, 20),
        new THREE.MeshStandardMaterial({
          color: '#FFFFFF',
          transparent: true,
          opacity: 0.38,
          roughness: 0.08,
          side: THREE.DoubleSide
        })
      );
      g.add(glass);

      const spoon = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.015), silverMat);
      spoon.position.set(0.09, 0.32, 0);
      spoon.rotation.z = -0.26;
      g.add(spoon);

      const sugar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.08), porcelainMat);
      sugar.position.set(-0.22, 0.07, 0.12);
      g.add(sugar);

      this.addSteamEffect(g, 0.5);
    } else if (itemId === 'kahve') {
      const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.04, 24), brassMat);
      saucer.position.y = 0.02;
      g.add(saucer);

      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.14, 0.28, 20), porcelainMat);
      cup.position.y = 0.18;
      g.add(cup);

      const foam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.19, 0.03, 18),
        new THREE.MeshStandardMaterial({ color: '#4E2B17', roughness: 0.45 })
      );
      foam.position.y = 0.31;
      g.add(foam);

      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.024, 8, 16, Math.PI), porcelainMat);
      handle.rotation.z = -Math.PI / 2;
      handle.position.set(0.2, 0.19, 0);
      g.add(handle);

      const lokum = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.09, 0.11),
        new THREE.MeshStandardMaterial({ color: '#D85E7A', roughness: 0.5 })
      );
      lokum.position.set(-0.24, 0.085, 0.12);
      g.add(lokum);

      this.addSteamEffect(g, 0.38);
    } else if (itemId === 'gazoz') {
      const bottlePts = [
        new THREE.Vector2(0.01, 0.0),
        new THREE.Vector2(0.18, 0.0),
        new THREE.Vector2(0.18, 0.42),
        new THREE.Vector2(0.09, 0.62),
        new THREE.Vector2(0.08, 0.78),
        new THREE.Vector2(0.095, 0.81),
        new THREE.Vector2(0.01, 0.81)
      ];
      const bottle = new THREE.Mesh(
        new THREE.LatheGeometry(bottlePts, 20),
        new THREE.MeshStandardMaterial({
          color: '#88C8A8',
          transparent: true,
          opacity: 0.78,
          roughness: 0.1
        })
      );
      g.add(bottle);

      const label = new THREE.Mesh(
        new THREE.CylinderGeometry(0.184, 0.184, 0.22, 20),
        new THREE.MeshStandardMaterial({ color: '#E83D32', roughness: 0.45 })
      );
      label.position.y = 0.24;
      g.add(label);

      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 16), brassMat);
      cap.position.y = 0.83;
      g.add(cap);
    } else if (itemId === 'tost') {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.42, 0.05, 24), porcelainMat);
      plate.position.y = 0.025;
      g.add(plate);

      const breadMat = new THREE.MeshStandardMaterial({ color: '#C6843E', roughness: 0.75 });
      const cheeseMat = new THREE.MeshStandardMaterial({ color: '#F5C43D', roughness: 0.45 });
      for (const offset of [-0.14, 0.14]) {
        const toast = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.44), breadMat);
        toast.position.set(offset, 0.13, offset * 0.4);
        toast.rotation.y = offset * 1.4;
        g.add(toast);

        const cheese = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.04, 0.46), cheeseMat);
        cheese.position.set(offset, 0.13, offset * 0.4);
        cheese.rotation.y = offset * 1.4;
        g.add(cheese);
      }
      this.addSteamEffect(g, 0.26);
    } else if (itemId === 'simit') {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.44, 0.04, 24), porcelainMat);
      plate.position.y = 0.02;
      g.add(plate);

      const simit = new THREE.Mesh(
        new THREE.TorusGeometry(0.28, 0.095, 12, 24),
        new THREE.MeshStandardMaterial({ color: '#B8722B', roughness: 0.65 })
      );
      simit.rotation.x = Math.PI / 2;
      simit.position.y = 0.13;
      g.add(simit);

      const cheese = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.09, 0.16),
        new THREE.MeshStandardMaterial({ color: '#FBF8F0', roughness: 0.4 })
      );
      cheese.position.set(0, 0.085, 0);
      g.add(cheese);
    } else if (itemId === 'baklava') {
      const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.42, 0.04, 8), brassMat);
      tray.position.y = 0.02;
      g.add(tray);

      const phylloMat = new THREE.MeshStandardMaterial({ color: '#D49A3A', roughness: 0.42 });
      const pistachioMat = new THREE.MeshStandardMaterial({ color: '#6AA33E', roughness: 0.7 });
      for (const ox of [-0.14, 0.14]) {
        const piece = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.13, 0.3), phylloMat);
        piece.position.set(ox, 0.1, 0);
        piece.rotation.y = 0.35;
        g.add(piece);

        const nut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.12), pistachioMat);
        nut.position.set(ox, 0.175, 0);
        g.add(nut);
      }
    } else {
      // 'cerez' bowl
      const bowlPts = [
        new THREE.Vector2(0.01, 0.0),
        new THREE.Vector2(0.24, 0.0),
        new THREE.Vector2(0.42, 0.18),
        new THREE.Vector2(0.44, 0.26),
        new THREE.Vector2(0.39, 0.26),
        new THREE.Vector2(0.22, 0.06),
        new THREE.Vector2(0.01, 0.06)
      ];
      const bowl = new THREE.Mesh(
        new THREE.LatheGeometry(bowlPts, 20),
        new THREE.MeshStandardMaterial({ color: '#B86535', roughness: 0.3, metalness: 0.72 })
      );
      g.add(bowl);

      const nutColors = ['#D2A663', '#8C5832', '#7BA049', '#E0B972'];
      for (let i = 0; i < 14; i += 1) {
        const ang = (i * 2.399) % (Math.PI * 2);
        const rad = 0.08 + ((i * 19) % 100) / 420;
        const nut = new THREE.Mesh(
          new THREE.SphereGeometry(0.065, 8, 8),
          new THREE.MeshStandardMaterial({ color: nutColors[i % nutColors.length], roughness: 0.65 })
        );
        nut.scale.set(1.2, 0.85, 0.95);
        nut.position.set(Math.cos(ang) * rad, 0.14 + (i % 3) * 0.035, Math.sin(ang) * rad);
        g.add(nut);
      }
    }

    return g;
  }

  disposeOrderObject(root) {
    root.traverse((obj) => {
      if (obj.geometry && obj.geometry !== this.steamPuffGeom) {
        obj.geometry.dispose();
      }
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          m?.dispose?.();
        }
      }
    });
  }

  renderTableOrders() {
    while (this.orderGroup.children.length > 0) {
      const child = this.orderGroup.children.pop();
      this.orderGroup.remove(child);
      this.disposeOrderObject(child);
    }
    this.steamParticles = [];

    if (!Array.isArray(this.currentOrders)) return;

    const slotsByRel = [
      { drink: [7.55, 0.01, 7.85], food: [6.4, 0.01, 8.1] },
      { drink: [7.85, 0.01, -7.55], food: [8.1, 0.01, -6.4] },
      { drink: [-7.55, 0.01, -7.85], food: [-6.4, 0.01, -8.1] },
      { drink: [-7.85, 0.01, 7.55], food: [-8.1, 0.01, 6.4] }
    ];

    for (let rel = 0; rel < 4; rel += 1) {
      const seatIdx = (this.currentViewerIdx + rel) % 4;
      const seatOrders = this.currentOrders[seatIdx];
      if (!seatOrders) continue;
      const anchor = slotsByRel[rel];

      if (seatOrders.drink?.itemId) {
        const mesh = this.buildOrderMesh(seatOrders.drink.itemId);
        mesh.position.set(...anchor.drink);
        this.orderGroup.add(mesh);
      }
      if (seatOrders.food?.itemId) {
        const mesh = this.buildOrderMesh(seatOrders.food.itemId);
        mesh.position.set(...anchor.food);
        this.orderGroup.add(mesh);
      }
    }
  }

  buildDemoSetup() {
    this.clearDynamic();
    const demoOkey = { color: 'red', number: 8 };
    const sampleTiles = [
      { id: 'd1', color: 'red', number: 10 },
      { id: 'd2', color: 'red', number: 11 },
      { id: 'd3', color: 'red', number: 12 },
      { id: 'd4', color: 'red', number: 13 },
      { id: 'd5', color: 'blue', number: 7 },
      { id: 'd6', color: 'black', number: 7 },
      { id: 'd7', color: 'yellow', number: 7 },
      { id: 'd8', color: 'red', number: 8 },
      { id: 'd9', color: 'blue', number: 3 },
      { id: 'd10', color: 'blue', number: 4 },
      { id: 'd11', color: 'blue', number: 5 }
    ];

    sampleTiles.forEach((tile, idx) => {
      const mesh = this.createTileMesh(tile, { faceUp: true, okeyTarget: demoOkey });
      const pos = this.getLocalRackSlotPosition(idx + 15);
      mesh.position.copy(pos);
      this.southRackGroup.add(mesh);
      this.dynamicGroup.userData.rackMeshes = this.dynamicGroup.userData.rackMeshes || [];
      this.dynamicGroup.userData.rackMeshes.push(mesh);
    });

    for (let i = 0; i < 6; i += 1) {
      const tMesh = this.createTileMesh({ id: `ds-${i}`, color: 'red', number: 1 }, { faceUp: false });
      tMesh.rotation.x = -Math.PI / 2;
      tMesh.position.set(-0.65, 0.085 + i * (TILE_D + 0.004), -3.85);
      this.dynamicGroup.add(tMesh);
    }

    const gostergeMesh = this.createTileMesh({ id: 'dg', color: 'red', number: 7 }, { faceUp: true, okeyTarget: demoOkey });
    gostergeMesh.rotation.x = -Math.PI / 2;
    gostergeMesh.position.set(0.65, 0.17, -3.85);
    this.dynamicGroup.add(gostergeMesh);
  }

  cancelActiveInteractions() {
    if (this.activePointerId != null) {
      try {
        if (this.canvas.hasPointerCapture?.(this.activePointerId)) {
          this.canvas.releasePointerCapture(this.activePointerId);
        }
      } catch {
        // Ignore pointer capture release errors
      }
      this.activePointerId = null;
    }
    this.orbitDrag = null;
    if (this.dragState?.floatingMesh) {
      this.scene.remove(this.dragState.floatingMesh);
    }
    if (this.dragState?.mesh) {
      this.dragState.mesh.visible = true;
    }
    this.dragState = null;
    this.dragTargetPos = null;
    this.dragTargetQuat = null;
    this.dragTargetScale = null;
    this.canvas.style.cursor = 'default';
    this.setRightDiscardHighlight(false, false);
    this.rackSlotMeshes.forEach((m) => {
      m.material.opacity = 0;
    });
  }

  clearDynamic({ preserveInteraction = false } = {}) {
    if (!preserveInteraction) {
      this.cancelActiveInteractions();
    }

    while (this.dynamicGroup.children.length > 0) {
      const child = this.dynamicGroup.children.pop();
      this.dynamicGroup.remove(child);
    }
    if (this.dynamicGroup.userData.rackMeshes) {
      for (const m of this.dynamicGroup.userData.rackMeshes) {
        this.southRackGroup.remove(m);
      }
      this.dynamicGroup.userData.rackMeshes = [];
    }
    this.interactables = [];
    this.rackTileMeshes = new Map();
    this.trackedMeshes = new Map();
    this.discardTopMeshes = new Map();
    this.meldTileMeshes = new Map();
    this.tileAnimations = [];
  }

  captureTileSnapshot() {
    this.scene.updateMatrixWorld(true);
    const tileTransforms = new Map();
    const discardTopBySeat = new Map();

    for (const [tileId, mesh] of this.trackedMeshes.entries()) {
      if (!mesh || !mesh.parent) continue;
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      mesh.getWorldPosition(pos);
      mesh.getWorldQuaternion(quat);
      mesh.getWorldScale(scale);
      tileTransforms.set(tileId, { pos, quat, scale });
    }

    if (
      this.lastDraggedTransform &&
      performance.now() < this.lastDraggedTransform.expiresAt
    ) {
      tileTransforms.set(this.lastDraggedTransform.tileId, {
        pos: this.lastDraggedTransform.pos.clone(),
        quat: this.lastDraggedTransform.quat.clone(),
        scale: this.lastDraggedTransform.scale.clone()
      });
    }

    for (const [seatIdx, mesh] of this.discardTopMeshes.entries()) {
      if (!mesh || !mesh.parent) continue;
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      mesh.getWorldPosition(pos);
      mesh.getWorldQuaternion(quat);
      mesh.getWorldScale(scale);
      discardTopBySeat.set(seatIdx, { pos, quat, scale });
    }

    return {
      tileTransforms,
      discardTopBySeat,
      prevDiscardTopIds: [...this.lastDiscardTopIds],
      prevTableTileIds: new Set(this.lastTableTileIds),
      prevHandIds: new Set(this.lastHandIds)
    };
  }

  getOpponentOriginWorld(rel) {
    const origins = [
      new THREE.Vector3(0, 1.35, 6.85),
      new THREE.Vector3(6.85, 1.35, 0),
      new THREE.Vector3(0, 1.35, -6.85),
      new THREE.Vector3(-6.85, 1.35, 0)
    ];
    return origins[rel % 4].clone();
  }

  enqueueAnimationFromWorld(mesh, startWorldPos, startWorldQuat, startWorldScale, opts = {}) {
    if (this.reducedMotion || !mesh || !mesh.parent || !startWorldPos) return;

    mesh.parent.updateMatrixWorld(true);
    const targetPos = mesh.position.clone();
    const targetQuat = mesh.quaternion.clone();
    const targetScale = mesh.scale.clone();

    const startLocalPos = mesh.parent.worldToLocal(startWorldPos.clone());
    const parentQuat = new THREE.Quaternion();
    mesh.parent.getWorldQuaternion(parentQuat);
    const startLocalQuat = startWorldQuat
      ? parentQuat.clone().invert().multiply(startWorldQuat.clone())
      : targetQuat.clone();

    let startLocalScale = targetScale.clone();
    if (startWorldScale) {
      const parentScale = new THREE.Vector3();
      mesh.parent.getWorldScale(parentScale);
      startLocalScale = new THREE.Vector3(
        startWorldScale.x / (parentScale.x || 1),
        startWorldScale.y / (parentScale.y || 1),
        startWorldScale.z / (parentScale.z || 1)
      );
    }

    const moveDist = startLocalPos.distanceTo(targetPos);
    const rotDiff = 1 - Math.abs(startLocalQuat.dot(targetQuat));
    if (moveDist < 0.015 && rotDiff < 0.002) {
      return;
    }

    mesh.position.copy(startLocalPos);
    mesh.quaternion.copy(startLocalQuat);
    mesh.scale.copy(startLocalScale);

    this.tileAnimations.push({
      mesh,
      startPos: startLocalPos,
      targetPos,
      startQuat: startLocalQuat,
      targetQuat,
      startScale: startLocalScale,
      targetScale,
      elapsed: 0,
      delay: opts.delay || 0,
      duration: opts.duration || 0.36,
      arcHeight: opts.arcHeight ?? 0.35
    });
  }

  syncHandToSlots(serverHand) {
    if (!Array.isArray(serverHand)) {
      this.handSlotData.fill(null);
      return;
    }

    const serverById = new Map(serverHand.map((t) => [t.id, t]));
    const placedIds = new Set();

    for (let i = 0; i < this.handSlotData.length; i += 1) {
      const existing = this.handSlotData[i];
      if (existing && serverById.has(existing.id)) {
        this.handSlotData[i] = serverById.get(existing.id);
        placedIds.add(existing.id);
      } else {
        this.handSlotData[i] = null;
      }
    }

    // Place newly drawn tiles starting on bottom row first, then top row
    const slotOrder = [];
    for (let c = 0; c < RACK_COLS; c += 1) slotOrder.push(RACK_COLS + c);
    for (let c = 0; c < RACK_COLS; c += 1) slotOrder.push(c);

    for (const tile of serverHand) {
      if (placedIds.has(tile.id)) continue;
      let emptyIdx = slotOrder.find((idx) => this.handSlotData[idx] === null);
      if (emptyIdx === undefined) emptyIdx = 0;
      this.handSlotData[emptyIdx] = tile;
      placedIds.add(tile.id);
    }

    for (const id of [...this.selectedTileIds]) {
      if (!serverById.has(id)) {
        this.selectedTileIds.delete(id);
      }
    }
    for (const id of [...this.flippedTileIds]) {
      if (!serverById.has(id)) {
        this.flippedTileIds.delete(id);
      }
    }
  }

  arrangeHandOrder(orderedTiles) {
    this.handSlotData.fill(null);
    orderedTiles.forEach((tile, idx) => {
      if (idx < this.handSlotData.length) {
        this.handSlotData[idx] = tile;
      }
    });
    if (this.currentState) {
      this.renderGameState(this.currentState, { skipSlotSync: true });
    }
  }

  getSelectedTiles() {
    const tiles = [];
    for (const item of this.handSlotData) {
      if (item && this.selectedTileIds.has(item.id)) {
        tiles.push(item);
      }
    }
    return tiles;
  }

  clearSelection() {
    this.selectedTileIds.clear();
    if (this.currentState) {
      this.renderGameState(this.currentState, { skipSlotSync: true });
    }
  }

  setSelectionByIds(ids) {
    this.selectedTileIds = new Set(ids);
    if (this.currentState) {
      this.renderGameState(this.currentState, { skipSlotSync: true });
    }
  }

  renderGameState(state, { skipSlotSync = false, instant = false } = {}) {
    const sameRound = Boolean(state && this.lastRenderedRound === state.roundNumber);
    const snapshot = !instant && !this.reducedMotion && state && sameRound
      ? this.captureTileSnapshot()
      : null;

    if (!sameRound) {
      this.flippedTileIds.clear();
      this.selectedTileIds.clear();
      this.lastTileTap = null;
      if (!skipSlotSync) {
        this.handSlotData.fill(null);
      }
    }

    const viewerIdx = state?.viewerSeatIndex ?? 0;
    const mySeat = state?.seats?.[viewerIdx];
    const activeDragTileId = this.dragState?.tile?.id || null;
    const canPreserveInteraction = Boolean(
      state &&
      sameRound &&
      (
        this.orbitDrag ||
        (activeDragTileId && Array.isArray(mySeat?.hand) && mySeat.hand.some((t) => t.id === activeDragTileId))
      )
    );

    const wasDemo = this.demoMode;
    this.demoMode = false;
    this.currentState = state;
    this.clearDynamic({ preserveInteraction: canPreserveInteraction });

    if (!state) {
      this.demoMode = true;
      this.handSlotData.fill(null);
      this.lastRenderedRound = null;
      this.lastHandIds = new Set();
      this.lastTableTileIds = new Set();
      this.lastDiscardTopIds = [null, null, null, null];
      this.setCameraPreset('table');
      this.buildDemoSetup();
      return;
    }

    if (wasDemo) {
      this.setCameraPreset('fp');
    }

    const isMyTurn = state.phase === 'playing' && state.currentSeat === viewerIdx;
    const isFreshRoundDeal = !sameRound && !instant && !this.reducedMotion && state.phase === 'playing';
    this.lastRenderedRound = state.roundNumber;

    if (!skipSlotSync && mySeat?.hand) {
      this.syncHandToSlots(mySeat.hand);
    }

    const deckTopWorldPos = new THREE.Vector3(-0.68, 0.35, -3.9);
    const deckTopQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const flatTileQuat = deckTopQuat.clone();

    const rackMeshes = [];
    this.dynamicGroup.userData.rackMeshes = rackMeshes;
    const newHandIds = new Set();
    let dealIdx = 0;

    // 1. Render South rack tiles (Your hand)
    for (let slotIdx = 0; slotIdx < this.handSlotData.length; slotIdx += 1) {
      const tile = this.handSlotData[slotIdx];
      if (!tile) continue;
      newHandIds.add(tile.id);

      const isSelected = this.selectedTileIds.has(tile.id);
      const isFlipped = this.flippedTileIds.has(tile.id);
      const mustUse = state.pickedDiscardTileId === tile.id;
      const mesh = this.createTileMesh(tile, {
        faceUp: true,
        okeyTarget: state.okeyTarget,
        selected: isSelected,
        mustUse
      });
      const basePos = this.getLocalRackSlotPosition(slotIdx);
      mesh.position.set(basePos.x, basePos.y + (isSelected ? 0.14 : 0), basePos.z + (isSelected ? 0.05 : 0));
      mesh.rotation.y = isFlipped ? Math.PI : 0;
      mesh.userData = {
        kind: 'handTile',
        tile,
        slotIdx
      };
      this.southRackGroup.add(mesh);
      rackMeshes.push(mesh);
      this.interactables.push(mesh);
      this.rackTileMeshes.set(tile.id, mesh);
      this.trackedMeshes.set(tile.id, mesh);

      const isActiveDraggedTile = Boolean(this.dragState && this.dragState.tile.id === tile.id);
      if (isActiveDraggedTile) {
        this.dragState.tile = tile;
        this.dragState.fromSlotIdx = slotIdx;
        this.dragState.mesh = mesh;
        if (this.dragState.moved) {
          mesh.visible = false;
        }
      }

      if (isFreshRoundDeal) {
        this.enqueueAnimationFromWorld(mesh, deckTopWorldPos, deckTopQuat, null, {
          duration: 0.42,
          arcHeight: 0.65,
          delay: dealIdx * 0.016
        });
        dealIdx += 1;
      } else if (snapshot && !(isActiveDraggedTile && this.dragState?.moved)) {
        const prev = snapshot.tileTransforms.get(tile.id);
        if (prev) {
          this.southRackGroup.updateMatrixWorld(true);
          const targetWorld = mesh.getWorldPosition(new THREE.Vector3());
          const targetQuat = mesh.getWorldQuaternion(new THREE.Quaternion());
          const moveDist = prev.pos.distanceTo(targetWorld);
          const rotDiff = 1 - Math.abs(prev.quat.dot(targetQuat));
          const wasDragged = Boolean(
            this.lastDraggedTransform && this.lastDraggedTransform.tileId === tile.id
          );
          const isFlipAnim = rotDiff >= 0.05;
          const isDropAnim = wasDragged || moveDist >= 0.32;
          this.enqueueAnimationFromWorld(mesh, prev.pos, prev.quat, prev.scale, {
            duration: isFlipAnim ? 0.3 : isDropAnim ? 0.28 : 0.14,
            arcHeight: isFlipAnim ? 0.26 : isDropAnim ? 0.18 : 0
          });
        } else {
          // Newly drawn or swapped into hand
          const leftSeatIdx = (viewerIdx + 3) % 4;
          const isLeftDiscardDraw = state.lastEvent?.type === 'draw_discard';
          const leftSnap = snapshot.discardTopBySeat.get(leftSeatIdx);
          const startPos = isLeftDiscardDraw
            ? (leftSnap?.pos || this.discardZoneCoords[3].clone().setY(0.25))
            : deckTopWorldPos;
          const startQuat = isLeftDiscardDraw ? (leftSnap?.quat || flatTileQuat) : deckTopQuat;
          this.enqueueAnimationFromWorld(mesh, startPos, startQuat, null, {
            duration: 0.44,
            arcHeight: isLeftDiscardDraw ? 0.65 : 0.92
          });
        }
      }
    }
    this.lastHandIds = newHandIds;
    this.lastDraggedTransform = null;

    // 2. Render uniform concealed covers on Opponent racks so remaining tile counts stay hidden
    const oppConfigs = [
      { rel: 1, pos: [6.85, 0.22, 0], rotY: Math.PI / 2 },
      { rel: 2, pos: [0, 0.22, -6.85], rotY: Math.PI },
      { rel: 3, pos: [-6.85, 0.22, 0], rotY: -Math.PI / 2 }
    ];

    for (const cfg of oppConfigs) {
      const rackHolder = new THREE.Group();
      rackHolder.position.set(...cfg.pos);
      rackHolder.rotation.y = cfg.rotY;

      const tilt = new THREE.Group();
      tilt.rotation.x = -0.32;
      rackHolder.add(tilt);

      const shield = new THREE.Mesh(this.oppShieldGeom, this.coverWoodMat);
      shield.position.set(0, 1.15, 0.02);
      shield.castShadow = true;
      shield.receiveShadow = true;
      tilt.add(shield);

      const topTrim = new THREE.Mesh(this.oppTrimGeom, this.coverBrassMat);
      topTrim.position.set(0, 2.16, 0.02);
      tilt.add(topTrim);

      this.dynamicGroup.add(rackHolder);
    }

    // 3. Render 3D Seated Player Models, Enlarged Table-Facing PFPs & Nameplates
    this.renderPlayerHeads(state, viewerIdx);

    // 4. Render Center Draw Deck & Gösterge
    const deckCount = state.deckCount || 0;
    const stackLayers = Math.max(1, Math.min(8, Math.ceil(deckCount / 6)));
    const deckGroup = new THREE.Group();
    deckGroup.position.set(-0.68, 0.02, -3.9);

    if (deckCount > 0) {
      for (let i = 0; i < stackLayers; i += 1) {
        const layer = this.createTileMesh(
          { id: `deck-${i}`, color: 'black', number: 1 },
          { faceUp: false }
        );
        layer.rotation.x = -Math.PI / 2;
        layer.position.y = 0.075 + i * (TILE_D + 0.004);
        layer.userData = { kind: 'drawDeck' };
        deckGroup.add(layer);
        if (i === stackLayers - 1) {
          this.interactables.push(layer);
        }
      }

      if (isMyTurn && state.turnPhase === 'draw') {
        const glowRing = new THREE.Mesh(this.deckGlowRingGeom, this.deckGlowRingMat);
        glowRing.rotation.x = -Math.PI / 2;
        glowRing.position.y = 0.02;
        deckGroup.add(glowRing);
      }
    }
    this.dynamicGroup.add(deckGroup);

    if (state.gosterge) {
      const gStand = new THREE.Mesh(this.gStandGeom, this.gStandMat);
      gStand.position.set(0.68, 0.08, -3.9);
      gStand.castShadow = true;
      this.dynamicGroup.add(gStand);

      const gMesh = this.createTileMesh(state.gosterge, {
        faceUp: true,
        okeyTarget: state.okeyTarget
      });
      gMesh.rotation.x = -Math.PI / 2;
      gMesh.position.set(0.68, 0.21, -3.9);
      this.dynamicGroup.add(gMesh);
    }

    // 5. Render 4 Corner Discard Piles + right discard tray visual state
    const canDiscardNow = isMyTurn && state.turnPhase === 'play';
    if (this.rightDiscardPadMesh) {
      this.rightDiscardPadMesh.material = this.discardPadMatIdle;
    }
    if (this.rightDiscardRingMat) {
      this.rightDiscardRingMat.opacity = canDiscardNow ? 0.35 : 0.0;
    }

    const nextDiscardTopIds = [null, null, null, null];
    for (let rel = 0; rel < 4; rel += 1) {
      const seatIdx = (viewerIdx + rel) % 4;
      const pileInfo = state.discardPiles[seatIdx];
      const baseCoord = this.discardZoneCoords[rel];

      if (pileInfo && pileInfo.count > 0 && pileInfo.topTile) {
        nextDiscardTopIds[seatIdx] = pileInfo.topTile.id;
        const layers = Math.min(4, pileInfo.count);
        for (let i = 0; i < layers; i += 1) {
          const isTop = i === layers - 1;
          const tMesh = this.createTileMesh(pileInfo.topTile, {
            faceUp: isTop,
            okeyTarget: state.okeyTarget
          });
          tMesh.rotation.x = -Math.PI / 2;
          tMesh.position.set(baseCoord.x, 0.095 + i * (TILE_D + 0.004), baseCoord.z);
          if (
            isTop &&
            rel === 3 &&
            isMyTurn &&
            state.turnPhase === 'draw' &&
            !isOkeyTile(pileInfo.topTile, state.okeyTarget)
          ) {
            tMesh.userData = { kind: 'leftDiscard' };
            this.interactables.push(tMesh);

            const ring = new THREE.Mesh(this.leftDiscardRingGeom, this.leftDiscardRingMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(baseCoord.x, 0.05, baseCoord.z);
            this.dynamicGroup.add(ring);
          }
          this.dynamicGroup.add(tMesh);

          if (isTop) {
            this.discardTopMeshes.set(seatIdx, tMesh);
            if (snapshot && pileInfo.topTile.id !== snapshot.prevDiscardTopIds[seatIdx]) {
              const fromRack = snapshot.tileTransforms.get(pileInfo.topTile.id);
              if (fromRack) {
                this.enqueueAnimationFromWorld(tMesh, fromRack.pos, fromRack.quat, fromRack.scale, {
                  duration: 0.4,
                  arcHeight: 0.9
                });
              } else {
                const startOrigin = this.getOpponentOriginWorld(rel);
                this.enqueueAnimationFromWorld(tMesh, startOrigin, null, null, {
                  duration: 0.42,
                  arcHeight: 0.85
                });
              }
            }
          }
        }
      }
    }
    this.lastDiscardTopIds = nextDiscardTopIds;

    // 6. Render Opened Table Melds
    this.renderTableMelds(state, mySeat, isMyTurn, snapshot, viewerIdx);
  }

  renderTableMelds(state, mySeat, isMyTurn, snapshot = null, viewerIdx = 0) {
    const melds = state.tableMelds || [];
    const nextTableTileIds = new Set();
    if (melds.length === 0) {
      this.lastTableTileIds = nextTableTileIds;
      return;
    }

    const selected = this.getSelectedTiles();
    const canTryLayoff =
      isMyTurn && state.turnPhase === 'play' && mySeat?.opened && selected.length === 1;
    const singleSelectedTile = canTryLayoff ? selected[0] : null;

    const meldTileScale = 0.74;
    const tileStep = TILE_W * meldTileScale + 0.03;
    const groupGap = 0.42;
    const maxRowWidth = 9.2;
    const startZ = -2.35;
    const rowStepZ = 0.88;

    let cursorX = -maxRowWidth / 2;
    let cursorZ = startZ;
    let meldAnimIdx = 0;

    for (const meld of melds) {
      const groupWidth = meld.slots.length * tileStep;
      if (cursorX + groupWidth > maxRowWidth / 2) {
        cursorX = -maxRowWidth / 2;
        cursorZ += rowStepZ;
      }

      const isLayoffTarget =
        singleSelectedTile &&
        canLayoffTile(singleSelectedTile, meld, state.okeyTarget).valid;

      const tray = new THREE.Mesh(
        this.meldTrayGeomUnit,
        isLayoffTarget ? this.meldTrayMatLayoff : this.meldTrayMatDefault
      );
      tray.scale.set(groupWidth + 0.16, 1, 1);
      tray.position.set(cursorX + groupWidth / 2 - tileStep / 2 + 0.02, 0.03, cursorZ);
      tray.userData = { kind: 'tableMeld', meldId: meld.id, isLayoffTarget };
      this.dynamicGroup.add(tray);
      if (isLayoffTarget) {
        this.interactables.push(tray);
      }

      meld.slots.forEach((slot, sIdx) => {
        nextTableTileIds.add(slot.tile.id);
        const mesh = this.createTileMesh(slot.tile, {
          faceUp: true,
          okeyTarget: state.okeyTarget
        });
        mesh.scale.setScalar(meldTileScale);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(cursorX + sIdx * tileStep, 0.095, cursorZ);
        mesh.userData = { kind: 'tableMeld', meldId: meld.id, isLayoffTarget };
        this.dynamicGroup.add(mesh);
        this.trackedMeshes.set(slot.tile.id, mesh);
        if (isLayoffTarget) {
          this.interactables.push(mesh);
        }

        if (snapshot) {
          const prev = snapshot.tileTransforms.get(slot.tile.id);
          if (prev) {
            const cameFromHand = snapshot.prevHandIds.has(slot.tile.id);
            this.enqueueAnimationFromWorld(mesh, prev.pos, prev.quat, prev.scale, {
              duration: cameFromHand ? 0.44 : 0.24,
              arcHeight: cameFromHand ? 0.85 : 0.08,
              delay: cameFromHand ? Math.min(0.26, meldAnimIdx * 0.026) : 0
            });
            if (cameFromHand) meldAnimIdx += 1;
          } else if (!snapshot.prevTableTileIds.has(slot.tile.id)) {
            const ownerRel = ((meld.ownerSeat ?? 0) - viewerIdx + 4) % 4;
            const oppOrigin = this.getOpponentOriginWorld(ownerRel);
            this.enqueueAnimationFromWorld(mesh, oppOrigin, null, null, {
              duration: 0.44,
              arcHeight: 0.85,
              delay: Math.min(0.26, meldAnimIdx * 0.024)
            });
            meldAnimIdx += 1;
          }
        }
      });

      cursorX += groupWidth + groupGap;
    }
    this.lastTableTileIds = nextTableTileIds;
  }

  setCameraPreset(presetName) {
    const preset = CAMERA_PRESETS[presetName] || CAMERA_PRESETS.fp;
    this.targetCamLook.copy(preset.target);
    this.targetSpherical.setFromVector3(preset.pos.clone().sub(preset.target));
    this.targetFov = preset.fov || 44;
  }

  isMyPlayTurn() {
    const viewerIdx = this.currentState?.viewerSeatIndex ?? 0;
    return Boolean(
      this.currentState?.phase === 'playing' &&
      this.currentState?.currentSeat === viewerIdx &&
      this.currentState?.turnPhase === 'play'
    );
  }

  isOverRightDiscardZone(dragPlanePt = null) {
    if (this.rightDiscardHitBox) {
      const boxHits = this.raycaster.intersectObject(this.rightDiscardHitBox, false);
      if (boxHits.length > 0) return true;
    }
    if (dragPlanePt) {
      const dx = Math.abs(dragPlanePt.x - 5.85);
      const dz = Math.abs(dragPlanePt.z - 6.25);
      if (dx <= 1.35 && dz <= 1.55) return true;
    }
    return false;
  }

  setRightDiscardHighlight(isHovering, isDragging) {
    const canDiscard = this.isMyPlayTurn();
    if (this.rightDiscardPadMesh) {
      this.rightDiscardPadMesh.material = canDiscard && isHovering
        ? this.discardPadMatActive
        : this.discardPadMatIdle;
    }
    if (this.rightDiscardRingMat) {
      if (!canDiscard) {
        this.rightDiscardRingMat.opacity = 0.0;
      } else if (isHovering) {
        this.rightDiscardRingMat.opacity = 1.0;
      } else if (isDragging) {
        this.rightDiscardRingMat.opacity = 0.72;
      } else {
        this.rightDiscardRingMat.opacity = 0.35;
      }
    }
  }

  updatePointer(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  startPhysicalDrag(drag) {
    drag.moved = true;
    soundFX.playTilePickup();
    this.canvas.style.cursor = 'grabbing';
    this.setRightDiscardHighlight(false, true);

    drag.mesh.visible = false;
    drag.mesh.updateMatrixWorld(true);
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    drag.mesh.getWorldPosition(worldPos);
    drag.mesh.getWorldQuaternion(worldQuat);

    const isFlipped = this.flippedTileIds.has(drag.tile.id);
    const floating = this.createTileMesh(drag.tile, {
      faceUp: true,
      okeyTarget: this.currentState?.okeyTarget,
      selected: true,
      mustUse: this.currentState?.pickedDiscardTileId === drag.tile.id
    });
    floating.position.copy(worldPos);
    floating.quaternion.copy(worldQuat);
    this.scene.add(floating);
    drag.floatingMesh = floating;

    this.dragTargetPos = worldPos.clone().add(new THREE.Vector3(0, 0.18, 0.24));
    this.dragTargetQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-0.36, isFlipped ? Math.PI : 0, 0, 'XYZ')
    );
    this.dragTargetScale = new THREE.Vector3(1.07, 1.07, 1.07);
  }

  bindEvents() {
    const releaseActivePointer = () => {
      if (this.activePointerId != null) {
        try {
          if (this.canvas.hasPointerCapture?.(this.activePointerId)) {
            this.canvas.releasePointerCapture(this.activePointerId);
          }
        } catch {
          // Ignore pointer capture release errors
        }
        this.activePointerId = null;
      }
    };

    this.onPointerDown = (e) => {
      if (this.demoMode) return;
      this.updatePointer(e.clientX, e.clientY);

      if (e.button === 2 || e.button === 1) {
        this.cancelActiveInteractions();
        this.orbitDrag = { x: e.clientX, y: e.clientY };
        try {
          this.canvas.setPointerCapture?.(e.pointerId);
          this.activePointerId = e.pointerId;
        } catch {
          // Ignore pointer capture errors
        }
        return;
      }

      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.interactables, false);
      if (hits.length === 0) return;

      const hit = hits[0].object;
      const data = hit.userData;

      if (data.kind === 'handTile') {
        this.cancelActiveInteractions();
        this.dragState = {
          tile: data.tile,
          fromSlotIdx: data.slotIdx,
          mesh: hit,
          floatingMesh: null,
          startX: e.clientX,
          startY: e.clientY,
          moved: false
        };
        try {
          this.canvas.setPointerCapture?.(e.pointerId);
          this.activePointerId = e.pointerId;
        } catch {
          // Ignore pointer capture errors
        }
      } else if (data.kind === 'drawDeck') {
        this.callbacks.onDrawDeck?.();
      } else if (data.kind === 'leftDiscard') {
        this.callbacks.onDrawDiscard?.();
      } else if (data.kind === 'tableMeld' && data.isLayoffTarget) {
        const selected = this.getSelectedTiles();
        if (selected.length === 1) {
          this.callbacks.onLayoffTile?.(selected[0].id, data.meldId);
        }
      }
    };

    this.onPointerMove = (e) => {
      if (this.orbitDrag) {
        const dx = e.clientX - this.orbitDrag.x;
        const dy = e.clientY - this.orbitDrag.y;
        this.orbitDrag = { x: e.clientX, y: e.clientY };

        this.targetSpherical.theta -= dx * 0.0055;
        this.targetSpherical.phi = THREE.MathUtils.clamp(
          this.targetSpherical.phi - dy * 0.0055,
          0.25,
          1.36
        );
        return;
      }

      if (this.dragState) {
        const dist = Math.hypot(
          e.clientX - this.dragState.startX,
          e.clientY - this.dragState.startY
        );
        if (dist > 5 && !this.dragState.moved) {
          this.startPhysicalDrag(this.dragState);
        }

        if (this.dragState.moved && this.dragState.floatingMesh) {
          this.updatePointer(e.clientX, e.clientY);
          this.raycaster.setFromCamera(this.pointer, this.camera);

          const slotHits = this.raycaster.intersectObjects(this.rackSlotMeshes, false);
          this.rackSlotMeshes.forEach((m) => {
            m.material.opacity = 0;
          });

          const isFlipped = this.flippedTileIds.has(this.dragState.tile.id);
          const rackPt = new THREE.Vector3();
          const hasRackHit =
            this.rackDragPlane &&
            this.southRackGroup &&
            this.raycaster.ray.intersectPlane(this.rackDragPlane, rackPt);

          let overRackPlane = false;
          let hoverSlotIdx = slotHits.length > 0 ? slotHits[0].object.userData.slotIdx : null;
          if (hasRackHit) {
            const localPt = this.southRackGroup.worldToLocal(rackPt.clone());
            if (
              slotHits.length > 0 ||
              (Math.abs(localPt.x) <= 5.15 && localPt.y >= -0.2 && localPt.y <= 2.7)
            ) {
              overRackPlane = true;
              if (hoverSlotIdx == null) {
                hoverSlotIdx = this.findNearestRackSlot(localPt);
              }
              const frontWorld = new THREE.Vector3(
                THREE.MathUtils.clamp(localPt.x, -4.95, 4.95),
                THREE.MathUtils.clamp(localPt.y, 0.25, 2.35),
                0.36
              ).applyMatrix4(this.southRackGroup.matrixWorld);
              if (!this.dragTargetPos) this.dragTargetPos = new THREE.Vector3();
              this.dragTargetPos.copy(frontWorld);
              this.dragTargetQuat = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(-0.32, isFlipped ? Math.PI : 0, 0, 'XYZ')
              );
            }
          } else if (slotHits.length > 0) {
            overRackPlane = true;
          }

          if (overRackPlane && hoverSlotIdx != null && this.rackSlotMeshes[hoverSlotIdx]) {
            this.rackSlotMeshes[hoverSlotIdx].material.opacity = 0.45;
          }

          let dragTablePt = null;
          if (!overRackPlane) {
            const dragPt = new THREE.Vector3();
            if (this.raycaster.ray.intersectPlane(this.tableDragPlane, dragPt)) {
              dragTablePt = dragPt;
              const clampedX = THREE.MathUtils.clamp(dragPt.x, -8.2, 8.2);
              const clampedZ = THREE.MathUtils.clamp(dragPt.z, -6.8, 8.2);
              const overRackFootprint = Math.abs(clampedX) <= 5.0 && clampedZ >= 5.65 && clampedZ <= 7.45;
              if (!this.dragTargetPos) this.dragTargetPos = new THREE.Vector3();
              this.dragTargetPos.set(
                clampedX,
                overRackFootprint ? Math.max(2.6, dragPt.y) : Math.max(0.95, dragPt.y),
                clampedZ
              );
              this.dragTargetQuat = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(-0.82, isFlipped ? Math.PI : 0, 0, 'XYZ')
              );
            }
          }

          const overDiscard = !overRackPlane && this.isMyPlayTurn() && this.isOverRightDiscardZone(dragTablePt);
          this.setRightDiscardHighlight(overDiscard, true);
        }
        return;
      }

      if (this.demoMode) return;
      const now = performance.now();
      if (now - this.lastHoverCheckTime < 40) return;
      this.lastHoverCheckTime = now;

      this.updatePointer(e.clientX, e.clientY);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.interactables, false);
      this.canvas.style.cursor = hits.length > 0 ? 'pointer' : 'default';
    };

    this.onPointerUp = (e) => {
      if (this.orbitDrag) {
        this.orbitDrag = null;
        releaseActivePointer();
        return;
      }

      if (!this.dragState) return;
      releaseActivePointer();
      const drag = this.dragState;
      this.dragState = null;
      this.dragTargetPos = null;
      this.dragTargetQuat = null;
      this.dragTargetScale = null;
      this.canvas.style.cursor = 'default';
      this.setRightDiscardHighlight(false, false);
      this.rackSlotMeshes.forEach((m) => {
        m.material.opacity = 0;
      });
      if (drag.floatingMesh) {
        drag.floatingMesh.updateMatrixWorld(true);
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        drag.floatingMesh.getWorldPosition(pos);
        drag.floatingMesh.getWorldQuaternion(quat);
        drag.floatingMesh.getWorldScale(scale);
        this.lastDraggedTransform = {
          tileId: drag.tile.id,
          pos,
          quat,
          scale,
          expiresAt: performance.now() + 1200
        };
        this.scene.remove(drag.floatingMesh);
      }
      if (drag.mesh) {
        drag.mesh.visible = true;
      }

      if (!drag.moved) {
        const now = performance.now();
        if (
          this.lastTileTap &&
          this.lastTileTap.tileId === drag.tile.id &&
          now - this.lastTileTap.time < 360
        ) {
          if (this.lastTileTap.wasSelectedBefore) {
            this.selectedTileIds.add(drag.tile.id);
          } else {
            this.selectedTileIds.delete(drag.tile.id);
          }
          this.lastTileTap = null;

          if (this.flippedTileIds.has(drag.tile.id)) {
            this.flippedTileIds.delete(drag.tile.id);
          } else {
            this.flippedTileIds.add(drag.tile.id);
          }
          soundFX.playTileFlip();
          if (this.currentState) {
            this.renderGameState(this.currentState, { skipSlotSync: true });
          }
          this.callbacks.onSelectionChange?.(this.getSelectedTiles());
          return;
        }

        const wasSelectedBefore = this.selectedTileIds.has(drag.tile.id);
        this.lastTileTap = { tileId: drag.tile.id, time: now, wasSelectedBefore };
        if (wasSelectedBefore) {
          this.selectedTileIds.delete(drag.tile.id);
        } else {
          this.selectedTileIds.add(drag.tile.id);
        }
        soundFX.playTilePickup();
        if (this.currentState) {
          this.renderGameState(this.currentState, { skipSlotSync: true });
        }
        this.callbacks.onSelectionChange?.(this.getSelectedTiles());
        return;
      }

      // Check drop targets: Rack Plane / Slot first, then Right Discard Tray or Valid Table Meld Layoff
      this.updatePointer(e.clientX, e.clientY);
      this.raycaster.setFromCamera(this.pointer, this.camera);

      const slotHits = this.raycaster.intersectObjects(this.rackSlotMeshes, false);
      const rackPt = new THREE.Vector3();
      const hasRackHit =
        this.rackDragPlane &&
        this.southRackGroup &&
        this.raycaster.ray.intersectPlane(this.rackDragPlane, rackPt);

      let overRackPlane = false;
      let rackLocalPt = null;
      if (hasRackHit) {
        rackLocalPt = this.southRackGroup.worldToLocal(rackPt.clone());
        if (
          slotHits.length > 0 ||
          (Math.abs(rackLocalPt.x) <= 5.15 && rackLocalPt.y >= -0.2 && rackLocalPt.y <= 2.7)
        ) {
          overRackPlane = true;
        }
      } else if (slotHits.length > 0) {
        overRackPlane = true;
      }

      if (overRackPlane) {
        const targetSlotIdx = slotHits.length > 0
          ? slotHits[0].object.userData.slotIdx
          : (rackLocalPt ? this.findNearestRackSlot(rackLocalPt) : null);
        const actualFromIdx = this.handSlotData.findIndex((t) => t && t.id === drag.tile.id);
        const fromIdx = actualFromIdx !== -1 ? actualFromIdx : drag.fromSlotIdx;
        if (targetSlotIdx != null && targetSlotIdx !== fromIdx && fromIdx >= 0 && fromIdx < this.handSlotData.length) {
          const targetTile = this.handSlotData[targetSlotIdx];
          this.handSlotData[targetSlotIdx] = drag.tile;
          this.handSlotData[fromIdx] = targetTile;
          this.callbacks.onRackReorder?.();
        }
        if (this.currentState) {
          this.renderGameState(this.currentState, { skipSlotSync: true });
        }
        return;
      }

      const viewerIdx = this.currentState?.viewerSeatIndex ?? 0;
      const mySeat = this.currentState?.seats?.[viewerIdx];
      const isMyPlayTurn = this.isMyPlayTurn();

      if (isMyPlayTurn) {
        const dragPt = new THREE.Vector3();
        const hasDragPt = this.raycaster.ray.intersectPlane(this.tableDragPlane, dragPt);
        if (this.isOverRightDiscardZone(hasDragPt ? dragPt : null)) {
          this.callbacks.onDiscardTile?.(drag.tile.id);
          return;
        }
      }

      if (isMyPlayTurn && mySeat?.opened) {
        const meldHits = this.raycaster.intersectObjects(
          this.dynamicGroup.children.filter((m) => m.userData?.kind === 'tableMeld'),
          false
        );
        if (meldHits.length > 0) {
          const meldId = meldHits[0].object.userData.meldId;
          const meld = (this.currentState.tableMelds || []).find((m) => m.id === meldId);
          if (meld && canLayoffTile(drag.tile, meld, this.currentState.okeyTarget).valid) {
            this.callbacks.onLayoffTile?.(drag.tile.id, meldId);
            return;
          }
        }
      }

      if (this.currentState) {
        this.renderGameState(this.currentState, { skipSlotSync: true });
      }
    };

    this.onPointerCancel = () => {
      this.cancelActiveInteractions();
    };

    this.onWheel = (e) => {
      if (this.demoMode) return;
      this.targetSpherical.radius = THREE.MathUtils.clamp(
        this.targetSpherical.radius + e.deltaY * 0.008,
        9.5,
        20.0
      );
    };

    this.onContextMenu = (e) => e.preventDefault();

    this.onResize = () => {
      const rect = this.canvas.getBoundingClientRect();
      const w = rect.width || window.innerWidth;
      const h = rect.height || window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
    };

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('blur', this.onPointerCancel);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: true });
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('resize', this.onResize);
  }

  setTableTheme(theme = 'green') {
    const valid = theme === 'burgundy' || theme === 'navy' ? theme : 'green';
    this.tableTheme = valid;
    const tex = getFeltTexture(valid);
    if (this.tableFeltMat) {
      this.tableFeltMat.map = tex;
      this.tableFeltMat.needsUpdate = true;
    }
    for (const mat of this.sideFeltMats) {
      mat.map = tex;
      mat.needsUpdate = true;
    }
  }

  showSeatBubble(seatIndex, name, text, viewerSeatIndex = this.currentViewerIdx) {
    const rel = (Number(seatIndex) - Number(viewerSeatIndex || 0) + 4) % 4;
    if (rel === 0) return;

    const anchors = {
      1: [8.85, 5.25, 0],
      2: [0, 5.45, -8.85],
      3: [-8.85, 5.25, 0]
    };
    const pos = anchors[rel];
    if (!pos) return;

    const existing = this.speechBubbles.get(rel);
    if (existing) {
      this.bubbleGroup.remove(existing.sprite);
      existing.sprite.material?.map?.dispose();
      existing.sprite.material?.dispose();
      this.speechBubbles.delete(rel);
    }

    const tex = createSpeechBubbleTexture(name, text);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(pos[0], pos[1], pos[2]);
    sprite.scale.set(4.1, 1.15, 1);
    sprite.renderOrder = 30;
    this.bubbleGroup.add(sprite);

    this.speechBubbles.set(rel, {
      sprite,
      baseY: pos[1],
      age: 0,
      ttl: 4.5
    });
  }

  nudgeSeat(seatIndex = 0) {
    if (this.reducedMotion) return;
    this.nudgeShake = {
      seatIndex,
      elapsed: 0,
      duration: 0.45
    };
  }

  triggerWinCelebration({ winnerSeat = 0, viewerSeat = 0, multiplier = 1 } = {}) {
    if (this.reducedMotion) return;
    const rel = (Number(winnerSeat) - Number(viewerSeat || 0) + 4) % 4;
    const originMap = {
      0: [0, 2.2, 4.4],
      1: [5.4, 2.4, 0],
      2: [0, 2.5, -5.4],
      3: [-5.4, 2.4, 0]
    };
    const origin = originMap[rel] || [0, 2.2, 0];
    const count = multiplier >= 2 ? 68 : 44;

    for (let i = 0; i < count; i += 1) {
      const mat = this.confettiMats[i % this.confettiMats.length];
      const mesh = new THREE.Mesh(this.confettiGeom, mat);
      mesh.position.set(
        origin[0] + (Math.random() - 0.5) * 1.4,
        origin[1] + Math.random() * 0.6,
        origin[2] + (Math.random() - 0.5) * 1.4
      );
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.4 + Math.random() * 4.2;
      this.celebrationGroup.add(mesh);
      this.celebrationParticles.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: 3.6 + Math.random() * 3.8,
        vz: Math.sin(angle) * speed,
        rx: (Math.random() - 0.5) * 9,
        ry: (Math.random() - 0.5) * 9,
        rz: (Math.random() - 0.5) * 9,
        life: 0,
        maxLife: 2.4 + Math.random() * 1.0
      });
    }
  }

  animate() {
    this.rafId = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.demoMode && !this.reducedMotion) {
      this.targetSpherical.theta += dt * 0.08;
    }

    // Smooth carried-tile interpolation during physical drag
    if (this.dragState?.floatingMesh && this.dragTargetPos) {
      const dragDamp = this.reducedMotion ? 1 : Math.min(1, dt * 20);
      this.dragState.floatingMesh.position.lerp(this.dragTargetPos, dragDamp);
      if (this.dragTargetQuat) {
        this.dragState.floatingMesh.quaternion.slerp(this.dragTargetQuat, dragDamp);
      }
      if (this.dragTargetScale) {
        this.dragState.floatingMesh.scale.lerp(this.dragTargetScale, dragDamp);
      }
    }

    // Gentle rising steam particles over hot Kahvehane drinks/food
    if (!this.reducedMotion && this.steamParticles.length > 0) {
      for (const sp of this.steamParticles) {
        sp.phase = (sp.phase + dt * 0.42) % 1;
        sp.mesh.position.y = sp.baseY + sp.phase * 0.68;
        sp.mesh.position.x = sp.baseX + Math.sin(sp.phase * Math.PI * 2) * 0.05;
        const sc = 0.7 + sp.phase * 0.9;
        sp.mesh.scale.setScalar(sc);
        sp.mesh.material.opacity = Math.sin(sp.phase * Math.PI) * 0.34;
      }
    }

    // Floating 3D speech bubbles over opponent seats
    if (this.speechBubbles.size > 0) {
      for (const [rel, b] of this.speechBubbles.entries()) {
        b.age += dt;
        const remain = b.ttl - b.age;
        if (remain <= 0) {
          this.bubbleGroup.remove(b.sprite);
          b.sprite.material?.map?.dispose();
          b.sprite.material?.dispose();
          this.speechBubbles.delete(rel);
          continue;
        }
        const bob = this.reducedMotion ? 0 : Math.sin(b.age * 3.2) * 0.06;
        b.sprite.position.y = b.baseY + bob;
        if (remain < 0.45) {
          b.sprite.material.opacity = Math.max(0, remain / 0.45);
        }
      }
    }

    // Celebratory win confetti particles
    if (this.celebrationParticles.length > 0) {
      for (let i = this.celebrationParticles.length - 1; i >= 0; i -= 1) {
        const p = this.celebrationParticles[i];
        p.life += dt;
        if (p.life >= p.maxLife || p.mesh.position.y < -0.2) {
          this.celebrationGroup.remove(p.mesh);
          this.celebrationParticles.splice(i, 1);
          continue;
        }
        p.vy -= 5.8 * dt;
        p.vx *= 0.992;
        p.vz *= 0.992;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.x += p.rx * dt;
        p.mesh.rotation.y += p.ry * dt;
        p.mesh.rotation.z += p.rz * dt;
      }
    }

    for (let i = this.tileAnimations.length - 1; i >= 0; i -= 1) {
      const anim = this.tileAnimations[i];
      anim.elapsed += dt;
      if (anim.elapsed < anim.delay) {
        continue;
      }

      const progress = Math.min(1, (anim.elapsed - anim.delay) / anim.duration);
      const ease = 1 - (1 - progress) ** 3;
      anim.mesh.position.lerpVectors(anim.startPos, anim.targetPos, ease);
      anim.mesh.position.y += Math.sin(progress * Math.PI) * anim.arcHeight;
      anim.mesh.quaternion.slerpQuaternions(anim.startQuat, anim.targetQuat, ease);
      anim.mesh.scale.lerpVectors(anim.startScale, anim.targetScale, ease);

      if (progress >= 1) {
        anim.mesh.position.copy(anim.targetPos);
        anim.mesh.quaternion.copy(anim.targetQuat);
        anim.mesh.scale.copy(anim.targetScale);
        this.tileAnimations.splice(i, 1);
      }
    }

    const damp = this.reducedMotion ? 1 : Math.min(1, dt * 8);
    this.camSpherical.radius += (this.targetSpherical.radius - this.camSpherical.radius) * damp;
    this.camSpherical.phi += (this.targetSpherical.phi - this.camSpherical.phi) * damp;
    this.camSpherical.theta += (this.targetSpherical.theta - this.camSpherical.theta) * damp;
    this.camTarget.lerp(this.targetCamLook, damp);
    if (this.targetFov && Math.abs(this.camera.fov - this.targetFov) > 0.05) {
      this.camera.fov += (this.targetFov - this.camera.fov) * damp;
      this.camera.updateProjectionMatrix();
    }

    const offset = new THREE.Vector3().setFromSpherical(this.camSpherical);
    this.camera.position.copy(this.camTarget).add(offset);
    if (this.nudgeShake && !this.reducedMotion) {
      this.nudgeShake.elapsed += dt;
      if (this.nudgeShake.elapsed >= this.nudgeShake.duration) {
        this.nudgeShake = null;
      } else {
        const t = this.nudgeShake.elapsed / this.nudgeShake.duration;
        const amp = (1 - t) * 0.14;
        this.camera.position.x += Math.sin(t * Math.PI * 14) * amp;
        this.camera.position.y += Math.cos(t * Math.PI * 10) * amp * 0.55;
      }
    }
    this.camera.lookAt(this.camTarget);

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.cancelActiveInteractions();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('blur', this.onPointerCancel);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('resize', this.onResize);

    const staticGeoms = [
      this.tileGeom,
      this.bustGeom,
      this.oppShieldGeom,
      this.oppTrimGeom,
      this.gStandGeom,
      this.meldTrayGeomUnit,
      this.deckGlowRingGeom,
      this.leftDiscardRingGeom,
      this.turnRingGeom,
      this.steamPuffGeom,
      this.confettiGeom
    ];
    for (const g of staticGeoms) g?.dispose();

    const staticMats = [
      this.sideTileMat,
      this.backTileMat,
      this.rearCapMat,
      this.coverWoodMat,
      this.coverBrassMat,
      this.gStandMat,
      this.meldTrayMatDefault,
      this.meldTrayMatLayoff,
      this.deckGlowRingMat,
      this.leftDiscardRingMat,
      this.discardPadMatIdle,
      this.discardPadMatActive,
      this.rightDiscardRingMat,
      this.tableFeltMat,
      ...this.sideFeltMats,
      ...this.confettiMats
    ];
    for (const m of staticMats) m?.dispose();

    for (const b of this.speechBubbles.values()) {
      b.sprite.material?.map?.dispose();
      b.sprite.material?.dispose();
    }
    this.speechBubbles.clear();

    for (const mat of this.tileFaceMatCache.values()) mat?.dispose();
    this.tileFaceMatCache.clear();
    for (const mat of this.avatarMatCache.values()) mat?.dispose();
    this.avatarMatCache.clear();
    for (const mat of this.colorMatCache.values()) mat?.dispose();
    this.colorMatCache.clear();
    for (const mat of this.nameplateMatCache.values()) {
      mat?.map?.dispose();
      mat?.dispose();
    }
    this.nameplateMatCache.clear();
    for (const entry of this.headGeomCache.values()) {
      entry?.bezel?.dispose();
      entry?.frontDisc?.dispose();
      entry?.rearDisc?.dispose();
      entry?.halo?.dispose();
    }
    this.headGeomCache.clear();

    this.renderer.dispose();
  }
}
