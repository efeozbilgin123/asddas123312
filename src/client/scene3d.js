import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canLayoffTile } from '../../shared/melds.js';
import { KAHVE_CATS, RACK_THEMES, TILE_THEMES } from '../../shared/presets.js';
import { SIDE_TABLE_DEFS } from '../../shared/sideGames.js';
import { isOkeyTile } from '../../shared/tiles.js';
import { BILLIARD_WORLD_POS, BilliardTable3D } from './billiard3d.js';
import { buildKahveCharacter } from './playerVisuals.js';
import { SideTables3D } from './sideTables3d.js';
import { soundFX } from './sound.js';
import {
  createLiveClockTexture,
  createNameplateTexture,
  createSpeechBubbleTexture,
  createTvScreenTexture,
  getAvatarTexture,
  getDeckCountBadgeTexture,
  getDiscardPadTexture,
  getFeltTexture,
  getKahveBackdropTexture,
  getMenuBoardTexture,
  getParquetTexture,
  getTileBackTexture,
  getTileFaceTexture,
  getWallArtTexture,
  getWindowAtmosphereTexture,
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
    pos: new THREE.Vector3(0, 5.6, 13.0),
    target: new THREE.Vector3(0, 2.3, 1.8),
    fov: 57
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
  },
  billiard: {
    pos: new THREE.Vector3(BILLIARD_WORLD_POS.x - 11.8, 11.2, BILLIARD_WORLD_POS.z + 12.2),
    target: new THREE.Vector3(BILLIARD_WORLD_POS.x, 0.2, BILLIARD_WORLD_POS.z),
    fov: 52
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
    bevelSegments: 1,
    curveSegments: 3
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
    this.scene.fog = new THREE.FogExp2('#160E09', 0.0038);

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(CAMERA_PRESETS.table.fov, width / height, 0.1, 190);
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
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, 1.35);
    this.activePixelRatio = this.basePixelRatio;
    this.musicPerfMode = false;
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.setSize(width, height, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.shadowFramesPending = 2;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.16;

    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = 0.45;
      pmrem.dispose();
    } catch {
      this.envRT = null;
    }

    this.css3dScene = new THREE.Scene();
    this.css3dRenderer = new CSS3DRenderer();
    this.css3dRenderer.setSize(width, height);
    this.css3dRenderer.domElement.className = 'tv-css3d-layer';
    this.css3dRenderer.domElement.style.display = 'none';
    this.canvas.insertAdjacentElement('afterend', this.css3dRenderer.domElement);

    this.tvWallHostEl = document.createElement('div');
    this.tvWallHostEl.className = 'tv-css3d-screen';
    this.tvWallCssObj = new CSS3DObject(this.tvWallHostEl);
    this.tvWallCssObj.visible = false;
    this.tvWallVisible = false;
    this.tvWallWorldZ = -41.52;
    this._css3dMatrixValid = false;
    this._lastCss3dWorldMatrix = new Float32Array(16);
    this._lastCss3dProjMatrix = new Float32Array(16);
    this._lastCss3dDisplay = 'none';

    this._frameCounter = 0;
    this._lastFrameNow = 0;
    this._perfSlowFrames = 0;
    this._perfFastFrames = 0;
    this._perfTier = 0;
    this._camOffsetVec = new THREE.Vector3();

    this.demoMode = true;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.lastHoverCheckTime = 0;
    this.interactables = [];
    this.envInteractables = [];
    this._hoverTargets = [];
    this.envDisposableGeoms = [];
    this.envDisposableMats = [];
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
    this._dragRackPt = new THREE.Vector3();
    this._dragLocalPt = new THREE.Vector3();
    this._dragFrontWorld = new THREE.Vector3();
    this._dragTablePt = new THREE.Vector3();
    this._dragQuat = new THREE.Quaternion();
    this._dragEuler = new THREE.Euler(0, 0, 0, 'XYZ');
    this._lastHighlightedSlotIdx = -1;
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

    this.tileTheme = 'ivory';
    this.rackTheme = 'walnut';
    this.roomAtmosphere = 'rainy';
    this.qualityMode = 'auto';
    this.tvWallWidthPx = 960;
    this.tvWallHeightPx = 540;
    this.tvState = null;
    this.tvUpdater = null;
    this.tvScreenMesh = null;
    this.clockUpdater = null;
    this.lastClockSec = -1;
    this.envLights = {};
    this.windowMats = [];
    this.rainGroup = null;
    this.rainDrops = [];
    this._rainDummyMatrix = new THREE.Matrix4();
    this.hearthGroup = null;
    this.hearthLight = null;
    this.hearthEmbers = [];
    this.catModels = [];
    this.rackWoodMat = null;

    // Cached geometries and materials to eliminate per-click / per-frame GC stalls
    this.tileGeom = createRoundedTileGeometry(TILE_W, TILE_H, TILE_D, 0.038, 0.015);
    this.sideTileMat = new THREE.MeshStandardMaterial({
      color: '#EAE1CE',
      roughness: 0.28,
      metalness: 0.04
    });
    this.backTileMat = new THREE.MeshStandardMaterial({
      map: getTileBackTexture(this.tileTheme),
      roughness: 0.3,
      metalness: 0.04
    });
    this.tileFaceMatCache = new Map();
    this.avatarMatCache = new Map();
    this.colorMatCache = new Map();
    this.headGeomCache = new Map();
    this.nameplateMatCache = new Map();
    this.deckBadgeMatCache = new Map();

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

    this.sideTablesDynamicGroup = new THREE.Group();
    this.scene.add(this.sideTablesDynamicGroup);
    this._lastSideTablesSig = '';

    this.diceGroup = new THREE.Group();
    this.diceGroup.visible = false;
    this.scene.add(this.diceGroup);
    this.diceMeshes = [];
    this.diceAnim = null;

    this.orderGroup = new THREE.Group();
    this.scene.add(this.orderGroup);
    this.bubbleGroup = new THREE.Group();
    this.scene.add(this.bubbleGroup);
    this.celebrationGroup = new THREE.Group();
    this.scene.add(this.celebrationGroup);
    this.roamerGroup = new THREE.Group();
    this.scene.add(this.roamerGroup);
    this.roamerActors = new Map();
    this.roamerNameMats = new Map();
    this._lastRoamersSig = '';

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

    this.cameraMode = 'table';
    this.myActivity = 'okey';
    this.mySideTableId = null;
    this.mySideSeatIndex = null;
    this.activeSideTableTarget = null;
    this.sideTablesViewerCtx = {};
    this.hoveredSideMesh = null;
    this.ceilingFans = [];
    this.lobbyDisposableMats = [];
    this.billiardSeatIndex = null;
    this.billiardState = null;
    this.localPlayerId = null;
    this.billiardPlaceMode = false;
    this.billiardAimingDrag = false;
    this._lastBilliardAimEmitAt = 0;
    this.freeroamState = {
      pos: new THREE.Vector3(18, 3.2, 20),
      yaw: 0,
      pitch: -0.06,
      keys: new Set(),
      lookDrag: null,
      touchLook: null,
      mobileMove: { x: 0, z: 0 },
      lastEmitAt: 0,
      lastSentX: null,
      lastSentZ: null,
      lastSentYaw: null
    };
    this.isPointerLocked = false;
    this.activeProximityId = null;
    this.lastProximityCheckAt = 0;
    this._roamTmpLook = new THREE.Vector3();

    this.billiard3d = new BilliardTable3D(this.scene, {
      bustGeom: this.bustGeom,
      avatarMatCache: this.avatarMatCache,
      onShotComplete: () => this.callbacks.onBilliardShotAnimEnd?.()
    });

    this.sideTables3d = new SideTables3D(this.scene, {
      bustGeom: this.bustGeom,
      avatarMatCache: this.avatarMatCache
    });

    this.buildEnvironment();
    const billiardFelt = this.billiard3d.getFeltHitMesh();
    if (billiardFelt) {
      this.envInteractables.push(billiardFelt);
    }
    this.buildTable();
    this.buildRacks();
    this.buildDiceMeshes();
    this.buildDemoSetup();
    this.bindEvents();

    this.clock = new THREE.Clock();
    this.rafId = null;
    this.animate = this.animate.bind(this);
    this.animate();
  }

  updateSideTablesState(sideTables = [], viewerCtx = null) {
    this.sideTablesState = Array.isArray(sideTables) ? sideTables : [];
    if (viewerCtx && typeof viewerCtx === 'object') {
      this.sideTablesViewerCtx = viewerCtx;
    }
    this.sideTables3d?.updateStates(this.sideTablesState, {
      mySideTableId: this.sideTablesViewerCtx.mySideTableId ?? this.mySideTableId,
      mySideSeatIndex: this.sideTablesViewerCtx.mySideSeatIndex ?? this.mySideSeatIndex
    });
  }

  applyEffectivePixelRatio() {
    const rawDpr = window.devicePixelRatio || 1;
    let target = this.basePixelRatio;
    if (this.qualityMode === 'performance') {
      target = Math.min(rawDpr, 0.9);
    } else if (this.qualityMode === 'high') {
      target = Math.min(rawDpr, 1.75);
    } else {
      if (this._perfTier === 1) {
        target = Math.min(target, 1.0);
      } else if (this._perfTier >= 2) {
        target = Math.min(target, 0.85);
      }
      if (this.musicPerfMode) {
        target = Math.min(target, 1.05);
      }
    }
    if (Math.abs(target - this.activePixelRatio) > 0.02) {
      this.activePixelRatio = target;
      this.renderer.setPixelRatio(target);
      this.onResize();
    }
  }

  setQualityMode(mode = 'auto') {
    const valid = mode === 'high' || mode === 'performance' ? mode : 'auto';
    this.qualityMode = valid;
    this.renderer.shadowMap.enabled = valid !== 'performance';
    if (this.rainGroup) {
      this.rainGroup.visible = valid !== 'performance' && this.roomAtmosphere === 'rainy';
    }
    for (const sp of this.steamParticles) {
      if (sp?.mesh) sp.mesh.visible = valid !== 'performance';
    }
    const nextW = valid === 'performance' ? 640 : 960;
    const nextH = valid === 'performance' ? 360 : 540;
    if (this.tvWallWidthPx !== nextW || this.tvWallHeightPx !== nextH) {
      this.tvWallWidthPx = nextW;
      this.tvWallHeightPx = nextH;
      if (this.tvWallHostEl) {
        this.tvWallHostEl.style.width = `${nextW}px`;
        this.tvWallHostEl.style.height = `${nextH}px`;
      }
      if (this.tvWallCssObj) {
        this.tvWallCssObj.scale.set(18.4 / nextW, 10.35 / nextH, 1);
      }
      this._css3dMatrixValid = false;
    }
    this.applyEffectivePixelRatio();
    this.requestShadowUpdate(2);
  }

  buildDiceMeshes() {
    const diceMat = new THREE.MeshStandardMaterial({
      color: '#FBF7EE',
      roughness: 0.25,
      metalness: 0.04
    });
    const pipMat = new THREE.MeshBasicMaterial({ color: '#1B1815' });
    const diceGeom = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const pipGeom = new THREE.CylinderGeometry(0.036, 0.036, 0.018, 8);
    this.envDisposableGeoms.push(diceGeom, pipGeom);
    this.envDisposableMats.push(diceMat, pipMat);

    const pipOffsets = [
      // +Y face (1)
      { pos: [0, 0.205, 0], rot: [0, 0, 0] },
      // -Y face (6)
      { pos: [-0.09, -0.205, -0.1], rot: [0, 0, 0] },
      { pos: [-0.09, -0.205, 0], rot: [0, 0, 0] },
      { pos: [-0.09, -0.205, 0.1], rot: [0, 0, 0] },
      { pos: [0.09, -0.205, -0.1], rot: [0, 0, 0] },
      { pos: [0.09, -0.205, 0], rot: [0, 0, 0] },
      { pos: [0.09, -0.205, 0.1], rot: [0, 0, 0] },
      // +Z face (2)
      { pos: [-0.09, 0.09, 0.205], rot: [Math.PI / 2, 0, 0] },
      { pos: [0.09, -0.09, 0.205], rot: [Math.PI / 2, 0, 0] },
      // -Z face (5)
      { pos: [0, 0, -0.205], rot: [Math.PI / 2, 0, 0] },
      { pos: [-0.09, 0.09, -0.205], rot: [Math.PI / 2, 0, 0] },
      { pos: [0.09, 0.09, -0.205], rot: [Math.PI / 2, 0, 0] },
      { pos: [-0.09, -0.09, -0.205], rot: [Math.PI / 2, 0, 0] },
      { pos: [0.09, -0.09, -0.205], rot: [Math.PI / 2, 0, 0] },
      // +X face (3)
      { pos: [0.205, 0.09, -0.09], rot: [0, 0, Math.PI / 2] },
      { pos: [0.205, 0, 0], rot: [0, 0, Math.PI / 2] },
      { pos: [0.205, -0.09, 0.09], rot: [0, 0, Math.PI / 2] },
      // -X face (4)
      { pos: [-0.205, 0.09, 0.09], rot: [0, 0, Math.PI / 2] },
      { pos: [-0.205, 0.09, -0.09], rot: [0, 0, Math.PI / 2] },
      { pos: [-0.205, -0.09, 0.09], rot: [0, 0, Math.PI / 2] },
      { pos: [-0.205, -0.09, -0.09], rot: [0, 0, Math.PI / 2] }
    ];

    for (let i = 0; i < 2; i += 1) {
      const die = new THREE.Group();
      const cube = new THREE.Mesh(diceGeom, diceMat);
      cube.castShadow = true;
      die.add(cube);
      for (const p of pipOffsets) {
        const pip = new THREE.Mesh(pipGeom, pipMat);
        pip.position.set(...p.pos);
        pip.rotation.set(...p.rot);
        die.add(pip);
      }
      this.diceGroup.add(die);
      this.diceMeshes.push(die);
    }
  }

  triggerDiceRoll() {
    if (this.reducedMotion || this.diceMeshes.length < 2) return;
    const faceRots = [
      [0, 0, 0],
      [Math.PI / 2, 0, 0],
      [-Math.PI / 2, 0, 0],
      [0, 0, Math.PI / 2],
      [0, 0, -Math.PI / 2],
      [Math.PI, 0, 0]
    ];
    this.diceGroup.visible = true;
    this.diceAnim = {
      elapsed: 0,
      duration: 0.78,
      holdDuration: 0.72,
      dice: this.diceMeshes.map((mesh, idx) => {
        const f = faceRots[Math.floor(Math.random() * faceRots.length)];
        return {
          mesh,
          startPos: new THREE.Vector3(idx === 0 ? -1.1 : 1.1, 2.35, -2.5),
          endPos: new THREE.Vector3(idx === 0 ? -0.42 : 0.42, 0.25, idx === 0 ? -1.35 : -1.05),
          startRot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
          endRot: new THREE.Euler(
            f[0] + Math.PI * 4,
            Math.random() * Math.PI * 2 + Math.PI * 2,
            f[2] + Math.PI * 4
          )
        };
      })
    };
  }

  setLobbyRooms(rooms = [], currentRoomCode = null) {
    const others = (Array.isArray(rooms) ? rooms : [])
      .filter((r) => r && r.code && r.code !== currentRoomCode)
      .slice(0, 4);
    const sig = JSON.stringify(
      others.map((r) => ({
        c: r.code,
        n: r.name,
        s: r.status,
        h: r.humanCount,
        seats: (r.seats || []).map((st) => [st.type, st.name, st.avatar])
      }))
    );
    if (sig === this._lastSideTablesSig) return;
    this._lastSideTablesSig = sig;

    while (this.sideTablesDynamicGroup.children.length > 0) {
      const child = this.sideTablesDynamicGroup.children[0];
      this.sideTablesDynamicGroup.remove(child);
    }
    for (const m of this.lobbyDisposableMats) {
      m?.map?.dispose?.();
      m?.dispose?.();
    }
    this.lobbyDisposableMats.length = 0;

    const tableCoords = [
      { x: -53, z: -24, rotY: 0.14 },
      { x: 89, z: -24, rotY: -0.18 },
      { x: -53, z: 57, rotY: 0.2 },
      { x: 89, z: 57, rotY: -0.16 }
    ];
    const seatLocalOffsets = [
      { x: 0, z: 3.1, rotY: Math.PI },
      { x: 3.1, z: 0, rotY: -Math.PI / 2 },
      { x: 0, z: -3.1, rotY: 0 },
      { x: -3.1, z: 0, rotY: Math.PI / 2 }
    ];

    let ghostTopGeo = this._ghostTopGeo;
    if (!ghostTopGeo) {
      ghostTopGeo = new THREE.CylinderGeometry(2.35, 2.35, 0.22, 18);
      this._ghostTopGeo = ghostTopGeo;
      this.envDisposableGeoms.push(ghostTopGeo);
    }
    let ghostLegGeo = this._ghostLegGeo;
    if (!ghostLegGeo) {
      ghostLegGeo = new THREE.CylinderGeometry(0.32, 0.55, 2.25, 10);
      this._ghostLegGeo = ghostLegGeo;
      this.envDisposableGeoms.push(ghostLegGeo);
    }
    let ghostWoodMat = this.colorMatCache.get('ghost-wood');
    if (!ghostWoodMat) {
      ghostWoodMat = new THREE.MeshStandardMaterial({ color: '#5D3822', roughness: 0.65 });
      this.colorMatCache.set('ghost-wood', ghostWoodMat);
    }

    others.forEach((room, idx) => {
      const tc = tableCoords[idx];
      if (!tc) return;
      const tGroup = new THREE.Group();
      tGroup.position.set(tc.x, 0, tc.z);
      tGroup.rotation.y = tc.rotY;

      const tTop = new THREE.Mesh(ghostTopGeo, ghostWoodMat);
      tTop.position.y = -0.1;
      tGroup.add(tTop);
      const tLeg = new THREE.Mesh(ghostLegGeo, ghostWoodMat);
      tLeg.position.y = -1.22;
      tGroup.add(tLeg);

      const seats = Array.isArray(room.seats) ? room.seats : [];
      seats.forEach((s, sIdx) => {
        if (!s || s.type === 'empty' || !seatLocalOffsets[sIdx]) return;
        const off = seatLocalOffsets[sIdx];
        const actor = buildKahveCharacter({
          bustGeom: this.bustGeom,
          avatarMatCache: this.avatarMatCache,
          avatar: s.avatar || `avatar-${(sIdx % 16) + 1}`,
          name: s.name || 'Oyuncu',
          vestColor: s.type === 'bot' ? '#43627D' : '#8A3B2E',
          teamColor: '#C59A4B',
          isBot: s.type === 'bot',
          isActive: false,
          seated: true,
          medRadius: 0.72,
          headY: 2.3,
          showNameplate: false,
          rearPfp: true,
          disposableMats: this.lobbyDisposableMats
        });
        actor.group.position.set(off.x, -0.35, off.z);
        actor.group.rotation.y = off.rotY;
        tGroup.add(actor.group);
      });

      const rawTitle = (room.name || room.code || 'Masa').slice(0, 12);
      const signLabel = `${rawTitle} (${room.humanCount || 0}/4)`;
      const signTex = createNameplateTexture(signLabel, { isActive: room.status === 'playing' });
      const signMat = new THREE.SpriteMaterial({ map: signTex, transparent: true, depthWrite: false });
      this.lobbyDisposableMats.push(signMat);
      const signSprite = new THREE.Sprite(signMat);
      signSprite.position.set(0, 3.65, 0);
      signSprite.scale.set(4.4, 1.1, 1);
      tGroup.add(signSprite);

      this.sideTablesDynamicGroup.add(tGroup);
    });
  }

  requestShadowUpdate(frames = 2) {
    if (this.shadowFramesPending < frames) {
      this.shadowFramesPending = frames;
    }
  }

  mergeStaticGroup(group, { receiveShadow = false } = {}) {
    group.updateMatrixWorld(true);
    const buckets = new Map();
    const origGeoms = new Set();

    group.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry || !obj.material) return;
      origGeoms.add(obj.geometry);
      const geom = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone();
      geom.applyMatrix4(obj.matrixWorld);
      let list = buckets.get(obj.material);
      if (!list) {
        list = [];
        buckets.set(obj.material, list);
      }
      list.push(geom);
    });

    for (const [mat, geoms] of buckets.entries()) {
      const merged = mergeGeometries(geoms, false);
      for (const g of geoms) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.receiveShadow = receiveShadow;
      mesh.castShadow = false;
      this.scene.add(mesh);
      this.envDisposableGeoms.push(merged);
    }

    for (const g of origGeoms) g.dispose();
  }

  setMusicPerformanceMode(active) {
    const next = Boolean(active);
    if (this.musicPerfMode === next) return;
    this.musicPerfMode = next;
    this.applyEffectivePixelRatio();
  }

  getRackSlots() {
    return this.handSlotData;
  }

  buildPendantLamp(x, y, z, scale = 1, addLight = false, targetGroup = this.scene, sharedMats = null) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const brassMat = sharedMats?.brassMat || new THREE.MeshLambertMaterial({ color: '#C79B42' });
    const globeMat = sharedMats?.globeMat || new THREE.MeshBasicMaterial({ color: '#FFE6A8' });

    const chainHeight = Math.max(1.2, 16.0 - y);
    const chain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, chainHeight, 6),
      brassMat
    );
    chain.position.y = chainHeight / 2;
    group.add(chain);

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(0.48 * scale, 0.4 * scale, 12),
      brassMat
    );
    cap.position.y = 0.24 * scale;
    group.add(cap);

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(0.45 * scale, 12, 10),
      globeMat
    );
    globe.position.y = -0.18 * scale;
    group.add(globe);

    const finial = new THREE.Mesh(
      new THREE.ConeGeometry(0.14 * scale, 0.28 * scale, 8),
      brassMat
    );
    finial.rotation.x = Math.PI;
    finial.position.y = -0.7 * scale;
    group.add(finial);

    if (addLight) {
      const pt = new THREE.PointLight('#FFC06E', 24, 28, 1.4);
      pt.position.y = -0.35 * scale;
      this.scene.add(pt);
      pt.position.set(x, y - 0.35 * scale, z);
    }

    targetGroup.add(group);
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

  buildSideKahveTable(x, z, rotY, hasTavla = false, targetGroup = this.scene, shared = null) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;

    const woodMat = shared?.woodMat || new THREE.MeshLambertMaterial({ map: getWoodTexture(), color: '#75492B' });
    const darkWoodMat = shared?.darkWoodMat || new THREE.MeshLambertMaterial({ map: getWoodTexture(), color: '#52311D' });
    const leatherMat = shared?.leatherMat || new THREE.MeshLambertMaterial({ color: '#2B1B14' });
    const sideFeltMat = shared?.sideFeltMat || new THREE.MeshLambertMaterial({ map: getFeltTexture(this.tableTheme) });
    if (!shared?.sideFeltMat) {
      this.sideFeltMats.push(sideFeltMat);
    }

    const top = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.24, 4.4), woodMat);
    top.position.y = -0.14;
    group.add(top);

    const feltCenter = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.04, 3.6),
      sideFeltMat
    );
    feltCenter.position.y = -0.01;
    group.add(feltCenter);

    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.55, 2.2, 10), darkWoodMat);
    col.position.y = -1.25;
    group.add(col);

    const baseFoot = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.35, 0.16, 10), darkWoodMat);
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

    const saucerMat = shared?.saucerMat || new THREE.MeshLambertMaterial({ color: '#F0EAE0' });
    const teaMat = shared?.teaMat || new THREE.MeshLambertMaterial({ color: '#8E250B' });
    for (const [gx, gz] of [
      [-1.4, -1.3],
      [1.45, 1.35]
    ]) {
      const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.03, 10), saucerMat);
      saucer.position.set(gx, 0.03, gz);
      group.add(saucer);

      const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.26, 8), teaMat);
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

    targetGroup.add(group);
  }

  buildPottedPlant(x, z, scale = 1, targetGroup = this.scene, shared = null) {
    const group = new THREE.Group();
    group.position.set(x, -2.35, z);
    group.scale.setScalar(scale);

    const potMat = shared?.potMat || new THREE.MeshLambertMaterial({ color: '#7D3B22' });
    const trunkMat = shared?.trunkMat || new THREE.MeshLambertMaterial({ color: '#4A3122' });
    const leafMat = shared?.leafMat || new THREE.MeshLambertMaterial({ color: '#295732' });

    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.46, 1.15, 10), potMat);
    pot.position.y = 0.58;
    group.add(pot);

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.9, 6), trunkMat);
    trunk.position.y = 1.65;
    group.add(trunk);

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

    targetGroup.add(group);
  }

  buildEnvironment() {
    const hemi = new THREE.HemisphereLight('#FFEBD2', '#2B1C13', 1.15);
    this.scene.add(hemi);

    // Balanced overhead warm lights covering all 8 bays + Ocakbasi bar
    const pendantLight = new THREE.PointLight('#FFD18C', 48, 52, 1.2);
    pendantLight.position.set(0, 10.5, 0);
    this.scene.add(pendantLight);

    const westNorthLight = new THREE.PointLight('#FFD08E', 44, 48, 1.2);
    westNorthLight.position.set(-36, 10.5, 0);
    this.scene.add(westNorthLight);

    const eastNorthLight = new THREE.PointLight('#FFD08E', 44, 48, 1.2);
    eastNorthLight.position.set(36, 10.5, 0);
    this.scene.add(eastNorthLight);

    const billiardLight = new THREE.PointLight('#FFDF9E', 48, 44, 1.25);
    billiardLight.position.set(BILLIARD_WORLD_POS.x, 8.8, BILLIARD_WORLD_POS.z);
    this.scene.add(billiardLight);

    const southWestLight = new THREE.PointLight('#FFCC88', 46, 54, 1.2);
    southWestLight.position.set(-18, 10.5, 38);
    this.scene.add(southWestLight);

    const southEastLight = new THREE.PointLight('#FFCC88', 46, 54, 1.2);
    southEastLight.position.set(54, 10.5, 38);
    this.scene.add(southEastLight);

    const barLight = new THREE.PointLight('#FFE0A8', 34, 36, 1.25);
    barLight.position.set(18, 7.6, -33);
    this.scene.add(barLight);

    const keyLight = new THREE.DirectionalLight('#FFF0D4', 1.28);
    keyLight.position.set(18, 28, 14);
    keyLight.target.position.set(18, 0, 14);
    this.scene.add(keyLight.target);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 96;
    const d = 88;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#CBD8FF', 0.35);
    rimLight.position.set(-40, 14, -30);
    this.scene.add(rimLight);

    this.envLights = {
      hemi,
      pendantLight,
      westNorthLight,
      eastNorthLight,
      billiardLight,
      southWestLight,
      southEastLight,
      barLight,
      keyLight,
      rimLight
    };

    const staticEnvGroup = new THREE.Group();

    const roomMinX = -64;
    const roomMaxX = 100;
    const roomMinZ = -42;
    const roomMaxZ = 70;
    const roomW = roomMaxX - roomMinX; // 164
    const roomD = roomMaxZ - roomMinZ; // 112
    const centerX = (roomMinX + roomMaxX) / 2; // 18
    const centerZ = (roomMinZ + roomMaxZ) / 2; // 14

    // Walnut parquet floor (164 x 112)
    const parquetTex = getParquetTexture().clone();
    parquetTex.needsUpdate = true;
    parquetTex.repeat.set(28, 19);
    const floorMat = new THREE.MeshStandardMaterial({
      map: parquetTex,
      roughness: 0.62,
      metalness: 0.05
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomD), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(centerX, -2.35, centerZ);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Equal ornate 22x22 Turkish rugs beneath ALL 8 Grand Salon table bays + Promenade Carpet Runner
    const rugOuterMat = new THREE.MeshStandardMaterial({ color: '#612119', roughness: 0.92, metalness: 0.02 });
    const rugBorderMat = new THREE.MeshStandardMaterial({ color: '#8F642B', roughness: 0.88, metalness: 0.04 });
    const rugInnerMat = new THREE.MeshStandardMaterial({ color: '#4E1A15', roughness: 0.92, metalness: 0.02 });
    const rugOuterGeo = new THREE.BoxGeometry(22.2, 0.04, 22.2);
    const rugBorderGeo = new THREE.BoxGeometry(19.6, 0.045, 19.6);
    const rugInnerGeo = new THREE.BoxGeometry(18.2, 0.05, 18.2);
    this.envDisposableGeoms.push(rugOuterGeo, rugBorderGeo, rugInnerGeo);

    const salonBayCoords = [
      [-36, 0], [0, 0], [36, 0], [72, 0],
      [-36, 38], [0, 38], [36, 38], [72, 38]
    ];
    for (const [rx, rz] of salonBayCoords) {
      const rugOuter = new THREE.Mesh(rugOuterGeo, rugOuterMat);
      rugOuter.position.set(rx, -2.33, rz);
      rugOuter.receiveShadow = true;
      this.scene.add(rugOuter);

      const rugBorder = new THREE.Mesh(rugBorderGeo, rugBorderMat);
      rugBorder.position.set(rx, -2.326, rz);
      staticEnvGroup.add(rugBorder);

      const rugInner = new THREE.Mesh(rugInnerGeo, rugInnerMat);
      rugInner.position.set(rx, -2.322, rz);
      staticEnvGroup.add(rugInner);
    }

    // Grand Central Promenade Carpet Runner (z = 19, connecting all 8 bays West-to-East)
    const runnerOuter = new THREE.Mesh(new THREE.BoxGeometry(128, 0.042, 6.8), rugOuterMat);
    runnerOuter.position.set(centerX, -2.329, 19);
    staticEnvGroup.add(runnerOuter);
    const runnerBorder = new THREE.Mesh(new THREE.BoxGeometry(126, 0.046, 5.6), rugBorderMat);
    runnerBorder.position.set(centerX, -2.325, 19);
    staticEnvGroup.add(runnerBorder);
    const runnerInner = new THREE.Mesh(new THREE.BoxGeometry(124.5, 0.05, 4.8), rugInnerMat);
    runnerInner.position.set(centerX, -2.321, 19);
    staticEnvGroup.add(runnerInner);

    // Pedestal table leg under center Okey table (0, 0)
    const legMat = new THREE.MeshStandardMaterial({
      map: getWoodTexture(),
      color: '#633D26',
      roughness: 0.55,
      metalness: 0.06
    });
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.2, 2.1, 16), legMat);
    pedestal.position.y = -1.35;
    staticEnvGroup.add(pedestal);

    // 3D Kahvehane Interior Room (Warm Plaster, Walnut Wainscoting, Windows, Pilasters)
    const wallPlasterMat = new THREE.MeshStandardMaterial({ color: '#3B251A', roughness: 0.86, metalness: 0.02 });
    const wainscotMat = new THREE.MeshStandardMaterial({
      map: getWoodTexture(),
      color: '#5C3722',
      roughness: 0.56,
      metalness: 0.06
    });
    const trimBrassMat = new THREE.MeshStandardMaterial({
      color: '#C79B42',
      roughness: 0.3,
      metalness: 0.72
    });
    const artMat0 = new THREE.MeshLambertMaterial({ map: getWallArtTexture(0) });
    const artMat1 = new THREE.MeshLambertMaterial({ map: getWallArtTexture(1) });
    const menuMat = new THREE.MeshLambertMaterial({ map: getMenuBoardTexture() });
    this.clockUpdater = createLiveClockTexture();
    const clockMat = new THREE.MeshBasicMaterial({ map: this.clockUpdater.texture });
    const windowMat = new THREE.MeshBasicMaterial({ map: getWindowAtmosphereTexture(this.roomAtmosphere) });
    this.windowMats = [windowMat];
    const photoMat = new THREE.MeshLambertMaterial({ map: getKahveBackdropTexture() });
    const sconceMat = new THREE.MeshBasicMaterial({ color: '#FFD88A' });

    const wallSpecs = [
      { pos: [centerX, 6.825, roomMinZ], rotY: 0, span: roomW, idx: 0 },
      { pos: [centerX, 6.825, roomMaxZ], rotY: Math.PI, span: roomW, idx: 1 },
      { pos: [roomMinX, 6.825, centerZ], rotY: Math.PI / 2, span: roomD, idx: 2 },
      { pos: [roomMaxX, 6.825, centerZ], rotY: -Math.PI / 2, span: roomD, idx: 3 }
    ];

    wallSpecs.forEach((ws) => {
      const wallGroup = new THREE.Group();
      wallGroup.position.set(...ws.pos);
      wallGroup.rotation.y = ws.rotY;

      const upper = new THREE.Mesh(new THREE.PlaneGeometry(ws.span, 18.4), wallPlasterMat);
      wallGroup.add(upper);

      const lowerWood = new THREE.Mesh(new THREE.BoxGeometry(ws.span, 5.6, 0.28), wainscotMat);
      lowerWood.position.set(0, -6.38, 0.14);
      wallGroup.add(lowerWood);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(ws.span, 0.26, 0.42), trimBrassMat);
      rail.position.set(0, -3.55, 0.2);
      wallGroup.add(rail);

      const pilasterXs = ws.idx < 2
        ? [-72, -54, -36, -18, 18, 36, 54, 72]
        : [-42, -26, -10, 10, 26, 42];
      for (const px of pilasterXs) {
        const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.7, 18.0, 0.4), wainscotMat);
        pilaster.position.set(px, 0, 0.18);
        wallGroup.add(pilaster);
      }

      const framePositions = ws.idx < 2 ? [-62, -42, -22, 0, 22, 42, 62] : [-17, 17];
      framePositions.forEach((px, pIdx) => {
        if (ws.idx === 0 && px === 0) return;
        if (ws.idx === 0 && px === 22) {
          const mFrame = new THREE.Mesh(new THREE.BoxGeometry(4.8, 5.8, 0.2), wainscotMat);
          mFrame.position.set(px, 1.45, 0.12);
          wallGroup.add(mFrame);
          const mFace = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 5.3), menuMat);
          mFace.position.set(px, 1.45, 0.25);
          wallGroup.add(mFace);
          return;
        }
        const frame = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.6, 0.18), wainscotMat);
        frame.position.set(px, 1.35, 0.12);
        wallGroup.add(frame);

        const chosenMat = pIdx % 3 === 1 ? photoMat : (ws.idx + pIdx) % 2 === 0 ? artMat0 : artMat1;
        const art = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 3.0), chosenMat);
        art.position.set(px, 1.35, 0.24);
        wallGroup.add(art);
      });

      const sconceXs = ws.idx < 2
        ? [-72, -54, -36, -18, 18, 36, 54, 72]
        : [-42, -26, -10, 10, 26, 42];
      sconceXs.forEach((sx) => {
        const sconce = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), sconceMat);
        sconce.position.set(sx, 2.5, 0.45);
        wallGroup.add(sconce);
      });

      staticEnvGroup.add(wallGroup);
    });

    // Ticking Round Wall Clock on North back wall (left of TV)
    const clockGroup = new THREE.Group();
    clockGroup.position.set(centerX - 14.5, 11.4, roomMinZ + 0.24);
    const clockCase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.38, 0.26, 20),
      wainscotMat
    );
    clockCase.rotation.x = Math.PI / 2;
    clockGroup.add(clockCase);
    const clockFace = new THREE.Mesh(new THREE.CircleGeometry(1.14, 20), clockMat);
    clockFace.position.z = 0.15;
    clockGroup.add(clockFace);
    this.scene.add(clockGroup);

    // Large centered Kahvehane TV on North back wall (centered above Ocakbasi bar)
    this.tvUpdater = createTvScreenTexture();
    const tvGroup = new THREE.Group();
    tvGroup.position.set(centerX, 10.2, roomMinZ + 0.32);
    const tvChassisMat = new THREE.MeshStandardMaterial({ color: '#181412', roughness: 0.5, metalness: 0.2 });
    const tvBezel = new THREE.Mesh(new THREE.BoxGeometry(19.0, 10.9, 0.28), tvChassisMat);
    tvGroup.add(tvBezel);
    const tvShelfTrim = new THREE.Mesh(new THREE.BoxGeometry(19.16, 0.16, 0.34), trimBrassMat);
    tvShelfTrim.position.y = -5.52;
    tvGroup.add(tvShelfTrim);
    const tvScreenMat = new THREE.MeshBasicMaterial({ map: this.tvUpdater.texture });
    const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(18.4, 10.35), tvScreenMat);
    tvScreen.position.z = 0.15;
    tvScreen.userData = { kind: 'tv' };
    tvGroup.add(tvScreen);
    this.tvScreenMesh = tvScreen;
    this.envInteractables.push(tvScreen);
    this.envDisposableMats.push(
      floorMat,
      rugOuterMat,
      rugBorderMat,
      rugInnerMat,
      legMat,
      wallPlasterMat,
      wainscotMat,
      trimBrassMat,
      artMat0,
      artMat1,
      menuMat,
      photoMat,
      sconceMat,
      clockMat,
      tvChassisMat,
      tvScreenMat
    );
    this.scene.add(tvGroup);

    this.tvWallWorldZ = roomMinZ + 0.48;
    if (this.tvWallCssObj) {
      this.tvWallCssObj.position.set(centerX, 10.2, this.tvWallWorldZ);
      this.tvWallCssObj.scale.set(18.4 / this.tvWallWidthPx, 10.35 / this.tvWallHeightPx, 1);
      this.css3dScene.add(this.tvWallCssObj);
    }

    // 6 Atmosphere Windows on East & West walls with velvet drapes + single InstancedMesh rain
    const curtainMat = new THREE.MeshStandardMaterial({ color: '#53191B', roughness: 0.85 });
    const rainGeo = new THREE.BoxGeometry(0.03, 0.36, 0.03);
    const rainMat = new THREE.MeshBasicMaterial({ color: '#B7D5FF', transparent: true, opacity: 0.35 });
    const rainInstanced = new THREE.InstancedMesh(rainGeo, rainMat, 60);
    rainInstanced.frustumCulled = false;
    this.envDisposableGeoms.push(rainGeo);
    this.envDisposableMats.push(curtainMat, windowMat, rainMat);
    this.rainDrops = [];
    let rainIdx = 0;

    [-1, 1].forEach((side) => {
      const wallX = side < 0 ? roomMinX : roomMaxX;
      [-20, 14, 48].forEach((wz) => {
        const winGroup = new THREE.Group();
        winGroup.position.set(wallX - side * 0.18, 2.4, wz);
        winGroup.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;

        const pane = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 6.2), windowMat);
        winGroup.add(pane);

        const frameOuter = new THREE.Mesh(new THREE.BoxGeometry(5.3, 6.7, 0.24), wainscotMat);
        frameOuter.position.z = -0.14;
        winGroup.add(frameOuter);

        for (const mx of [-0.85, 0.85]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 6.2, 0.16), wainscotMat);
          bar.position.set(mx, 0, 0.08);
          winGroup.add(bar);
        }
        for (const my of [-1.05, 1.05]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.12, 0.16), wainscotMat);
          bar.position.set(0, my, 0.08);
          winGroup.add(bar);
        }

        for (const cx of [-2.65, 2.65]) {
          const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 6.9, 8), curtainMat);
          drape.position.set(cx, 0, 0.16);
          winGroup.add(drape);
        }

        for (let r = 0; r < 10; r += 1) {
          const localX = ((r * 37) % 44) / 10 - 2.2;
          const baseY = ((r * 19) % 52) / 10 - 2.6;
          const dx = wallX - side * 0.32;
          const dy = 2.4 + baseY;
          const dz = wz + (side === -1 ? -localX : localX);
          this._rainDummyMatrix.makeTranslation(dx, dy, dz);
          rainInstanced.setMatrixAt(rainIdx, this._rainDummyMatrix);
          this.rainDrops.push({ x: dx, y: dy, z: dz, minY: -0.4, maxY: 5.2, speed: 4.5 + (r % 3) * 1.4 });
          rainIdx += 1;
        }

        staticEnvGroup.add(winGroup);
      });
    });
    rainInstanced.instanceMatrix.needsUpdate = true;
    this.rainGroup = rainInstanced;
    this.scene.add(rainInstanced);

    // Cozy Kuzine / Fireplace in Back-Left Corner
    const hearthGroup = new THREE.Group();
    hearthGroup.position.set(-57.5, -2.35, -35.5);
    hearthGroup.rotation.y = Math.PI / 4;
    const stoveMat = new THREE.MeshStandardMaterial({ color: '#1B1918', roughness: 0.55, metalness: 0.4 });
    const stoveBody = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.1, 1.6), stoveMat);
    stoveBody.position.y = 1.55;
    hearthGroup.add(stoveBody);
    const stovePipe = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 15.0, 10), stoveMat);
    stovePipe.position.set(0, 9.8, -0.2);
    hearthGroup.add(stovePipe);
    const emberMat = new THREE.MeshBasicMaterial({ color: '#FF6A1A' });
    const emberGeo = new THREE.PlaneGeometry(1.2, 0.78);
    const firebox = new THREE.Mesh(emberGeo, emberMat);
    firebox.position.set(0, 1.1, 0.82);
    hearthGroup.add(firebox);
    const hearthLight = new THREE.PointLight('#FF772B', 10, 26, 1.4);
    hearthLight.position.set(0, 1.45, 1.65);
    hearthGroup.add(hearthLight);
    this.hearthGroup = hearthGroup;
    this.hearthLight = hearthLight;
    this.hearthEmbers = [firebox];
    this.envDisposableGeoms.push(emberGeo);
    this.envDisposableMats.push(stoveMat, emberMat);
    this.scene.add(hearthGroup);

    // Ceiling (y = 16.0) & Exposed Timber Beams spanning full 164m salon
    const ceilingMat = new THREE.MeshStandardMaterial({ color: '#1F130D', roughness: 0.9 });
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(roomW + 2, roomD + 2), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(centerX, 16.0, centerZ);
    staticEnvGroup.add(ceiling);

    [-32, -20, -8, 4, 16, 28, 40, 52, 62].forEach((bz) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(roomW, 0.65, 0.78), wainscotMat);
      beam.position.set(centerX, 15.65, bz);
      staticEnvGroup.add(beam);
    });

    // Kahvehane Ocakbasi (Tea Counter centered along North Wall at x = 18, z = -37.2)
    const barGroup = new THREE.Group();
    barGroup.position.set(centerX, -2.35, -37.2);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(14.0, 2.75, 2.6), wainscotMat);
    counter.position.y = 1.38;
    barGroup.add(counter);

    const counterTopMat = new THREE.MeshStandardMaterial({ color: '#945F37', roughness: 0.45, metalness: 0.08 });
    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.22, 2.85), counterTopMat);
    counterTop.position.y = 2.84;
    barGroup.add(counterTop);

    const copperMat = new THREE.MeshStandardMaterial({
      color: '#B86535',
      roughness: 0.24,
      metalness: 0.8
    });
    const kazanBody = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.8, 1.4), copperMat);
    kazanBody.position.set(-2.6, 3.82, 0);
    barGroup.add(kazanBody);

    const kazanRim = new THREE.Mesh(new THREE.BoxGeometry(2.94, 0.14, 1.52), trimBrassMat);
    kazanRim.position.set(-2.6, 4.74, 0);
    barGroup.add(kazanRim);

    const demlik = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 8), trimBrassMat);
    demlik.scale.set(1.05, 0.88, 1.05);
    demlik.position.set(-2.6, 5.2, 0);
    barGroup.add(demlik);

    for (const sy of [4.8, 6.4]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.16, 0.95), wainscotMat);
      shelf.position.set(1.0, sy, -1.9);
      barGroup.add(shelf);
    }
    const barGlassMat = new THREE.MeshStandardMaterial({
      color: '#DCE8EB',
      transparent: true,
      opacity: 0.65,
      roughness: 0.18
    });
    for (let i = 0; i < 10; i += 1) {
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.34, 8), barGlassMat);
      glass.position.set(-2.2 + i * 0.72, 5.05, -1.9);
      barGroup.add(glass);
    }
    staticEnvGroup.add(barGroup);

    // 2 Decorative Velvet Lounge Sofas along West & East Promenade ends
    const sofaVelvetMat = new THREE.MeshStandardMaterial({ color: '#5F2323', roughness: 0.84 });
    [
      { x: -58.5, z: 19.0, rotY: Math.PI / 2 },
      { x: 94.5, z: 19.0, rotY: -Math.PI / 2 }
    ].forEach((sf) => {
      const sofa = new THREE.Group();
      sofa.position.set(sf.x, -2.35, sf.z);
      sofa.rotation.y = sf.rotY;

      const base = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.75, 2.0), wainscotMat);
      base.position.y = 0.45;
      sofa.add(base);

      const seatCushion = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.35, 1.75), sofaVelvetMat);
      seatCushion.position.set(0, 0.95, 0.08);
      sofa.add(seatCushion);

      const backRest = new THREE.Mesh(new THREE.BoxGeometry(5.1, 1.45, 0.38), sofaVelvetMat);
      backRest.position.set(0, 1.5, -0.78);
      sofa.add(backRest);

      for (const ax of [-2.4, 2.4]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.95, 1.95), wainscotMat);
        arm.position.set(ax, 1.0, 0);
        sofa.add(arm);
      }
      staticEnvGroup.add(sofa);
    });

    // 3 Real Kahvehane Cats (Yumak, Firtina, Komur)
    this.buildKahvehaneCats(wainscotMat, trimBrassMat);

    // Potted Kahvehane Ficus Plants in Room Corners & Bar Flanks
    const plantShared = {
      potMat: new THREE.MeshStandardMaterial({ color: '#7D3B22', roughness: 0.78 }),
      trunkMat: new THREE.MeshStandardMaterial({ color: '#4A3122', roughness: 0.86 }),
      leafMat: new THREE.MeshStandardMaterial({ color: '#295732', roughness: 0.74 })
    };
    this.buildPottedPlant(-60.8, -38.5, 1.25, staticEnvGroup, plantShared);
    this.buildPottedPlant(96.8, -38.5, 1.25, staticEnvGroup, plantShared);
    this.buildPottedPlant(-60.8, 66.5, 1.2, staticEnvGroup, plantShared);
    this.buildPottedPlant(96.8, 66.5, 1.2, staticEnvGroup, plantShared);
    this.buildPottedPlant(7.5, -38.5, 1.0, staticEnvGroup, plantShared);
    this.buildPottedPlant(28.5, -38.5, 1.0, staticEnvGroup, plantShared);

    // Equal Mosaic Brass Chandeliers over ALL table bays (except Billiards which has its 3-shade Tiffany fixture) + Promenade
    const lampShared = {
      brassMat: trimBrassMat,
      globeMat: new THREE.MeshBasicMaterial({ color: '#FFE6A8' })
    };
    this.buildPendantLamp(0, 10.8, 0, 1.32, false, staticEnvGroup, lampShared);
    this.buildPendantLamp(-36, 10.8, 0, 1.26, false, staticEnvGroup, lampShared);
    this.buildPendantLamp(36, 10.8, 0, 1.26, false, staticEnvGroup, lampShared);
    this.buildPendantLamp(-36, 10.8, 38, 1.26, false, staticEnvGroup, lampShared);
    this.buildPendantLamp(0, 10.8, 38, 1.26, false, staticEnvGroup, lampShared);
    this.buildPendantLamp(36, 10.8, 38, 1.26, false, staticEnvGroup, lampShared);
    this.buildPendantLamp(72, 10.8, 38, 1.26, false, staticEnvGroup, lampShared);
    this.buildPendantLamp(centerX, 11.2, 19, 1.34, false, staticEnvGroup, lampShared);
    this.buildPendantLamp(centerX, 10.6, -24, 1.18, false, staticEnvGroup, lampShared);

    // 2 Animated Spinning Vintage Brass & Walnut Ceiling Fans along the Promenade
    this.ceilingFans = [];
    const fanShaftGeo = new THREE.CylinderGeometry(0.11, 0.14, 1.1, 10);
    const fanMotorGeo = new THREE.CylinderGeometry(0.48, 0.44, 0.36, 14);
    const fanBladeGeo = new THREE.BoxGeometry(2.6, 0.04, 0.42);
    this.envDisposableGeoms.push(fanShaftGeo, fanMotorGeo, fanBladeGeo);

    for (const fx of [-18, 54]) {
      const fanRoot = new THREE.Group();
      fanRoot.position.set(fx, 15.85, 19);

      const shaft = new THREE.Mesh(fanShaftGeo, trimBrassMat);
      shaft.position.y = -0.55;
      fanRoot.add(shaft);

      const spinner = new THREE.Group();
      spinner.position.y = -1.12;
      const motor = new THREE.Mesh(fanMotorGeo, trimBrassMat);
      spinner.add(motor);

      for (let b = 0; b < 4; b += 1) {
        const bladeHolder = new THREE.Group();
        bladeHolder.rotation.y = (b * Math.PI) / 2;
        const blade = new THREE.Mesh(fanBladeGeo, wainscotMat);
        blade.position.set(1.55, -0.02, 0);
        blade.rotation.x = 0.14;
        bladeHolder.add(blade);
        spinner.add(bladeHolder);
      }

      fanRoot.add(spinner);
      this.scene.add(fanRoot);
      this.ceilingFans.push(spinner);
    }

    this.envDisposableMats.push(
      ceilingMat,
      counterTopMat,
      copperMat,
      barGlassMat,
      sofaVelvetMat,
      plantShared.potMat,
      plantShared.trunkMat,
      plantShared.leafMat,
      lampShared.globeMat
    );

    this.mergeStaticGroup(staticEnvGroup, { receiveShadow: false });

    this.setRoomAtmosphere(this.roomAtmosphere);
  }

  buildKahvehaneCats(woodMat, brassMat) {
    const spots = [
      {
        pos: [-10.8, -1.05, 5.4],
        rotY: 0.75,
        waypoints: [
          [-10.8, -0.85, 5.4],
          [-11.8, -2.35, -0.5],
          [-9.4, -2.35, -10.5]
        ]
      },
      {
        pos: [10.8, -1.05, 5.0],
        rotY: -0.78,
        waypoints: [
          [10.8, -0.85, 5.0],
          [11.8, -2.35, -2.5],
          [9.8, -2.35, 10.6]
        ]
      },
      {
        pos: [-10.8, -1.05, -6.2],
        rotY: 0.48,
        waypoints: [
          [-10.8, -0.85, -6.2],
          [-8.4, -2.35, -13.2],
          [-4.6, -2.35, -16.8]
        ]
      }
    ];
    this.catModels = [];

    KAHVE_CATS.forEach((cat, idx) => {
      const spot = spots[idx];
      if (!spot) return;

      const root = new THREE.Group();
      root.position.set(...spot.pos);
      root.rotation.y = spot.rotY;

      // Woven wooden cat stool + plush velvet cushion
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 1.22, 14), woodMat);
      stool.position.y = -0.68;
      root.add(stool);

      const cushionMat = new THREE.MeshStandardMaterial({
        color: idx === 0 ? '#782224' : idx === 1 ? '#265341' : '#352A54',
        roughness: 0.85
      });
      const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.96, 1.02, 0.24, 16), cushionMat);
      cushion.position.y = 0.04;
      cushion.castShadow = true;
      root.add(cushion);
      this.scene.add(root);

      const mover = new THREE.Group();
      mover.position.set(...spot.waypoints[0]);
      mover.rotation.y = spot.rotY;

      // Sculpted stylized Persian / Tabby cat
      const furMat = new THREE.MeshStandardMaterial({ color: cat.furColor, roughness: 0.82 });
      const earInnerMat = new THREE.MeshStandardMaterial({ color: '#E8A8AE', roughness: 0.75 });
      const eyeMat = new THREE.MeshBasicMaterial({ color: cat.eyeColor });
      const noseMat = new THREE.MeshBasicMaterial({ color: idx === 2 ? '#4D3B3F' : '#DC8C92' });

      const catGroup = new THREE.Group();
      const scale = idx === 1 ? 0.84 : 1.0; // Fırtına is a cute kitten
      catGroup.scale.setScalar(scale);

      const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 12), furMat);
      body.scale.set(0.95, 0.85, 1.18);
      body.position.set(0, 0.26, 0);
      body.castShadow = true;
      catGroup.add(body);

      const head = new THREE.Group();
      head.position.set(0, 0.62, 0.32);
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), furMat);
      skull.scale.set(1.06, 0.96, 0.96);
      head.add(skull);

      for (const sx of [-0.18, 0.18]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 4), furMat);
        ear.position.set(sx, 0.28, -0.02);
        ear.rotation.z = sx < 0 ? 0.25 : -0.25;
        ear.rotation.y = Math.PI / 4;
        head.add(ear);

        const inner = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.12, 4), earInnerMat);
        inner.position.set(sx, 0.26, 0.04);
        inner.rotation.z = ear.rotation.z;
        head.add(inner);

        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat);
        eye.position.set(sx * 0.68, 0.04, 0.27);
        head.add(eye);
      }

      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), noseMat);
      nose.position.set(0, -0.04, 0.31);
      head.add(nose);

      // Cute brass collar tag
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 6, 14), cushionMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, 0.42, 0.22);
      catGroup.add(collar);
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), brassMat);
      bell.position.set(0, 0.39, 0.44);
      catGroup.add(bell);

      catGroup.add(head);

      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.62, 8), furMat);
      tail.position.set(0.22, 0.3, -0.46);
      tail.rotation.x = -0.82;
      tail.rotation.z = -0.45;
      catGroup.add(tail);

      mover.add(catGroup);

      // Generous invisible click hitbox moving with the cat
      const hitbox = new THREE.Mesh(
        new THREE.CylinderGeometry(1.05, 1.05, 1.55, 10),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitbox.position.y = 0.55;
      hitbox.userData = { kind: 'cat', catIndex: idx };
      mover.add(hitbox);

      this.envInteractables.push(hitbox);
      this.catModels.push({
        catIndex: idx,
        mover,
        head,
        tail,
        catGroup,
        waypoints: spot.waypoints.map((w) => new THREE.Vector3(...w)),
        homeRotY: spot.rotY,
        waypointIdx: 0,
        targetIdx: 0,
        moveProgress: 1,
        wanderWait: 5 + idx * 3.2,
        reactionTimer: 0,
        phase: idx * 2.1
      });
      this.envDisposableMats.push(cushionMat, furMat, earInnerMat, eyeMat, noseMat, hitbox.material);
      this.scene.add(mover);
    });
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

    // Cozy Table Corner Props (clear of racks, discards, and order glasses/plates)
    // 1. Nazar Boncuğu medallion on wooden rim front-left
    const nazarGroup = new THREE.Group();
    nazarGroup.position.set(-8.45, 0.03, 8.45);
    const nazarBlue = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.3, 0.05, 20),
      new THREE.MeshStandardMaterial({ color: '#1444A8', roughness: 0.18 })
    );
    const nazarWhite = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.056, 18),
      new THREE.MeshBasicMaterial({ color: '#F8FAFC' })
    );
    const nazarCyan = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.06, 16),
      new THREE.MeshBasicMaterial({ color: '#38BDF8' })
    );
    const nazarPupil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.064, 14),
      new THREE.MeshBasicMaterial({ color: '#090D16' })
    );
    nazarGroup.add(nazarBlue, nazarWhite, nazarCyan, nazarPupil);
    this.envDisposableMats.push(nazarBlue.material, nazarWhite.material, nazarCyan.material, nazarPupil.material);
    this.scene.add(nazarGroup);

    // 2. Classic Wooden Kahvehane Napkin Dispenser (Peçetelik) on far-right wooden rim
    const peceteGroup = new THREE.Group();
    peceteGroup.position.set(8.45, 0.01, -8.45);
    peceteGroup.rotation.y = -0.5;
    const peceteWood = new THREE.MeshStandardMaterial({ map: getWoodTexture(), color: '#6E4226', roughness: 0.5 });
    const peceteBase = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.38), peceteWood);
    peceteBase.position.y = 0.04;
    const peceteWall1 = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.06), peceteWood);
    peceteWall1.position.set(0, 0.22, 0.16);
    const peceteWall2 = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.06), peceteWood);
    peceteWall2.position.set(0, 0.22, -0.16);
    const napkinMat = new THREE.MeshStandardMaterial({ color: '#FAF6ED', roughness: 0.9 });
    const napkins = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.22), napkinMat);
    napkins.position.set(0, 0.28, 0);
    peceteGroup.add(peceteBase, peceteWall1, peceteWall2, napkins);
    this.envDisposableMats.push(peceteWood, napkinMat);
    this.scene.add(peceteGroup);

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
    const initialRackTheme = RACK_THEMES.find((r) => r.id === this.rackTheme) || RACK_THEMES[0];
    this.rackWoodMat = new THREE.MeshStandardMaterial({
      map: getWoodTexture(),
      color: initialRackTheme?.rackColor || '#CFA076',
      roughness: 0.44,
      metalness: 0.05
    });
    const rackWoodMat = this.rackWoodMat;
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

  createTileMesh(
    tile,
    { faceUp = true, okeyTarget = null, selected = false, mustUse = false, castShadow = true } = {}
  ) {
    let faceMat = this.backTileMat;
    if (faceUp) {
      const isOkey = isOkeyTile(tile, okeyTarget);
      const themeKey = this.tileTheme || 'ivory';
      const cacheKey = tile.isFakeOkey
        ? `fake-${themeKey}-${selected}-${mustUse}`
        : `${themeKey}-${tile.color}-${tile.number}-${isOkey}-${selected}-${mustUse}`;
      faceMat = this.tileFaceMatCache.get(cacheKey);
      if (!faceMat) {
        faceMat = new THREE.MeshStandardMaterial({
          map: getTileFaceTexture(tile, okeyTarget, { selected, mustUse, tileTheme: themeKey }),
          roughness: 0.22,
          metalness: 0.04
        });
        this.tileFaceMatCache.set(cacheKey, faceMat);
      }
    }

    // Group 0: front, Group 1: back, Group 2: bevel & sides
    const materials = [faceMat, this.backTileMat, this.sideTileMat];
    const mesh = new THREE.Mesh(this.tileGeom, materials);
    mesh.castShadow = castShadow;
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

  getDeckCountBadgeMat(count = 0) {
    const safeCount = Math.max(0, Math.floor(Number(count) || 0));
    let mat = this.deckBadgeMatCache.get(safeCount);
    if (!mat) {
      if (this.deckBadgeMatCache.size >= 120) {
        const oldestKey = this.deckBadgeMatCache.keys().next().value;
        const oldest = this.deckBadgeMatCache.get(oldestKey);
        oldest?.dispose();
        this.deckBadgeMatCache.delete(oldestKey);
      }
      mat = new THREE.SpriteMaterial({
        map: getDeckCountBadgeTexture(safeCount),
        transparent: true,
        depthWrite: false
      });
      this.deckBadgeMatCache.set(safeCount, mat);
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

  buildOrderMesh(itemId, { sipsRemaining = 4, interactive = false } = {}) {
    const g = new THREE.Group();
    const porcelainMat = new THREE.MeshStandardMaterial({ color: '#F6F2EA', roughness: 0.18 });
    const brassMat = new THREE.MeshStandardMaterial({ color: '#C79B42', roughness: 0.28, metalness: 0.78 });
    const silverMat = new THREE.MeshStandardMaterial({ color: '#D4DCE2', roughness: 0.22, metalness: 0.85 });
    const sipFrac = THREE.MathUtils.clamp(Number(sipsRemaining ?? 4) / 4, 0, 1);

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

      if (sipFrac > 0.01) {
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
        liquid.scale.set(1, 0.12 + sipFrac * 0.88, 1);
        g.add(liquid);
        this.addSteamEffect(g, 0.5);
      }

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
    } else if (itemId === 'kahve') {
      const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.04, 24), brassMat);
      saucer.position.y = 0.02;
      g.add(saucer);

      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.14, 0.28, 20), porcelainMat);
      cup.position.y = 0.18;
      g.add(cup);

      if (sipFrac > 0.01) {
        const foam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.19, 0.19, 0.03, 18),
          new THREE.MeshStandardMaterial({ color: '#4E2B17', roughness: 0.45 })
        );
        foam.position.y = 0.1 + sipFrac * 0.21;
        g.add(foam);
        this.addSteamEffect(g, 0.38);
      }

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
          color: sipFrac > 0.01 ? '#88C8A8' : '#C6E2D4',
          transparent: true,
          opacity: sipFrac > 0.01 ? 0.78 : 0.45,
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

      if (sipFrac > 0.99) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 16), brassMat);
        cap.position.y = 0.83;
        g.add(cap);
      }
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

    if (interactive) {
      const hitMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.9, 10),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitMesh.position.y = 0.42;
      hitMesh.userData = { kind: 'myDrink' };
      g.add(hitMesh);
      g.userData.drinkHitMesh = hitMesh;
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
    this.myDrinkHitMesh = null;

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
        const isMine = rel === 0;
        const mesh = this.buildOrderMesh(seatOrders.drink.itemId, {
          sipsRemaining: seatOrders.drink.sipsRemaining ?? 4,
          interactive: isMine
        });
        mesh.position.set(...anchor.drink);
        this.orderGroup.add(mesh);
        if (isMine && mesh.userData?.drinkHitMesh) {
          this.myDrinkHitMesh = mesh.userData.drinkHitMesh;
        }
      }
      if (seatOrders.food?.itemId) {
        const mesh = this.buildOrderMesh(seatOrders.food.itemId);
        mesh.position.set(...anchor.food);
        this.orderGroup.add(mesh);
      }
    }
    this.requestShadowUpdate(2);
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
      const tMesh = this.createTileMesh(
        { id: `ds-${i}`, color: 'red', number: 1 },
        { faceUp: false, castShadow: i === 5 }
      );
      tMesh.rotation.x = -Math.PI / 2;
      tMesh.position.set(-0.65, 0.085 + i * (TILE_D + 0.004), -3.85);
      this.dynamicGroup.add(tMesh);
    }
    const demoBadge = new THREE.Sprite(this.getDeckCountBadgeMat(21));
    demoBadge.position.set(-0.65, 0.085 + 5 * (TILE_D + 0.004) + TILE_D / 2 + 0.34, -3.85);
    demoBadge.scale.set(0.96, 0.40, 1);
    demoBadge.renderOrder = 4;
    this.dynamicGroup.add(demoBadge);

    const gostergeMesh = this.createTileMesh(
      { id: 'dg', color: 'red', number: 7 },
      { faceUp: true, okeyTarget: demoOkey, castShadow: false }
    );
    gostergeMesh.rotation.x = -Math.PI / 2;
    gostergeMesh.position.set(0.65, 0.17, -3.85);
    this.dynamicGroup.add(gostergeMesh);
    this.requestShadowUpdate(2);
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
    this.billiardAimingDrag = false;
    if (this.freeroamState) {
      this.freeroamState.lookDrag = null;
    }
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
    if (this._lastHighlightedSlotIdx >= 0 && this.rackSlotMeshes[this._lastHighlightedSlotIdx]) {
      this.rackSlotMeshes[this._lastHighlightedSlotIdx].material.opacity = 0;
    }
    this._lastHighlightedSlotIdx = -1;
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
      if (this.myActivity === 'billiard') {
        this.setCameraPreset('billiard');
      } else if (this.myActivity === 'spectator') {
        this.setCameraPreset('freeroam');
      } else {
        this.setCameraPreset('fp');
      }
    }

    if (state.phase === 'waiting') {
      this.handSlotData.fill(null);
      this.selectedTileIds.clear();
      this.lastRenderedRound = null;
      this.renderPlayerHeads(state, viewerIdx);
      this.requestShadowUpdate(2);
      return;
    }

    const isMyTurn = !state.isSpectator && state.phase === 'playing' && state.currentSeat === viewerIdx;
    const isFreshRoundDeal = !sameRound && !instant && !this.reducedMotion && state.phase === 'playing';
    this.lastRenderedRound = state.roundNumber;

    if (isFreshRoundDeal) {
      this.triggerDiceRoll();
      soundFX.playDiceRoll();
    }

    if (state.isSpectator && !mySeat?.hand) {
      this.handSlotData.fill(null);
      this.selectedTileIds.clear();
    } else if (!skipSlotSync && mySeat?.hand) {
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
    const deckCount = Math.max(0, state.deckCount || 0);
    const stackLayers = deckCount > 0 ? Math.max(1, Math.min(8, Math.ceil(deckCount / 6))) : 0;
    const deckGroup = new THREE.Group();
    deckGroup.position.set(-0.68, 0.02, -3.9);

    if (deckCount > 0) {
      for (let i = 0; i < stackLayers; i += 1) {
        const layer = this.createTileMesh(
          { id: `deck-${i}`, color: 'black', number: 1 },
          { faceUp: false, castShadow: i === stackLayers - 1 }
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

    const deckBadge = new THREE.Sprite(this.getDeckCountBadgeMat(deckCount));
    const badgeBaseY = deckCount > 0
      ? 0.075 + (stackLayers - 1) * (TILE_D + 0.004) + TILE_D / 2 + 0.34
      : 0.28;
    deckBadge.position.set(0, badgeBaseY, 0);
    deckBadge.scale.set(0.96, 0.40, 1);
    deckBadge.renderOrder = 4;
    if (deckCount > 0) {
      deckBadge.userData = { kind: 'drawDeck' };
      this.interactables.push(deckBadge);
    }
    deckGroup.add(deckBadge);
    this.dynamicGroup.add(deckGroup);

    if (state.gosterge) {
      const gStand = new THREE.Mesh(this.gStandGeom, this.gStandMat);
      gStand.position.set(0.68, 0.08, -3.9);
      gStand.castShadow = true;
      this.dynamicGroup.add(gStand);

      const gMesh = this.createTileMesh(state.gosterge, {
        faceUp: true,
        okeyTarget: state.okeyTarget,
        castShadow: false
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
            okeyTarget: state.okeyTarget,
            castShadow: isTop
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
    this.requestShadowUpdate(2);
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
          okeyTarget: state.okeyTarget,
          castShadow: false
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

  setCameraPreset(presetName, payload = null) {
    const prevMode = this.cameraMode;
    if (payload?.tableId) {
      this.activeSideTableTarget = {
        tableId: payload.tableId,
        seatIndex: payload.seatIndex ?? 0
      };
    }

    if (presetName === 'freeroam') {
      this.cameraMode = 'freeroam';
      this.orbitDrag = null;
      this.billiardAimingDrag = false;
      if (prevMode !== 'freeroam') {
        const sideRefId = payload?.tableId || this.activeSideTableTarget?.tableId || this.mySideTableId;
        if (prevMode === 'billiard' || this.myActivity === 'billiard') {
          this.freeroamState.pos.set(BILLIARD_WORLD_POS.x - 10.5, 3.2, BILLIARD_WORLD_POS.z);
          this.freeroamState.yaw = -Math.PI / 2;
          this.freeroamState.pitch = -0.18;
        } else if (sideRefId) {
          const def = SIDE_TABLE_DEFS.find((d) => d.id === sideRefId);
          if (def) {
            const offsetZ = def.z > 15 ? -13.2 : 13.2;
            this.freeroamState.pos.set(def.x, 3.2, def.z + offsetZ);
            this.freeroamState.yaw = def.z > 15 ? Math.PI : 0;
            this.freeroamState.pitch = -0.12;
          } else {
            this.freeroamState.pos.set(18, 3.2, 19);
            this.freeroamState.yaw = 0;
            this.freeroamState.pitch = -0.06;
          }
        } else if (this.myActivity === 'spectator') {
          this.freeroamState.pos.set(18, 3.2, 19);
          this.freeroamState.yaw = 0;
          this.freeroamState.pitch = -0.06;
        } else {
          this.freeroamState.pos.set(0, 3.2, 12.2);
          this.freeroamState.yaw = 0;
          this.freeroamState.pitch = -0.14;
        }
        this.constrainFreeroamPosition(this.freeroamState.pos);
        this.callbacks.onFreeroamMove?.({
          x: this.freeroamState.pos.x,
          z: this.freeroamState.pos.z,
          yaw: this.freeroamState.yaw,
          active: true
        });
      }
      this.targetFov = 66;
      if (this.canvas) this.canvas.style.cursor = this.isPointerLocked ? 'none' : 'grab';
      this.computeProximityTarget(true);
      return;
    }

    if (prevMode === 'freeroam') {
      this.freeroamState.keys.clear();
      this.freeroamState.lookDrag = null;
      this.freeroamState.touchLook = null;
      this.freeroamState.mobileMove.x = 0;
      this.freeroamState.mobileMove.z = 0;
      if (document.pointerLockElement === this.canvas) {
        try {
          document.exitPointerLock?.();
        } catch {
          // Ignore pointer lock exit errors
        }
      }
      if (this.activeProximityId !== null) {
        this.activeProximityId = null;
        this.callbacks.onProximityChange?.(null);
      }
      if (this.canvas) this.canvas.style.cursor = 'default';
      this.callbacks.onFreeroamMove?.({ active: false });
    }

    const sideTarget =
      this.activeSideTableTarget ||
      (this.myActivity === 'sideTable' && this.mySideTableId
        ? { tableId: this.mySideTableId, seatIndex: this.mySideSeatIndex ?? 0 }
        : null);

    if (
      presetName === 'sideTable' ||
      (this.myActivity === 'sideTable' && sideTarget && (presetName === 'fp' || presetName === 'table' || presetName === 'top'))
    ) {
      const target = payload?.tableId ? { tableId: payload.tableId, seatIndex: payload.seatIndex ?? 0 } : sideTarget;
      const sideMode = presetName === 'sideTable' ? 'fp' : presetName;
      const pose = target ? this.sideTables3d?.getSeatCameraPose(target.tableId, target.seatIndex ?? 0, sideMode) : null;
      if (pose) {
        this.cameraMode = sideMode;
        this.targetCamLook.copy(pose.target);
        this.targetSpherical.setFromVector3(pose.pos.clone().sub(pose.target));
        this.targetFov = pose.fov || 62;
        return;
      }
    }

    this.cameraMode = CAMERA_PRESETS[presetName] ? presetName : 'fp';
    const preset = CAMERA_PRESETS[this.cameraMode] || CAMERA_PRESETS.fp;
    this.targetCamLook.copy(preset.target);
    this.targetSpherical.setFromVector3(preset.pos.clone().sub(preset.target));
    this.targetFov = preset.fov || 44;
  }

  teleportFreeroam(zone = 'okey') {
    const zones = {
      okey: { x: 0, z: 12.2, yaw: 0, pitch: -0.15 },
      billiard: { x: BILLIARD_WORLD_POS.x - 10.5, z: BILLIARD_WORLD_POS.z, yaw: -Math.PI / 2, pitch: -0.2 },
      tea: { x: 18, z: -31.5, yaw: 0, pitch: -0.06 },
      tv: { x: 18, z: -24.5, yaw: 0, pitch: 0.1 }
    };
    const sideDef = SIDE_TABLE_DEFS.find((d) => d.id === zone);
    const z = sideDef
      ? {
          x: sideDef.x,
          z: sideDef.z + (sideDef.z > 15 ? -13.2 : 13.2),
          yaw: sideDef.z > 15 ? Math.PI : 0,
          pitch: -0.12
        }
      : (zones[zone] || zones.okey);
    this.cameraMode = 'freeroam';
    this.orbitDrag = null;
    this.billiardAimingDrag = false;
    this.freeroamState.pos.set(z.x, 3.2, z.z);
    this.freeroamState.yaw = z.yaw;
    this.freeroamState.pitch = z.pitch;
    this.constrainFreeroamPosition(this.freeroamState.pos);
    this.targetFov = 66;
    this.callbacks.onFreeroamMove?.({
      x: this.freeroamState.pos.x,
      z: this.freeroamState.pos.z,
      yaw: this.freeroamState.yaw,
      active: true
    });
    this.computeProximityTarget(true);
  }

  setFreeroamKey(key, isDown) {
    if (!this.freeroamState?.keys) return;
    const norm = String(key || '').toLowerCase();
    if (isDown) this.freeroamState.keys.add(norm);
    else this.freeroamState.keys.delete(norm);
  }

  clearFreeroamKeys() {
    this.freeroamState?.keys?.clear();
    if (this.freeroamState?.mobileMove) {
      this.freeroamState.mobileMove.x = 0;
      this.freeroamState.mobileMove.z = 0;
    }
  }

  setMobileMove(vx = 0, vz = 0) {
    if (!this.freeroamState?.mobileMove) return;
    this.freeroamState.mobileMove.x = THREE.MathUtils.clamp(Number(vx) || 0, -1, 1);
    this.freeroamState.mobileMove.z = THREE.MathUtils.clamp(Number(vz) || 0, -1, 1);
  }

  constrainFreeroamPosition(pos) {
    // 164 x 112 Grand Salon outer perimeter (x in [-64, 100], z in [-42, 70])
    pos.x = THREE.MathUtils.clamp(pos.x, -61.5, 97.5);
    pos.z = THREE.MathUtils.clamp(pos.z, -39.5, 67.5);
    pos.y = 3.2;

    // Push out from center Okey table (18.8 x 18.8 + chairs around origin)
    const okeyHalf = 10.2;
    if (Math.abs(pos.x) < okeyHalf && Math.abs(pos.z) < okeyHalf) {
      const dx = okeyHalf - Math.abs(pos.x);
      const dz = okeyHalf - Math.abs(pos.z);
      if (dx < dz) pos.x = pos.x >= 0 ? okeyHalf : -okeyHalf;
      else pos.z = pos.z >= 0 ? okeyHalf : -okeyHalf;
    }

    // Push out from scaled Billiard table (2.40x scale at (72, 0))
    const bx = BILLIARD_WORLD_POS.x;
    const bz = BILLIARD_WORLD_POS.z;
    const bHalfW = 5.8;
    const bHalfL = 9.9;
    if (Math.abs(pos.x - bx) < bHalfW && Math.abs(pos.z - bz) < bHalfL) {
      const dx = bHalfW - Math.abs(pos.x - bx);
      const dz = bHalfL - Math.abs(pos.z - bz);
      if (dx < dz) pos.x = pos.x >= bx ? bx + bHalfW : bx - bHalfW;
      else pos.z = pos.z >= bz ? bz + bHalfL : bz - bHalfL;
    }

    // Push out from centered Ocakbasi Tea Bar (x = 18, z = -37.2, width 14.4)
    if (Math.abs(pos.x - 18) < 8.4 && pos.z < -34.0) {
      pos.z = -34.0;
    }

    // Push out from West & East Promenade lounge sofas
    if (pos.x < -56.2 && Math.abs(pos.z - 19.0) < 3.2) {
      pos.x = -56.2;
    }
    if (pos.x > 92.2 && Math.abs(pos.z - 19.0) < 3.2) {
      pos.x = 92.2;
    }

    // Push out from all 6 Grand Salon side tables matching their 17.6 / 20.4x14.4 geometry
    for (const def of SIDE_TABLE_DEFS) {
      const dx = pos.x - def.x;
      const dz = pos.z - def.z;
      if (def.shape === 'oval') {
        const rx = 11.2;
        const rz = 8.4;
        const q = Math.hypot(dx / rx, dz / rz);
        if (q < 1 && q > 0.001) {
          pos.x = def.x + (dx / q);
          pos.z = def.z + (dz / q);
        } else if (q <= 0.001) {
          pos.z = def.z + rz;
        }
      } else if (def.shape === 'round') {
        const dist = Math.hypot(dx, dz);
        const minR = 9.8;
        if (dist < minR && dist > 0.001) {
          pos.x = def.x + (dx / dist) * minR;
          pos.z = def.z + (dz / dist) * minR;
        } else if (dist <= 0.001) {
          pos.z = def.z + minR;
        }
      } else {
        const half = 9.8;
        if (Math.abs(dx) < half && Math.abs(dz) < half) {
          const px = half - Math.abs(dx);
          const pz = half - Math.abs(dz);
          if (px < pz) pos.x = def.x + (dx >= 0 ? half : -half);
          else pos.z = def.z + (dz >= 0 ? half : -half);
        }
      }
    }
  }

  computeProximityTarget(forceEmit = false) {
    if (this.cameraMode !== 'freeroam' || this.demoMode) {
      if (this.activeProximityId !== null) {
        this.activeProximityId = null;
        this.callbacks.onProximityChange?.(null);
      }
      return null;
    }

    const px = this.freeroamState.pos.x;
    const pz = this.freeroamState.pos.z;
    const candidates = [];

    const okeyDist = Math.hypot(px, pz);
    if (okeyDist < 14.2) {
      candidates.push({
        id: 'okey',
        type: 'okey',
        label: 'Okey Masasına Otur',
        dist: Math.max(0, okeyDist - 9.8)
      });
    }

    const bDist = Math.hypot(px - BILLIARD_WORLD_POS.x, pz - BILLIARD_WORLD_POS.z);
    if (bDist < 12.6) {
      candidates.push({
        id: 'billiard',
        type: 'billiard',
        label: 'Bilardo Masasına Geç',
        dist: Math.max(0, bDist - 7.5)
      });
    }

    for (const def of SIDE_TABLE_DEFS) {
      const tDist = Math.hypot(px - def.x, pz - def.z);
      if (tDist < 14.8) {
        candidates.push({
          id: `side:${def.id}`,
          type: 'sideTable',
          tableId: def.id,
          kind: def.kind,
          label: `${def.title} Masasına Otur`,
          dist: Math.max(0, tDist - 9.5)
        });
      }
    }

    if (Math.abs(px - 18) < 10.5 && pz < -30.5) {
      candidates.push({
        id: 'bar',
        type: 'bar',
        label: 'Ocakbaşından Sipariş Ver',
        dist: Math.abs(pz + 34.0)
      });
    }

    if (Math.abs(px - 18) < 13.0 && pz < -27.0) {
      candidates.push({
        id: 'tv',
        type: 'tv',
        label: 'Kahve TV Kanalını Değiştir',
        dist: Math.abs(pz + 30.0) + 1.2
      });
    }

    for (const c of this.catModels) {
      if (!c.mover) continue;
      const cDist = Math.hypot(px - c.mover.position.x, pz - c.mover.position.z);
      if (cDist < 3.8) {
        const catName = KAHVE_CATS[c.catIndex]?.name || 'Kediyi';
        candidates.push({
          id: `cat:${c.catIndex}`,
          type: 'cat',
          catIndex: c.catIndex,
          label: `${catName} ile İlgilen`,
          dist: cDist
        });
      }
    }

    candidates.sort((a, b) => a.dist - b.dist);
    const best = candidates[0] || null;
    const nextId = best ? best.id : null;
    if (forceEmit || nextId !== this.activeProximityId) {
      this.activeProximityId = nextId;
      this.callbacks.onProximityChange?.(best);
    }
    return best;
  }

  isMyBilliardTurn() {
    if (!this.billiardState || this.billiardState.phase !== 'playing') return false;
    if (this.myActivity !== 'billiard' || this.billiardSeatIndex === null) return false;
    return this.billiardState.currentSeat === this.billiardSeatIndex && !this.billiard3d?.isAnimatingShot;
  }

  setActivityContext({ myActivity, billiardSeatIndex, localPlayerId, mySideTableId, mySideSeatIndex } = {}) {
    if (myActivity) {
      this.myActivity = myActivity;
      if (myActivity !== 'sideTable') {
        this.activeSideTableTarget = null;
      }
    }
    if (billiardSeatIndex !== undefined) this.billiardSeatIndex = billiardSeatIndex;
    if (localPlayerId !== undefined) this.localPlayerId = localPlayerId;
    if (mySideTableId !== undefined) this.mySideTableId = mySideTableId;
    if (mySideSeatIndex !== undefined) this.mySideSeatIndex = mySideSeatIndex;
  }

  updateBilliardState(billiardState) {
    this.billiardState = billiardState || null;
    if (this.billiard3d && billiardState) {
      this.billiard3d.updateState(billiardState, this.localPlayerId);
    }
    if (!billiardState?.ballInHand) {
      this.billiardPlaceMode = false;
    }
  }

  updateRemoteBilliardAim(aimState) {
    if (!aimState || !this.billiard3d?.currentState) return;
    if (this.isMyBilliardTurn()) return;
    this.billiard3d.currentState.aimState = { ...aimState };
  }

  setBilliardPlaceMode(enabled) {
    this.billiardPlaceMode = Boolean(enabled && this.billiardState?.ballInHand && this.isMyBilliardTurn());
  }

  setBilliardPower(power) {
    const p = THREE.MathUtils.clamp(Number(power) || 0.65, 0.12, 1);
    this.billiard3d?.setLocalAim(undefined, p);
    if (this.isMyBilliardTurn()) {
      const now = performance.now();
      if (now - this._lastBilliardAimEmitAt > 65) {
        this._lastBilliardAimEmitAt = now;
        this.callbacks.onBilliardAim?.(this.billiard3d.localAimAngle, p);
      }
    }
  }

  getBilliardAim() {
    return {
      angle: this.billiard3d?.localAimAngle ?? -Math.PI / 2,
      power: this.billiard3d?.localAimPower ?? 0.65
    };
  }

  renderRoamers(roamers = [], myRoamerKey = null) {
    const list = (Array.isArray(roamers) ? roamers : []).filter(
      (r) => r && r.key && (this.cameraMode !== 'freeroam' || r.key !== myRoamerKey)
    );
    const activeKeys = new Set(list.map((r) => r.key));

    // Remove departed roamers and clean up their materials
    for (const [key, entry] of this.roamerActors.entries()) {
      if (!activeKeys.has(key)) {
        this.roamerGroup.remove(entry.group);
        if (Array.isArray(entry.disposableMats)) {
          for (const m of entry.disposableMats) {
            m?.map?.dispose?.();
            m?.dispose?.();
          }
        }
        const npMat = this.roamerNameMats.get(key);
        if (npMat) {
          npMat.map?.dispose();
          npMat.dispose();
          this.roamerNameMats.delete(key);
        }
        this.roamerActors.delete(key);
      }
    }

    for (const r of list) {
      let entry = this.roamerActors.get(r.key);
      if (!entry) {
        const disposableMats = [];
        const charActor = buildKahveCharacter({
          bustGeom: this.bustGeom,
          avatarMatCache: this.avatarMatCache,
          avatar: r.avatar || 'avatar-1',
          name: r.name || 'Gezgin',
          vestColor: '#395C58',
          teamColor: '#C59A4B',
          isBot: false,
          isActive: false,
          seated: false,
          medRadius: 0.92,
          headY: 2.65,
          showNameplate: true,
          nameplateY: 4.18,
          rearPfp: true,
          disposableMats
        });

        const rx = Number(r.x) || 0;
        const rz = Number(r.z) || 0;
        charActor.group.position.set(rx, -0.39, rz);
        charActor.group.rotation.y = (Number(r.yaw) || 0) + Math.PI;
        if (charActor.nameplateMat) {
          this.roamerNameMats.set(r.key, charActor.nameplateMat);
        }

        this.roamerGroup.add(charActor.group);
        entry = {
          group: charActor.group,
          actor: charActor,
          disposableMats,
          targetPos: new THREE.Vector3(rx, -0.39, rz),
          targetYaw: (Number(r.yaw) || 0) + Math.PI,
          walkPhase: Math.random() * Math.PI * 2,
          prevPos: new THREE.Vector3(rx, -0.39, rz)
        };
        this.roamerActors.set(r.key, entry);
      } else {
        entry.targetPos.set(Number(r.x) || 0, -0.39, Number(r.z) || 0);
        entry.targetYaw = (Number(r.yaw) || 0) + Math.PI;
      }
    }
  }

  isMyPlayTurn() {
    if (this.currentState?.isSpectator) return false;
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

    this.onPointerLockChange = () => {
      this.isPointerLocked = document.pointerLockElement === this.canvas;
      if (this.canvas && this.cameraMode === 'freeroam') {
        this.canvas.style.cursor = this.isPointerLocked ? 'none' : 'grab';
      }
      this.callbacks.onPointerLockChange?.(this.isPointerLocked);
    };

    this.onDocumentMouseMove = (e) => {
      if (this.demoMode || this.cameraMode !== 'freeroam' || !this.isPointerLocked) return;
      if (document.querySelector('dialog[open]')) return;
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      if (dx === 0 && dy === 0) return;
      this.freeroamState.yaw -= dx * 0.0024;
      this.freeroamState.pitch = THREE.MathUtils.clamp(
        this.freeroamState.pitch - dy * 0.0022,
        -0.78,
        0.58
      );
    };

    this.onPointerDown = (e) => {
      if (this.demoMode) return;
      this.updatePointer(e.clientX, e.clientY);

      if (this.cameraMode === 'freeroam') {
        const clickTargets = [
          ...this.interactables,
          ...(this.myDrinkHitMesh ? [this.myDrinkHitMesh] : []),
          ...this.envInteractables
        ];

        if (e.pointerType === 'touch') {
          this.raycaster.setFromCamera(this.pointer, this.camera);
          const hits = this.raycaster.intersectObjects(clickTargets, false);
          if (hits.length > 0) {
            const data = hits[0].object?.userData || {};
            if (data.kind === 'cat') {
              this.triggerCatReaction(data.catIndex);
              this.callbacks.onCatClick?.(data.catIndex);
              return;
            }
            if (data.kind === 'tv') {
              this.callbacks.onTvClick?.();
              return;
            }
          }
          this.freeroamState.touchLook = {
            pointerId: e.pointerId,
            x: e.clientX,
            y: e.clientY
          };
          try {
            this.canvas.setPointerCapture?.(e.pointerId);
          } catch {
            // Ignore pointer capture errors
          }
          return;
        }

        if (this.isPointerLocked) {
          this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
          const hits = this.raycaster.intersectObjects(clickTargets, false);
          if (hits.length > 0) {
            const data = hits[0].object?.userData || {};
            if (data.kind === 'cat') {
              this.triggerCatReaction(data.catIndex);
              try {
                document.exitPointerLock?.();
              } catch {
                // Ignore
              }
              this.callbacks.onCatClick?.(data.catIndex);
              return;
            }
            if (data.kind === 'tv') {
              try {
                document.exitPointerLock?.();
              } catch {
                // Ignore
              }
              this.callbacks.onTvClick?.();
              return;
            }
          }
          return;
        }

        if (e.button === 0) {
          this.raycaster.setFromCamera(this.pointer, this.camera);
          const hits = this.raycaster.intersectObjects(clickTargets, false);
          if (hits.length > 0) {
            const data = hits[0].object?.userData || {};
            if (data.kind === 'cat') {
              this.triggerCatReaction(data.catIndex);
              this.callbacks.onCatClick?.(data.catIndex);
              return;
            }
            if (data.kind === 'tv') {
              this.callbacks.onTvClick?.();
              return;
            }
          }
          if (!document.querySelector('dialog[open]') && this.canvas.requestPointerLock) {
            try {
              const maybePromise = this.canvas.requestPointerLock();
              if (maybePromise && typeof maybePromise.catch === 'function') {
                maybePromise.catch(() => {});
              }
            } catch {
              // Fallback to lookDrag below
            }
          }
        }

        this.cancelActiveInteractions();
        this.freeroamState.lookDrag = { x: e.clientX, y: e.clientY };
        this.canvas.style.cursor = 'grabbing';
        try {
          this.canvas.setPointerCapture?.(e.pointerId);
          this.activePointerId = e.pointerId;
        } catch {
          // Ignore pointer capture errors
        }
        return;
      }

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
      const clickTargets = [
        ...this.interactables,
        ...(this.sideTables3d?.getInteractables() || []),
        ...(this.myDrinkHitMesh ? [this.myDrinkHitMesh] : []),
        ...this.envInteractables
      ];
      const hits = this.raycaster.intersectObjects(clickTargets, false);

      if (hits.length === 0) {
        return;
      }

      const hit = hits[0].object;
      const data = hit.userData;

      if (data.kind === 'sideAction') {
        this.callbacks.onSideTableAction?.(data.tableId, data.action, data.payload || {});
        return;
      }

      if (data.kind === 'sideSetup') {
        this.callbacks.onSideTableSetup?.(data.tableId, data.command);
        return;
      }

      if (data.kind === 'billiardFelt') {
        if (this.isMyBilliardTurn()) {
          const local = this.billiard3d.worldToLocalFelt(hits[0].point);
          if (this.billiardPlaceMode && this.billiardState?.ballInHand) {
            this.billiardPlaceMode = false;
            this.callbacks.onBilliardPlaceBall?.(local.x, local.z);
            return;
          }
          this.cancelActiveInteractions();
          const cueBall = this.billiard3d.ballMeshes.get(0);
          if (cueBall) {
            const dx = local.x - cueBall.position.x;
            const dz = local.z - cueBall.position.z;
            if (Math.hypot(dx, dz) > 0.02) {
              const angle = Math.atan2(dz, dx);
              this.billiard3d.setLocalAim(angle);
              this.callbacks.onBilliardAim?.(angle, this.billiard3d.localAimPower);
            }
          }
          this.billiardAimingDrag = true;
          this.canvas.style.cursor = 'crosshair';
          try {
            this.canvas.setPointerCapture?.(e.pointerId);
            this.activePointerId = e.pointerId;
          } catch {
            // Ignore pointer capture errors
          }
          return;
        }
        return;
      }

      if (this.currentState?.isSpectator && data.kind !== 'cat' && data.kind !== 'tv') {
        return;
      }

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
      } else if (data.kind === 'myDrink') {
        this.callbacks.onDrinkClick?.();
      } else if (data.kind === 'cat') {
        this.triggerCatReaction(data.catIndex);
        this.callbacks.onCatClick?.(data.catIndex);
      } else if (data.kind === 'tv') {
        this.callbacks.onTvClick?.();
      }
    };

    this.onPointerMove = (e) => {
      if (this.freeroamState?.touchLook && e.pointerId === this.freeroamState.touchLook.pointerId) {
        const dx = e.clientX - this.freeroamState.touchLook.x;
        const dy = e.clientY - this.freeroamState.touchLook.y;
        this.freeroamState.touchLook.x = e.clientX;
        this.freeroamState.touchLook.y = e.clientY;

        this.freeroamState.yaw -= dx * 0.0062;
        this.freeroamState.pitch = THREE.MathUtils.clamp(
          this.freeroamState.pitch - dy * 0.0052,
          -0.78,
          0.58
        );
        const now = performance.now();
        if (now - this.freeroamState.lastEmitAt > 95) {
          this.freeroamState.lastEmitAt = now;
          this.freeroamState.lastSentX = this.freeroamState.pos.x;
          this.freeroamState.lastSentZ = this.freeroamState.pos.z;
          this.freeroamState.lastSentYaw = this.freeroamState.yaw;
          this.callbacks.onFreeroamMove?.({
            x: this.freeroamState.pos.x,
            z: this.freeroamState.pos.z,
            yaw: this.freeroamState.yaw,
            active: true
          });
        }
        return;
      }

      if (this.freeroamState?.lookDrag && !this.isPointerLocked) {
        const dx = e.clientX - this.freeroamState.lookDrag.x;
        const dy = e.clientY - this.freeroamState.lookDrag.y;
        this.freeroamState.lookDrag = { x: e.clientX, y: e.clientY };

        this.freeroamState.yaw -= dx * 0.0055;
        this.freeroamState.pitch = THREE.MathUtils.clamp(
          this.freeroamState.pitch - dy * 0.0045,
          -0.75,
          0.55
        );
        const now = performance.now();
        if (now - this.freeroamState.lastEmitAt > 95) {
          this.freeroamState.lastEmitAt = now;
          this.freeroamState.lastSentX = this.freeroamState.pos.x;
          this.freeroamState.lastSentZ = this.freeroamState.pos.z;
          this.freeroamState.lastSentYaw = this.freeroamState.yaw;
          this.callbacks.onFreeroamMove?.({
            x: this.freeroamState.pos.x,
            z: this.freeroamState.pos.z,
            yaw: this.freeroamState.yaw,
            active: true
          });
        }
        return;
      }

      if (this.billiardAimingDrag) {
        if (!this.isMyBilliardTurn()) {
          this.billiardAimingDrag = false;
          this.canvas.style.cursor = 'default';
          releaseActivePointer();
          return;
        }
        const feltMesh = this.billiard3d?.getFeltHitMesh();
        if (feltMesh) {
          this.updatePointer(e.clientX, e.clientY);
          this.raycaster.setFromCamera(this.pointer, this.camera);
          const hits = this.raycaster.intersectObject(feltMesh, false);
          if (hits.length > 0) {
            const local = this.billiard3d.worldToLocalFelt(hits[0].point);
            const cueBall = this.billiard3d.ballMeshes.get(0);
            if (cueBall) {
              const dx = local.x - cueBall.position.x;
              const dz = local.z - cueBall.position.z;
              if (Math.hypot(dx, dz) > 0.02) {
                const angle = Math.atan2(dz, dx);
                this.billiard3d.setLocalAim(angle);
                const now = performance.now();
                if (now - this._lastBilliardAimEmitAt > 65) {
                  this._lastBilliardAimEmitAt = now;
                  this.callbacks.onBilliardAim?.(angle, this.billiard3d.localAimPower);
                }
              }
            }
          }
        }
        return;
      }

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

          const isFlipped = this.flippedTileIds.has(this.dragState.tile.id);
          const rackPt = this._dragRackPt;
          const hasRackHit =
            this.rackDragPlane &&
            this.southRackGroup &&
            this.raycaster.ray.intersectPlane(this.rackDragPlane, rackPt);

          let overRackPlane = false;
          let hoverSlotIdx = slotHits.length > 0 ? slotHits[0].object.userData.slotIdx : -1;
          if (hasRackHit) {
            const localPt = this._dragLocalPt.copy(rackPt);
            this.southRackGroup.worldToLocal(localPt);
            if (
              slotHits.length > 0 ||
              (Math.abs(localPt.x) <= 5.15 && localPt.y >= -0.2 && localPt.y <= 2.7)
            ) {
              overRackPlane = true;
              if (hoverSlotIdx < 0) {
                hoverSlotIdx = this.findNearestRackSlot(localPt);
              }
              const frontWorld = this._dragFrontWorld
                .set(
                  THREE.MathUtils.clamp(localPt.x, -4.95, 4.95),
                  THREE.MathUtils.clamp(localPt.y, 0.25, 2.35),
                  0.36
                )
                .applyMatrix4(this.southRackGroup.matrixWorld);
              if (!this.dragTargetPos) this.dragTargetPos = new THREE.Vector3();
              this.dragTargetPos.copy(frontWorld);
              this._dragEuler.set(-0.32, isFlipped ? Math.PI : 0, 0, 'XYZ');
              if (!this.dragTargetQuat) this.dragTargetQuat = new THREE.Quaternion();
              this.dragTargetQuat.setFromEuler(this._dragEuler);
            }
          } else if (slotHits.length > 0) {
            overRackPlane = true;
          }

          const nextHighlightIdx =
            overRackPlane && hoverSlotIdx >= 0 && this.rackSlotMeshes[hoverSlotIdx]
              ? hoverSlotIdx
              : -1;
          if (this._lastHighlightedSlotIdx !== nextHighlightIdx) {
            if (this._lastHighlightedSlotIdx >= 0 && this.rackSlotMeshes[this._lastHighlightedSlotIdx]) {
              this.rackSlotMeshes[this._lastHighlightedSlotIdx].material.opacity = 0;
            }
            if (nextHighlightIdx >= 0 && this.rackSlotMeshes[nextHighlightIdx]) {
              this.rackSlotMeshes[nextHighlightIdx].material.opacity = 0.45;
            }
            this._lastHighlightedSlotIdx = nextHighlightIdx;
          }

          let dragTablePt = null;
          if (!overRackPlane) {
            const dragPt = this._dragTablePt;
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
              this._dragEuler.set(-0.82, isFlipped ? Math.PI : 0, 0, 'XYZ');
              if (!this.dragTargetQuat) this.dragTargetQuat = new THREE.Quaternion();
              this.dragTargetQuat.setFromEuler(this._dragEuler);
            }
          }

          const overDiscard = !overRackPlane && this.isMyPlayTurn() && this.isOverRightDiscardZone(dragTablePt);
          this.setRightDiscardHighlight(overDiscard, true);
        }
        return;
      }

      if (this.demoMode) return;
      const now = performance.now();
      if (now - this.lastHoverCheckTime < 65) return;
      this.lastHoverCheckTime = now;
      if (document.querySelector('dialog[open]')) return;

      this.updatePointer(e.clientX, e.clientY);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      this._hoverTargets.length = 0;
      for (let i = 0; i < this.interactables.length; i += 1) {
        this._hoverTargets.push(this.interactables[i]);
      }
      const sideInteractables = this.sideTables3d?.getInteractables() || [];
      for (let i = 0; i < sideInteractables.length; i += 1) {
        this._hoverTargets.push(sideInteractables[i]);
      }
      if (this.myDrinkHitMesh) {
        this._hoverTargets.push(this.myDrinkHitMesh);
      }
      for (let i = 0; i < this.envInteractables.length; i += 1) {
        this._hoverTargets.push(this.envInteractables[i]);
      }
      const hits = this.raycaster.intersectObjects(this._hoverTargets, false);
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        const hitKind = hitObj?.userData?.kind;
        this.hoveredSideMesh = (hitKind === 'sideAction' || hitKind === 'sideSetup') ? hitObj : null;
        if (hitKind === 'billiardFelt') {
          this.canvas.style.cursor = this.isMyBilliardTurn()
            ? 'crosshair'
            : (this.cameraMode === 'freeroam' ? (this.isPointerLocked ? 'none' : 'grab') : 'default');
        } else {
          this.canvas.style.cursor = 'pointer';
        }
      } else {
        this.hoveredSideMesh = null;
        this.canvas.style.cursor = this.cameraMode === 'freeroam'
          ? (this.isPointerLocked ? 'none' : 'grab')
          : 'default';
      }
    };

    this.onPointerUp = (e) => {
      if (this.freeroamState?.touchLook && e.pointerId === this.freeroamState.touchLook.pointerId) {
        this.freeroamState.touchLook = null;
        try {
          if (this.canvas.hasPointerCapture?.(e.pointerId)) {
            this.canvas.releasePointerCapture(e.pointerId);
          }
        } catch {
          // Ignore pointer capture errors
        }
        this.callbacks.onFreeroamMove?.({
          x: this.freeroamState.pos.x,
          z: this.freeroamState.pos.z,
          yaw: this.freeroamState.yaw,
          active: this.cameraMode === 'freeroam'
        });
        return;
      }

      if (this.freeroamState?.lookDrag) {
        this.freeroamState.lookDrag = null;
        this.canvas.style.cursor = this.cameraMode === 'freeroam'
          ? (this.isPointerLocked ? 'none' : 'grab')
          : 'default';
        releaseActivePointer();
        this.callbacks.onFreeroamMove?.({
          x: this.freeroamState.pos.x,
          z: this.freeroamState.pos.z,
          yaw: this.freeroamState.yaw,
          active: this.cameraMode === 'freeroam'
        });
        return;
      }

      if (this.billiardAimingDrag) {
        this.billiardAimingDrag = false;
        this.canvas.style.cursor = 'default';
        releaseActivePointer();
        if (this.isMyBilliardTurn()) {
          this.callbacks.onBilliardAim?.(
            this.billiard3d.localAimAngle,
            this.billiard3d.localAimPower
          );
        }
        return;
      }

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
      if (this._lastHighlightedSlotIdx >= 0 && this.rackSlotMeshes[this._lastHighlightedSlotIdx]) {
        this.rackSlotMeshes[this._lastHighlightedSlotIdx].material.opacity = 0;
      }
      this._lastHighlightedSlotIdx = -1;
      this.requestShadowUpdate(2);
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
          if (this.handSlotData[targetSlotIdx] == null) {
            this.handSlotData[targetSlotIdx] = drag.tile;
            this.handSlotData[fromIdx] = null;
          } else {
            // Insert-shift: vacate fromIdx first, then slide intermediate tiles toward nearest empty slot
            this.handSlotData[fromIdx] = null;
            const rowStart = targetSlotIdx < RACK_COLS ? 0 : RACK_COLS;
            const rowEnd = rowStart + RACK_COLS - 1;
            let emptyIdx = -1;
            const maxDist = this.handSlotData.length;
            const preferRightFirst = targetSlotIdx > fromIdx;
            for (let d = 1; d < RACK_COLS; d += 1) {
              const first = preferRightFirst ? targetSlotIdx + d : targetSlotIdx - d;
              const second = preferRightFirst ? targetSlotIdx - d : targetSlotIdx + d;
              if (first >= rowStart && first <= rowEnd && this.handSlotData[first] == null) {
                emptyIdx = first;
                break;
              }
              if (second >= rowStart && second <= rowEnd && this.handSlotData[second] == null) {
                emptyIdx = second;
                break;
              }
            }
            if (emptyIdx === -1) {
              for (let d = 1; d < maxDist; d += 1) {
                if (targetSlotIdx + d < maxDist && this.handSlotData[targetSlotIdx + d] == null) {
                  emptyIdx = targetSlotIdx + d;
                  break;
                }
                if (targetSlotIdx - d >= 0 && this.handSlotData[targetSlotIdx - d] == null) {
                  emptyIdx = targetSlotIdx - d;
                  break;
                }
              }
            }
            if (emptyIdx > targetSlotIdx) {
              for (let i = emptyIdx; i > targetSlotIdx; i -= 1) {
                this.handSlotData[i] = this.handSlotData[i - 1];
              }
              this.handSlotData[targetSlotIdx] = drag.tile;
            } else if (emptyIdx >= 0 && emptyIdx < targetSlotIdx) {
              for (let i = emptyIdx; i < targetSlotIdx; i += 1) {
                this.handSlotData[i] = this.handSlotData[i + 1];
              }
              this.handSlotData[targetSlotIdx] = drag.tile;
            } else {
              this.handSlotData[targetSlotIdx] = drag.tile;
            }
          }
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

    this.onPointerCancel = (e) => {
      if (e?.pointerId != null && this.freeroamState?.touchLook) {
        if (e.pointerId === this.freeroamState.touchLook.pointerId) {
          this.freeroamState.touchLook = null;
          return;
        }
        if (this.activePointerId == null) return;
      }
      this.cancelActiveInteractions();
    };

    this.onWheel = (e) => {
      if (this.demoMode || this.cameraMode === 'freeroam') return;
      const minRadius =
        this.cameraMode === 'billiard'
          ? 5.5
          : this.cameraMode === 'sideTable'
            ? 4.2
            : 9.5;
      this.targetSpherical.radius = THREE.MathUtils.clamp(
        this.targetSpherical.radius + e.deltaY * 0.008,
        minRadius,
        22.0
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
      this.css3dRenderer?.setSize(w, h);
      this._css3dMatrixValid = false;
    };

    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('mousemove', this.onDocumentMouseMove);
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
    this.requestShadowUpdate(2);
  }

  triggerCatReaction(catIndex = 0) {
    const target = this.catModels.find((c) => c.catIndex === Number(catIndex));
    if (target) {
      target.reactionTimer = 1.65;
    }
  }

  setTvState(tvState = null) {
    this.tvState = tvState || null;
    this.tvUpdater?.update(this.tvState);
  }

  getTvWallHostElement() {
    return this.tvWallHostEl;
  }

  setTvWallVisible(visible) {
    const next = Boolean(visible);
    if (this.tvWallVisible === next) return;
    this.tvWallVisible = next;
    this._css3dMatrixValid = false;
    if (this.tvWallCssObj) {
      this.tvWallCssObj.visible = next;
    }
    const nextDisplay = next ? '' : 'none';
    this._lastCss3dDisplay = nextDisplay;
    if (this.css3dRenderer?.domElement) {
      this.css3dRenderer.domElement.style.display = nextDisplay;
    }
  }

  setRoomAtmosphere(atmosphere = 'rainy') {
    const valid = atmosphere === 'afternoon' || atmosphere === 'midnight' ? atmosphere : 'rainy';
    this.roomAtmosphere = valid;
    const winTex = getWindowAtmosphereTexture(valid);
    for (const mat of this.windowMats) {
      mat.map = winTex;
      mat.needsUpdate = true;
    }
    if (this.rainGroup) {
      this.rainGroup.visible = this.qualityMode !== 'performance' && valid === 'rainy';
    }
    if (valid === 'afternoon') {
      this.scene.background?.set('#2A1A10');
      if (this.scene.fog) this.scene.fog.color.set('#2A1A10');
      if (this.envLights?.hemi) {
        this.envLights.hemi.color.set('#FFE2B0');
        this.envLights.hemi.groundColor.set('#4A2B18');
        this.envLights.hemi.intensity = 1.32;
      }
      if (this.envLights?.pendantLight) {
        this.envLights.pendantLight.color.set('#FFD699');
        this.envLights.pendantLight.intensity = 48;
      }
      if (this.envLights?.billiardLight) {
        this.envLights.billiardLight.color.set('#FFE4AD');
        this.envLights.billiardLight.intensity = 38;
      }
      if (this.envLights?.westWingLight) {
        this.envLights.westWingLight.color.set('#FFD89E');
        this.envLights.westWingLight.intensity = 34;
      }
      if (this.envLights?.southLoungeLight) {
        this.envLights.southLoungeLight.color.set('#FFD394');
        this.envLights.southLoungeLight.intensity = 32;
      }
      if (this.envLights?.barLight) {
        this.envLights.barLight.color.set('#FFE3AD');
        this.envLights.barLight.intensity = 24;
      }
      if (this.envLights?.keyLight) {
        this.envLights.keyLight.color.set('#FFD091');
        this.envLights.keyLight.intensity = 1.55;
      }
      if (this.envLights?.rimLight) {
        this.envLights.rimLight.color.set('#FFB36B');
        this.envLights.rimLight.intensity = 0.48;
      }
      if (this.hearthLight) {
        this.hearthLight.intensity = 3.5;
      }
    } else if (valid === 'midnight') {
      this.scene.background?.set('#0E0908');
      if (this.scene.fog) this.scene.fog.color.set('#0E0908');
      if (this.envLights?.hemi) {
        this.envLights.hemi.color.set('#C9B8E8');
        this.envLights.hemi.groundColor.set('#1F140E');
        this.envLights.hemi.intensity = 0.92;
      }
      if (this.envLights?.pendantLight) {
        this.envLights.pendantLight.color.set('#FFC57A');
        this.envLights.pendantLight.intensity = 52;
      }
      if (this.envLights?.billiardLight) {
        this.envLights.billiardLight.color.set('#FFD68A');
        this.envLights.billiardLight.intensity = 44;
      }
      if (this.envLights?.westWingLight) {
        this.envLights.westWingLight.color.set('#FFC77D');
        this.envLights.westWingLight.intensity = 40;
      }
      if (this.envLights?.southLoungeLight) {
        this.envLights.southLoungeLight.color.set('#FFC378');
        this.envLights.southLoungeLight.intensity = 36;
      }
      if (this.envLights?.barLight) {
        this.envLights.barLight.color.set('#FFD796');
        this.envLights.barLight.intensity = 28;
      }
      if (this.envLights?.keyLight) {
        this.envLights.keyLight.color.set('#FFE4BA');
        this.envLights.keyLight.intensity = 1.0;
      }
      if (this.envLights?.rimLight) {
        this.envLights.rimLight.color.set('#7A8FD6');
        this.envLights.rimLight.intensity = 0.38;
      }
      if (this.hearthLight) {
        this.hearthLight.intensity = 15;
      }
    } else {
      this.scene.background?.set('#160E09');
      if (this.scene.fog) this.scene.fog.color.set('#160E09');
      if (this.envLights?.hemi) {
        this.envLights.hemi.color.set('#FFEBD2');
        this.envLights.hemi.groundColor.set('#2B1C13');
        this.envLights.hemi.intensity = 1.15;
      }
      if (this.envLights?.pendantLight) {
        this.envLights.pendantLight.color.set('#FFD18C');
        this.envLights.pendantLight.intensity = 56;
      }
      if (this.envLights?.billiardLight) {
        this.envLights.billiardLight.color.set('#FFDF9E');
        this.envLights.billiardLight.intensity = 42;
      }
      if (this.envLights?.westWingLight) {
        this.envLights.westWingLight.color.set('#FFD08E');
        this.envLights.westWingLight.intensity = 38;
      }
      if (this.envLights?.southLoungeLight) {
        this.envLights.southLoungeLight.color.set('#FFCC88');
        this.envLights.southLoungeLight.intensity = 34;
      }
      if (this.envLights?.barLight) {
        this.envLights.barLight.color.set('#FFE0A8');
        this.envLights.barLight.intensity = 26;
      }
      if (this.envLights?.keyLight) {
        this.envLights.keyLight.color.set('#FFF0D4');
        this.envLights.keyLight.intensity = 1.28;
      }
      if (this.envLights?.rimLight) {
        this.envLights.rimLight.color.set('#CBD8FF');
        this.envLights.rimLight.intensity = 0.35;
      }
      if (this.hearthLight) {
        this.hearthLight.intensity = 8;
      }
    }
    this.requestShadowUpdate(2);
  }

  setRackTheme(themeId = 'walnut') {
    const preset = RACK_THEMES.find((r) => r.id === themeId) || RACK_THEMES[0];
    if (!preset) return;
    this.rackTheme = preset.id;
    if (this.rackWoodMat) {
      this.rackWoodMat.color.set(preset.rackColor);
      this.rackWoodMat.needsUpdate = true;
    }
    if (this.coverWoodMat) {
      this.coverWoodMat.color.set(preset.color);
      this.coverWoodMat.needsUpdate = true;
    }
    this.requestShadowUpdate(2);
  }

  setTileTheme(themeId = 'ivory') {
    const preset = TILE_THEMES.find((t) => t.id === themeId) || TILE_THEMES[0];
    if (!preset || this.tileTheme === preset.id) return;
    this.tileTheme = preset.id;
    if (this.sideTileMat) {
      this.sideTileMat.color.set(preset.side);
      this.sideTileMat.needsUpdate = true;
    }
    if (this.backTileMat) {
      this.backTileMat.map = getTileBackTexture(preset.id);
      this.backTileMat.needsUpdate = true;
    }
    for (const mat of this.tileFaceMatCache.values()) {
      mat?.dispose();
    }
    this.tileFaceMatCache.clear();
    if (this.demoMode) {
      this.buildDemoSetup();
    } else if (this.currentState) {
      this.renderGameState(this.currentState, { skipSlotSync: true, instant: true });
    } else {
      this.requestShadowUpdate(2);
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
    const frameNow = performance.now();
    const rawDt = this._lastFrameNow ? frameNow - this._lastFrameNow : 16.6;
    this._lastFrameNow = frameNow;
    this._frameCounter += 1;

    if (this.qualityMode === 'auto') {
      if (rawDt > 26 && rawDt < 250) {
        this._perfSlowFrames += 1;
        this._perfFastFrames = 0;
        if (this._perfSlowFrames >= 25 && this._perfTier < 2) {
          this._perfTier += 1;
          this._perfSlowFrames = 0;
          this.applyEffectivePixelRatio();
        }
      } else if (rawDt < 19) {
        this._perfFastFrames += 1;
        this._perfSlowFrames = 0;
        if (this._perfFastFrames >= 120 && this._perfTier > 0) {
          this._perfTier -= 1;
          this._perfFastFrames = 0;
          this.applyEffectivePixelRatio();
        }
      } else {
        this._perfSlowFrames = Math.max(0, this._perfSlowFrames - 1);
      }
    }

    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.demoMode && !this.reducedMotion) {
      this.targetSpherical.theta += dt * 0.08;
    }

    // Live ticking wall clock (updates once per second without per-frame Date allocations)
    if (this.clockUpdater) {
      const secNow = (Date.now() / 1000) | 0;
      if (secNow !== this.lastClockSec) {
        this.lastClockSec = secNow;
        this.clockUpdater.update(new Date());
      }
    }

    // Gentle window raindrops via single InstancedMesh draw call
    if (
      !this.reducedMotion &&
      this.qualityMode !== 'performance' &&
      this.roomAtmosphere === 'rainy' &&
      this.rainGroup &&
      this.rainDrops.length > 0
    ) {
      for (let i = 0; i < this.rainDrops.length; i += 1) {
        const r = this.rainDrops[i];
        r.y -= r.speed * dt;
        if (r.y < r.minY) {
          r.y = r.maxY;
        }
        this._rainDummyMatrix.makeTranslation(r.x, r.y, r.z);
        this.rainGroup.setMatrixAt(i, this._rainDummyMatrix);
      }
      this.rainGroup.instanceMatrix.needsUpdate = true;
    }

    // Subtle kuzine hearth flicker
    if (!this.reducedMotion && this.hearthLight) {
      const baseHearth = this.roomAtmosphere === 'midnight'
        ? 15
        : this.roomAtmosphere === 'afternoon'
          ? 3.5
          : 8;
      const t = frameNow * 0.006;
      this.hearthLight.intensity = baseHearth + Math.sin(t * 2.1) * 1.4 + Math.cos(t * 3.7) * 0.9;
      for (const em of this.hearthEmbers) {
        em.scale.setScalar(0.95 + Math.sin(t * 2.9) * 0.06);
      }
    }

    // Kahvehane cats gentle wandering, breathing + interaction bounce
    if (this.catModels.length > 0) {
      for (const c of this.catModels) {
        c.phase += dt * 1.8;
        let walkingBob = 0;

        if (!this.reducedMotion && c.mover && c.waypoints?.length > 1) {
          if (c.reactionTimer > 0) {
            c.wanderWait = Math.max(c.wanderWait, 3.5);
          } else if (c.moveProgress < 1) {
            const fromPt = c.waypoints[c.waypointIdx];
            const toPt = c.waypoints[c.targetIdx];
            const dist = Math.max(0.5, fromPt.distanceTo(toPt));
            c.moveProgress = Math.min(1, c.moveProgress + (dt * 1.55) / dist);
            const ease = c.moveProgress * c.moveProgress * (3 - 2 * c.moveProgress);
            c.mover.position.lerpVectors(fromPt, toPt, ease);
            // Smooth arc when hopping up/down cushion
            if (Math.abs(fromPt.y - toPt.y) > 0.4) {
              c.mover.position.y += Math.sin(c.moveProgress * Math.PI) * 0.55;
            }
            const dx = toPt.x - fromPt.x;
            const dz = toPt.z - fromPt.z;
            if (Math.hypot(dx, dz) > 0.05) {
              const targetAngle = Math.atan2(dx, dz);
              let diff = targetAngle - c.mover.rotation.y;
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;
              c.mover.rotation.y += diff * Math.min(1, dt * 6);
            }
            walkingBob = Math.abs(Math.sin(c.phase * 3.8)) * 0.055;
            if (c.moveProgress >= 1) {
              c.waypointIdx = c.targetIdx;
              c.wanderWait = c.waypointIdx === 0 ? (7 + Math.random() * 8) : (4 + Math.random() * 5);
            }
          } else {
            if (c.waypointIdx === 0) {
              let diff = c.homeRotY - c.mover.rotation.y;
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;
              c.mover.rotation.y += diff * Math.min(1, dt * 4);
            }
            c.wanderWait -= dt;
            if (c.wanderWait <= 0) {
              c.targetIdx = (c.waypointIdx + 1) % c.waypoints.length;
              c.moveProgress = 0;
            }
          }
        }

        if (c.reactionTimer > 0) {
          c.reactionTimer = Math.max(0, c.reactionTimer - dt);
          if (!this.reducedMotion) {
            const w = c.reactionTimer * 14;
            c.head.rotation.z = Math.sin(w) * 0.24;
            c.head.rotation.x = Math.cos(w * 0.7) * 0.14;
            c.tail.rotation.z = -0.45 + Math.sin(w * 1.3) * 0.35;
            c.catGroup.position.y = Math.abs(Math.sin(w * 0.5)) * 0.12;
          }
        } else {
          c.head.rotation.z = this.reducedMotion ? 0 : Math.sin(c.phase * 0.6) * 0.05;
          c.head.rotation.x = this.reducedMotion ? 0 : Math.cos(c.phase * 0.45) * 0.03;
          c.tail.rotation.z = -0.45 + (this.reducedMotion ? 0 : Math.sin(c.phase * 1.2) * 0.14);
          c.catGroup.position.y = walkingBob;
        }
      }
    }

    // 3D Round-start Dice Roll Animation
    if (this.diceAnim) {
      this.diceAnim.elapsed += dt;
      const t = Math.min(1, this.diceAnim.elapsed / this.diceAnim.duration);
      const bounce = Math.abs(Math.sin(t * Math.PI * 3.0)) * (1 - t) * 1.15;
      for (const d of this.diceAnim.dice) {
        d.mesh.position.lerpVectors(d.startPos, d.endPos, 1 - (1 - t) ** 2);
        d.mesh.position.y = THREE.MathUtils.lerp(d.startPos.y, d.endPos.y, t) + bounce;
        const rotEase = 1 - (1 - t) ** 3;
        d.mesh.rotation.set(
          THREE.MathUtils.lerp(d.startRot.x, d.endRot.x, rotEase),
          THREE.MathUtils.lerp(d.startRot.y, d.endRot.y, rotEase),
          THREE.MathUtils.lerp(d.startRot.z, d.endRot.z, rotEase)
        );
      }
      if (this.diceAnim.elapsed >= this.diceAnim.duration + this.diceAnim.holdDuration) {
        this.diceAnim = null;
        this.diceGroup.visible = false;
      }
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
    if (!this.reducedMotion && this.qualityMode !== 'performance' && this.steamParticles.length > 0) {
      for (const sp of this.steamParticles) {
        if (!sp.mesh.visible) sp.mesh.visible = true;
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

    // Tick 3D Billiard Table, Side Card Tables & Spinning Salon Ceiling Fans
    this.billiard3d?.tick(dt, {
      isMyBilliardTurn: this.isMyBilliardTurn(),
      localPlayerId: this.localPlayerId
    });
    this.sideTables3d?.tick(dt, this.hoveredSideMesh);
    if (!this.reducedMotion && this.ceilingFans?.length > 0) {
      for (const fan of this.ceilingFans) {
        fan.rotation.y += dt * 1.45;
      }
    }

    // Smoothly interpolate live roaming avatars + natural walking arm/leg stride
    if (this.roamerActors.size > 0) {
      const rDamp = this.reducedMotion ? 1 : Math.min(1, dt * 10);
      for (const entry of this.roamerActors.values()) {
        entry.group.position.lerp(entry.targetPos, rDamp);
        let diff = entry.targetYaw - entry.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        entry.group.rotation.y += diff * rDamp;

        const stepDist = entry.prevPos ? entry.group.position.distanceTo(entry.prevPos) : 0;
        const speed = dt > 0.001 ? stepDist / dt : 0;
        if (entry.prevPos) entry.prevPos.copy(entry.group.position);

        const a = entry.actor;
        if (a) {
          if (!this.reducedMotion && speed > 0.12) {
            entry.walkPhase = (entry.walkPhase || 0) + dt * Math.min(12, 4.5 + speed * 0.9);
            const swing = Math.sin(entry.walkPhase) * 0.48;
            if (a.leftLegPivot) a.leftLegPivot.rotation.x = swing;
            if (a.rightLegPivot) a.rightLegPivot.rotation.x = -swing;
            if (a.leftArmPivot) a.leftArmPivot.rotation.x = -0.14 - swing * 0.65;
            if (a.rightArmPivot) a.rightArmPivot.rotation.x = -0.14 + swing * 0.65;
            if (a.bodyGroup) a.bodyGroup.position.y = Math.abs(Math.cos(entry.walkPhase)) * 0.055;
          } else {
            const reset = Math.min(1, dt * 8);
            if (a.leftLegPivot) a.leftLegPivot.rotation.x *= 1 - reset;
            if (a.rightLegPivot) a.rightLegPivot.rotation.x *= 1 - reset;
            if (a.leftArmPivot) a.leftArmPivot.rotation.x += (-0.14 - a.leftArmPivot.rotation.x) * reset;
            if (a.rightArmPivot) a.rightArmPivot.rotation.x += (-0.14 - a.rightArmPivot.rotation.x) * reset;
            if (a.bodyGroup) a.bodyGroup.position.y *= 1 - reset;
          }
        }
      }
    }

    const damp = this.reducedMotion ? 1 : Math.min(1, dt * 8);
    if (this.targetFov && Math.abs(this.camera.fov - this.targetFov) > 0.05) {
      this.camera.fov += (this.targetFov - this.camera.fov) * damp;
      this.camera.updateProjectionMatrix();
    }

    if (this.cameraMode === 'freeroam' && !this.demoMode) {
      const fs = this.freeroamState;
      const keys = fs.keys;
      const keyForward =
        (keys.has('keyw') || keys.has('arrowup') ? 1 : 0) -
        (keys.has('keys') || keys.has('arrowdown') ? 1 : 0);
      const keyStrafe =
        (keys.has('keyd') || keys.has('arrowright') ? 1 : 0) -
        (keys.has('keya') || keys.has('arrowleft') ? 1 : 0);

      const joyF = -(fs.mobileMove?.z || 0);
      const joyS = fs.mobileMove?.x || 0;
      const rawF = keyForward + joyF;
      const rawS = keyStrafe + joyS;
      const mag = Math.hypot(rawF, rawS);

      if (mag > 0.05) {
        const scale = mag > 1 ? 1 / mag : 1;
        const fNorm = rawF * scale;
        const sNorm = rawS * scale;
        const sprint = keys.has('shiftleft') || keys.has('shiftright');
        const speed = sprint ? 10.5 : 6.4;

        const fx = -Math.sin(fs.yaw);
        const fz = -Math.cos(fs.yaw);
        const rx = Math.cos(fs.yaw);
        const rz = -Math.sin(fs.yaw);

        fs.pos.x += (fx * fNorm + rx * sNorm) * speed * dt;
        fs.pos.z += (fz * fNorm + rz * sNorm) * speed * dt;
        this.constrainFreeroamPosition(fs.pos);
      }

      if (frameNow - fs.lastEmitAt > 95) {
        const moved =
          fs.lastSentX === null ||
          Math.hypot(fs.pos.x - fs.lastSentX, fs.pos.z - fs.lastSentZ) > 0.05 ||
          Math.abs(fs.yaw - (fs.lastSentYaw ?? 0)) > 0.03;
        if (moved) {
          fs.lastEmitAt = frameNow;
          fs.lastSentX = fs.pos.x;
          fs.lastSentZ = fs.pos.z;
          fs.lastSentYaw = fs.yaw;
          this.callbacks.onFreeroamMove?.({
            x: fs.pos.x,
            z: fs.pos.z,
            yaw: fs.yaw,
            active: true
          });
        }
      }

      if (frameNow - this.lastProximityCheckAt > 110) {
        this.lastProximityCheckAt = frameNow;
        this.computeProximityTarget(false);
      }

      const cosPitch = Math.cos(fs.pitch);
      const lx = -Math.sin(fs.yaw) * cosPitch;
      const ly = Math.sin(fs.pitch);
      const lz = -Math.cos(fs.yaw) * cosPitch;

      this.camera.position.copy(fs.pos);
      this._roamTmpLook.set(fs.pos.x + lx * 8, fs.pos.y + ly * 8, fs.pos.z + lz * 8);
      this.camera.lookAt(this._roamTmpLook);
    } else {
      this.camSpherical.radius += (this.targetSpherical.radius - this.camSpherical.radius) * damp;
      this.camSpherical.phi += (this.targetSpherical.phi - this.camSpherical.phi) * damp;
      this.camSpherical.theta += (this.targetSpherical.theta - this.camSpherical.theta) * damp;
      this.camTarget.lerp(this.targetCamLook, damp);

      this._camOffsetVec.setFromSpherical(this.camSpherical);
      this.camera.position.copy(this.camTarget).add(this._camOffsetVec);
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
    }

    if (this.shadowFramesPending > 0) {
      this.shadowFramesPending -= 1;
      this.renderer.shadowMap.needsUpdate = true;
    } else if ((this.tileAnimations.length > 0 || this.dragState?.moved) && this._frameCounter % 3 === 0) {
      this.renderer.shadowMap.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
    if (this.tvWallVisible && this.css3dRenderer && this.tvWallCssObj) {
      const camDir = this._tvTmpDir || (this._tvTmpDir = new THREE.Vector3());
      const toTv = this._tvTmpToTv || (this._tvTmpToTv = new THREE.Vector3());
      this.camera.getWorldDirection(camDir);
      toTv.subVectors(this.tvWallCssObj.position, this.camera.position);
      const inFrontOfWall = this.camera.position.z > (this.tvWallWorldZ + 0.8) && camDir.dot(toTv) > 0;
      const nextDisplay = inFrontOfWall ? '' : 'none';
      if (this._lastCss3dDisplay !== nextDisplay) {
        this._lastCss3dDisplay = nextDisplay;
        this.css3dRenderer.domElement.style.display = nextDisplay;
        this._css3dMatrixValid = false;
      }
      if (inFrontOfWall) {
        this.camera.updateMatrixWorld();
        const worldEl = this.camera.matrixWorldInverse.elements;
        const projEl = this.camera.projectionMatrix.elements;
        let changed = !this._css3dMatrixValid;
        if (!changed) {
          for (let i = 0; i < 16; i += 1) {
            if (
              Math.abs(worldEl[i] - this._lastCss3dWorldMatrix[i]) > 1e-5 ||
              Math.abs(projEl[i] - this._lastCss3dProjMatrix[i]) > 1e-5
            ) {
              changed = true;
              break;
            }
          }
        }
        if (changed) {
          this._lastCss3dWorldMatrix.set(worldEl);
          this._lastCss3dProjMatrix.set(projEl);
          this._css3dMatrixValid = true;
          this.css3dRenderer.render(this.css3dScene, this.camera);
        }
      }
    }
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.cancelActiveInteractions();
    this.clearFreeroamKeys();
    this.billiard3d?.dispose();
    this.sideTables3d?.dispose();
    this.envRT?.dispose();
    this.rainGroup?.dispose?.();
    this.css3dRenderer?.domElement?.remove();
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('mousemove', this.onDocumentMouseMove);
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
      this.confettiGeom,
      ...this.envDisposableGeoms
    ];
    for (const g of staticGeoms) g?.dispose();

    const staticMats = [
      this.sideTileMat,
      this.backTileMat,
      this.rearCapMat,
      this.coverWoodMat,
      this.coverBrassMat,
      this.rackWoodMat,
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
      ...this.confettiMats,
      ...this.envDisposableMats,
      ...this.lobbyDisposableMats
    ];
    for (const m of staticMats) {
      m?.map?.dispose?.();
      m?.dispose?.();
    }
    this.lobbyDisposableMats.length = 0;

    this.clockUpdater?.texture?.dispose();
    this.tvUpdater?.texture?.dispose();

    for (const b of this.speechBubbles.values()) {
      b.sprite.material?.map?.dispose();
      b.sprite.material?.dispose();
    }
    this.speechBubbles.clear();

    for (const entry of this.roamerActors.values()) {
      if (Array.isArray(entry.disposableMats)) {
        for (const m of entry.disposableMats) {
          m?.map?.dispose?.();
          m?.dispose?.();
        }
      }
    }
    for (const mat of this.roamerNameMats.values()) {
      mat?.map?.dispose();
      mat?.dispose();
    }
    this.roamerNameMats.clear();
    this.roamerActors.clear();

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
    for (const mat of this.deckBadgeMatCache.values()) {
      mat?.dispose();
    }
    this.deckBadgeMatCache.clear();
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
