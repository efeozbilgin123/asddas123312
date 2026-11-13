import * as THREE from 'three';
import { canLayoffTile } from '../../shared/melds.js';
import { isOkeyTile } from '../../shared/tiles.js';
import { soundFX } from './sound.js';
import {
  createNameplateTexture,
  getAvatarTexture,
  getFeltTexture,
  getKahveBackdropTexture,
  getTileBackTexture,
  getTileFaceTexture,
  getWoodTexture
} from './textures.js';

const TILE_W = 0.62;
const TILE_H = 0.88;
const TILE_D = 0.13;

const RACK_COLS = 14;
const RACK_ROWS = 2;
const RACK_SPACING_X = 0.67;

const CAMERA_PRESETS = {
  table: {
    pos: new THREE.Vector3(0, 12.2, 14.4),
    target: new THREE.Vector3(0, 0.45, 1.5)
  },
  top: {
    pos: new THREE.Vector3(0, 18.2, 4.4),
    target: new THREE.Vector3(0, 0.1, 0.6)
  },
  rack: {
    pos: new THREE.Vector3(0, 7.6, 12.8),
    target: new THREE.Vector3(0, 0.75, 4.4)
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
    this.scene.background = new THREE.Color('#130D0A');
    this.scene.fog = new THREE.FogExp2('#130D0A', 0.011);

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.demoMode = true;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.interactables = [];
    this.rackSlotMeshes = [];
    this.handSlotData = new Array(RACK_COLS * RACK_ROWS).fill(null);
    this.selectedTileIds = new Set();
    this.currentState = null;

    this.dragState = null;
    this.orbitDrag = null;
    this.tileAnimations = [];
    this.trackedMeshes = new Map();
    this.discardTopMeshes = new Map();
    this.meldTileMeshes = new Map();
    this.lastDiscardTopIds = [null, null, null, null];
    this.lastTableTileIds = new Set();
    this.lastHandIds = new Set();

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

    this.dynamicGroup = new THREE.Group();
    this.scene.add(this.dynamicGroup);

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
      new THREE.ConeGeometry(0.45 * scale, 0.38 * scale, 16),
      brassMat
    );
    cap.position.y = 0.24 * scale;
    group.add(cap);

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(0.42 * scale, 20, 16),
      new THREE.MeshStandardMaterial({
        color: '#FFE099',
        emissive: '#FF9E3D',
        emissiveIntensity: 1.6,
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
    finial.position.y = -0.68 * scale;
    group.add(finial);

    if (addLight) {
      const pt = new THREE.PointLight('#FFBD6B', 22, 26, 1.5);
      pt.position.y = -0.35 * scale;
      group.add(pt);
    }

    this.scene.add(group);
  }

  buildEnvironment() {
    const hemi = new THREE.HemisphereLight('#FFEBD2', '#261A12', 0.92);
    this.scene.add(hemi);

    // Warm kahvehane overhead key light
    const pendantLight = new THREE.PointLight('#FFCF86', 54, 42, 1.35);
    pendantLight.position.set(0, 9.6, 0.5);
    this.scene.add(pendantLight);

    const keyLight = new THREE.DirectionalLight('#FFF0D4', 1.3);
    keyLight.position.set(6, 16, 9);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 42;
    const d = 14;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0004;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#CBD8FF', 0.36);
    rimLight.position.set(-9, 9, -10);
    this.scene.add(rimLight);

    // Dark oak café floor + Turkish kilim rug under table
    const floorMat = new THREE.MeshStandardMaterial({
      map: getWoodTexture(),
      color: '#4F3424',
      roughness: 0.85
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(54, 54), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.35;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const rugMat = new THREE.MeshStandardMaterial({
      color: '#5C221C',
      roughness: 0.95
    });
    const rug = new THREE.Mesh(new THREE.BoxGeometry(24, 0.04, 24), rugMat);
    rug.position.y = -2.32;
    rug.receiveShadow = true;
    this.scene.add(rug);

    // Pedestal table leg under center
    const legMat = new THREE.MeshStandardMaterial({
      map: getWoodTexture(),
      color: '#633D26',
      roughness: 0.65
    });
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.2, 2.1, 24), legMat);
    pedestal.position.y = -1.35;
    this.scene.add(pedestal);

    // 3D Kahvehane Interior Room (Walls, Wainscoting, Windows, Ceiling Beams, Samovar Bar)
    const wallPlasterMat = new THREE.MeshStandardMaterial({
      color: '#322017',
      roughness: 0.92
    });
    const wainscotMat = new THREE.MeshStandardMaterial({
      map: getWoodTexture(),
      color: '#53321F',
      roughness: 0.72
    });
    const trimBrassMat = new THREE.MeshStandardMaterial({
      color: '#B58B3B',
      roughness: 0.36,
      metalness: 0.65
    });
    const paintingMat = new THREE.MeshStandardMaterial({
      map: getKahveBackdropTexture(),
      roughness: 0.65
    });

    const roomHalf = 22.5;
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

      const upper = new THREE.Mesh(new THREE.PlaneGeometry(45, 16), wallPlasterMat);
      wallGroup.add(upper);

      const lowerWood = new THREE.Mesh(new THREE.BoxGeometry(45, 5.2, 0.28), wainscotMat);
      lowerWood.position.set(0, -5.2, 0.14);
      wallGroup.add(lowerWood);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(45, 0.24, 0.42), trimBrassMat);
      rail.position.set(0, -2.55, 0.2);
      wallGroup.add(rail);

      // Framed paintings & warm sconces on each wall
      [-11.5, 0, 11.5].forEach((px, pIdx) => {
        if (wallIdx === 0 && px === 0) return; // Keep center back wall open for Ocakbaşı counter
        const frame = new THREE.Mesh(new THREE.BoxGeometry(4.8, 3.2, 0.18), wainscotMat);
        frame.position.set(px, 0.8, 0.12);
        wallGroup.add(frame);

        const art = new THREE.Mesh(
          new THREE.PlaneGeometry(4.2, 2.65),
          (wallIdx + pIdx) % 2 === 0
            ? paintingMat
            : new THREE.MeshStandardMaterial({
                color: '#734224',
                emissive: '#3D1E0C',
                emissiveIntensity: 0.45,
                roughness: 0.7
              })
        );
        art.position.set(px, 0.8, 0.23);
        wallGroup.add(art);
      });

      // Warm wall sconces between frames
      [-6.0, 6.0].forEach((sx) => {
        const sconce = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 12, 10),
          new THREE.MeshStandardMaterial({
            color: '#FFE099',
            emissive: '#FF9E3D',
            emissiveIntensity: 1.4
          })
        );
        sconce.position.set(sx, 1.3, 0.35);
        wallGroup.add(sconce);
      });

      this.scene.add(wallGroup);
    });

    // Arched Evening Windows on East & West walls
    [-1, 1].forEach((side) => {
      const winGroup = new THREE.Group();
      winGroup.position.set(side * (roomHalf - 0.16), 1.4, -5.5);
      winGroup.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;

      const glowPane = new THREE.Mesh(
        new THREE.PlaneGeometry(4.2, 5.4),
        new THREE.MeshBasicMaterial({ color: '#4B3221' })
      );
      winGroup.add(glowPane);

      const frameOuter = new THREE.Mesh(new THREE.BoxGeometry(4.6, 5.8, 0.24), wainscotMat);
      frameOuter.position.z = -0.14;
      winGroup.add(frameOuter);

      for (const mx of [-0.7, 0.7]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 5.4, 0.16), wainscotMat);
        bar.position.set(mx, 0, 0.08);
        winGroup.add(bar);
      }
      for (const my of [-0.9, 0.9]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 0.16), wainscotMat);
        bar.position.set(0, my, 0.08);
        winGroup.add(bar);
      }
      this.scene.add(winGroup);
    });

    // Ceiling & Exposed Timber Beams
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 46),
      new THREE.MeshStandardMaterial({ color: '#1E130D', roughness: 0.95 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 13.4;
    this.scene.add(ceiling);

    [-14, -7, 0, 7, 14].forEach((bz) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(45, 0.55, 0.7), wainscotMat);
      beam.position.set(0, 13.1, bz);
      this.scene.add(beam);
    });

    // Kahvehane Ocakbaşı (Tea Counter + Brass Samovar) against back wall
    const barGroup = new THREE.Group();
    barGroup.position.set(0, -2.35, -19.8);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(10.5, 2.7, 2.2), wainscotMat);
    counter.position.y = 1.35;
    barGroup.add(counter);

    const counterTop = new THREE.Mesh(
      new THREE.BoxGeometry(10.8, 0.18, 2.45),
      new THREE.MeshStandardMaterial({ color: '#8A5630', roughness: 0.38 })
    );
    counterTop.position.y = 2.78;
    barGroup.add(counterTop);

    // Brass Samovar (Semaver)
    const samovarBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.58, 1.35, 18),
      trimBrassMat
    );
    samovarBody.position.set(-2.2, 3.55, 0);
    barGroup.add(samovarBody);

    const samovarDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 16, 12),
      trimBrassMat
    );
    samovarDome.position.set(-2.2, 4.25, 0);
    barGroup.add(samovarDome);

    const backShelf = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.18, 0.9), wainscotMat);
    backShelf.position.set(0, 5.2, -1.5);
    barGroup.add(backShelf);

    const barLight = new THREE.PointLight('#FFB75E', 18, 16, 1.4);
    barLight.position.set(0, 5.6, 0.5);
    barGroup.add(barLight);
    this.scene.add(barGroup);

    // 5 Hanging Turkish Brass Mosaic Pendant Lamps (positioned high above player heads!)
    this.buildPendantLamp(0, 10.4, 0, 1.25, false);
    this.buildPendantLamp(-9.5, 8.6, -9.5, 1.0, true);
    this.buildPendantLamp(9.5, 8.6, -9.5, 1.0, true);
    this.buildPendantLamp(-9.5, 8.6, 9.5, 1.0, false);
    this.buildPendantLamp(9.5, 8.6, 9.5, 1.0, false);
  }

  buildTeaGlass(x, z) {
    const glassGroup = new THREE.Group();
    glassGroup.position.set(x, 0.03, z);

    const saucer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.32, 0.04, 24),
      new THREE.MeshStandardMaterial({ color: '#F3EFE6', roughness: 0.2 })
    );
    saucer.position.y = 0.02;
    glassGroup.add(saucer);

    const tea = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.14, 0.36, 20),
      new THREE.MeshStandardMaterial({
        color: '#8E250B',
        roughness: 0.12,
        transparent: true,
        opacity: 0.92
      })
    );
    tea.position.y = 0.24;
    glassGroup.add(tea);

    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.19, 0.14, 20, 1, true),
      new THREE.MeshStandardMaterial({
        color: '#FFFDF8',
        roughness: 0.08,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide
      })
    );
    rim.position.y = 0.44;
    glassGroup.add(rim);

    this.scene.add(glassGroup);
  }

  buildTable() {
    const woodMat = new THREE.MeshStandardMaterial({
      map: getWoodTexture(),
      color: '#C79A74',
      roughness: 0.48,
      metalness: 0.06
    });
    const feltMat = new THREE.MeshStandardMaterial({
      map: getFeltTexture(),
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

    // Emerald wool felt playing surface
    const felt = new THREE.Mesh(new THREE.BoxGeometry(16.6, 0.08, 16.6), feltMat);
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

    // Two ince belli Turkish tea glasses on far table rim corners
    this.buildTeaGlass(-7.95, -7.65);
    this.buildTeaGlass(7.95, -7.65);

    // Tilted drag plane over rack + flat table drag plane
    this.tableDragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.95);

    // Four discard pad coordinates: each seat discards to their RIGHT,
    // so seat rel=3 (left neighbor) discards RIGHT NEXT to the left edge of your South rack!
    this.discardZoneCoords = [
      new THREE.Vector3(5.85, 0.04, 6.25),   // rel 0 (Your right edge of rack)
      new THREE.Vector3(6.25, 0.04, -5.85),  // rel 1
      new THREE.Vector3(-5.85, 0.04, -6.25), // rel 2
      new THREE.Vector3(-5.85, 0.04, 6.25)   // rel 3 (Directly left of your rack!)
    ];

    for (let rel = 0; rel < 4; rel += 1) {
      const pos = this.discardZoneCoords[rel];
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(1.12, 0.03, 1.38),
        new THREE.MeshStandardMaterial({
          color: '#0F3625',
          roughness: 0.88
        })
      );
      pad.position.set(pos.x, 0.02, pos.z);
      pad.receiveShadow = true;
      this.scene.add(pad);
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

  createTileMesh(tile, { faceUp = true, okeyTarget = null, selected = false, mustUse = false } = {}) {
    const faceMat = faceUp
      ? new THREE.MeshStandardMaterial({
          map: getTileFaceTexture(tile, okeyTarget, { selected, mustUse }),
          roughness: 0.22,
          metalness: 0.04
        })
      : this.backTileMat;

    // Group 0: front, Group 1: back, Group 2: bevel & sides
    const materials = [faceMat, this.backTileMat, this.sideTileMat];
    const mesh = new THREE.Mesh(this.tileGeom, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  renderPlayerHeads(state, viewerIdx) {
    const teamMode = state.options?.teamMode || 'solo';
    const seatPositions = [
      { rel: 0, pos: [-5.95, 0.0, 8.15], headY: 1.05, medRadius: 0.48, compact: true },
      { rel: 1, pos: [8.9, 0.0, 0], headY: 2.55, medRadius: 0.68, compact: false },
      { rel: 2, pos: [0, 0.0, -8.9], headY: 2.75, medRadius: 0.72, compact: false },
      { rel: 3, pos: [-8.9, 0.0, 0], headY: 2.55, medRadius: 0.68, compact: false }
    ];

    for (const cfg of seatPositions) {
      const seatIdx = (viewerIdx + cfg.rel) % 4;
      const seat = state.seats[seatIdx];
      if (!seat) continue;

      const isActive = state.phase === 'playing' && state.currentSeat === seatIdx;
      const teamColor = teamMode === 'paired'
        ? seat.teamIndex === 0
          ? '#F4C44E'
          : '#56B4E9'
        : '#B58D54';

      const holder = new THREE.Group();
      holder.position.set(...cfg.pos);
      // Orient player seat & shoulders toward table center (local +Z -> table center)
      holder.lookAt(0, 0, 0);

      const torsoColor = teamMode === 'paired'
        ? (seat.teamIndex === 0 ? '#6A4D1F' : '#1F4B6A')
        : '#3A2D26';
      const torsoMat = new THREE.MeshStandardMaterial({
        color: torsoColor,
        roughness: 0.75
      });

      if (!cfg.compact) {
        // Wooden kahvehane chair back behind the seated player
        const chairWood = new THREE.MeshStandardMaterial({
          map: getWoodTexture(),
          color: '#6C4227',
          roughness: 0.62
        });
        const chairBack = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.95, 0.14), chairWood);
        chairBack.position.set(0, 1.0, -0.66);
        chairBack.castShadow = true;
        holder.add(chairBack);

        // Seated lower torso + curved shoulders bust right below circular PFP
        const torso = new THREE.Mesh(
          new THREE.CylinderGeometry(0.62, 0.78, 1.35, 24),
          torsoMat
        );
        torso.position.y = 0.85;
        holder.add(torso);

        const shoulders = new THREE.Mesh(
          new THREE.SphereGeometry(0.76, 24, 16),
          torsoMat
        );
        shoulders.scale.set(1.45, 0.68, 0.65);
        shoulders.position.set(0, cfg.headY - cfg.medRadius - 0.36, 0);
        holder.add(shoulders);

        const neck = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.28, 0.36, 20),
          torsoMat
        );
        neck.position.set(0, cfg.headY - cfg.medRadius - 0.08, 0);
        holder.add(neck);
      } else {
        // Compact South-West player shoulder silhouette right under circular PFP
        const shoulders = new THREE.Mesh(
          new THREE.SphereGeometry(0.45, 20, 12),
          torsoMat
        );
        shoulders.scale.set(1.38, 0.62, 0.62);
        shoulders.position.set(0, cfg.headY - cfg.medRadius - 0.18, 0);
        holder.add(shoulders);
      }

      this.dynamicGroup.add(holder);
      holder.updateMatrixWorld(true);

      // Framed Circular PFP Medallion oriented strictly toward the center of the table
      const headY = cfg.headY;
      const medRadius = cfg.medRadius;
      const headGroup = new THREE.Group();
      headGroup.position.set(0, headY, 0);
      holder.add(headGroup);
      headGroup.updateMatrixWorld(true);
      headGroup.lookAt(0, headY, 0);

      const ringMat = new THREE.MeshStandardMaterial({
        color: isActive ? '#F4C44E' : teamColor,
        emissive: isActive ? '#8C6812' : '#000000',
        roughness: 0.32,
        metalness: 0.65
      });

      const bezel = new THREE.Mesh(
        new THREE.CylinderGeometry(medRadius + 0.075, medRadius + 0.075, 0.16, 36),
        ringMat
      );
      bezel.rotation.x = Math.PI / 2;
      headGroup.add(bezel);

      const avatarMat = new THREE.MeshBasicMaterial({
        map: getAvatarTexture(seat.avatar)
      });
      const frontDisc = new THREE.Mesh(new THREE.CircleGeometry(medRadius, 36), avatarMat);
      frontDisc.position.z = 0.086;
      headGroup.add(frontDisc);

      const backDisc = new THREE.Mesh(new THREE.CircleGeometry(medRadius, 36), avatarMat);
      backDisc.rotation.y = Math.PI;
      backDisc.position.z = -0.086;
      headGroup.add(backDisc);

      // Nameplate directly above head (ONLY player name, NO tile count!)
      const spriteMat = new THREE.SpriteMaterial({
        map: createNameplateTexture(seat.name, {
          isActive,
          opened: seat.opened,
          teamIndex: seat.teamIndex,
          teamMode
        }),
        transparent: true,
        depthTest: false
      });
      const nameplate = new THREE.Sprite(spriteMat);
      nameplate.position.set(0, headY + medRadius + (cfg.compact ? 0.44 : 0.56), 0);
      nameplate.scale.set(cfg.compact ? 2.15 : 2.75, cfg.compact ? 0.54 : 0.68, 1);
      nameplate.renderOrder = 20;
      holder.add(nameplate);
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

  clearDynamic() {
    if (this.dragState?.floatingMesh) {
      this.scene.remove(this.dragState.floatingMesh);
    }
    this.dragState = null;

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

    this.demoMode = false;
    this.currentState = state;
    this.clearDynamic();

    if (!state) {
      this.lastRenderedRound = null;
      this.lastHandIds = new Set();
      this.lastTableTileIds = new Set();
      this.lastDiscardTopIds = [null, null, null, null];
      this.buildDemoSetup();
      return;
    }

    const viewerIdx = state.viewerSeatIndex ?? 0;
    const mySeat = state.seats[viewerIdx];
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
      const mustUse = state.pickedDiscardTileId === tile.id;
      const mesh = this.createTileMesh(tile, {
        faceUp: true,
        okeyTarget: state.okeyTarget,
        selected: isSelected,
        mustUse
      });
      const basePos = this.getLocalRackSlotPosition(slotIdx);
      mesh.position.set(basePos.x, basePos.y + (isSelected ? 0.14 : 0), basePos.z + (isSelected ? 0.05 : 0));
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

      if (isFreshRoundDeal) {
        this.enqueueAnimationFromWorld(mesh, deckTopWorldPos, deckTopQuat, null, {
          duration: 0.42,
          arcHeight: 0.65,
          delay: dealIdx * 0.016
        });
        dealIdx += 1;
      } else if (snapshot) {
        const prev = snapshot.tileTransforms.get(tile.id);
        if (prev) {
          this.southRackGroup.updateMatrixWorld(true);
          const targetWorld = mesh.getWorldPosition(new THREE.Vector3());
          const moveDist = prev.pos.distanceTo(targetWorld);
          const isSelectLift = moveDist < 0.32;
          this.enqueueAnimationFromWorld(mesh, prev.pos, prev.quat, prev.scale, {
            duration: isSelectLift ? 0.14 : 0.34,
            arcHeight: isSelectLift ? 0 : 0.24
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

    // 2. Render Opponent racks (face-down 3D tiles, zero clipping)
    const oppConfigs = [
      { rel: 1, pos: [6.85, 0.22, 0], rotY: Math.PI / 2 },
      { rel: 2, pos: [0, 0.22, -6.85], rotY: Math.PI },
      { rel: 3, pos: [-6.85, 0.22, 0], rotY: -Math.PI / 2 }
    ];

    for (const cfg of oppConfigs) {
      const seatIdx = (viewerIdx + cfg.rel) % 4;
      const seat = state.seats[seatIdx];
      const count = seat?.tileCount || 0;
      const rackHolder = new THREE.Group();
      rackHolder.position.set(...cfg.pos);
      rackHolder.rotation.y = cfg.rotY;

      const tilt = new THREE.Group();
      tilt.rotation.x = -0.32;
      rackHolder.add(tilt);

      for (let i = 0; i < Math.min(count, 28); i += 1) {
        const mesh = this.createTileMesh({ id: `opp-${seatIdx}-${i}`, color: 'red', number: 1 }, { faceUp: false });
        const slotIdx = i < 14 ? 14 + i : i - 14;
        const p = this.getLocalRackSlotPosition(slotIdx);
        mesh.position.copy(p);
        tilt.add(mesh);
      }
      this.dynamicGroup.add(rackHolder);
    }

    // 3. Render 3D Seated Player Heads & Nameplates above heads
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
        const glowRing = new THREE.Mesh(
          new THREE.RingGeometry(0.6, 0.74, 32),
          new THREE.MeshBasicMaterial({ color: '#F3CF42', side: THREE.DoubleSide })
        );
        glowRing.rotation.x = -Math.PI / 2;
        glowRing.position.y = 0.02;
        deckGroup.add(glowRing);
      }
    }
    this.dynamicGroup.add(deckGroup);

    if (state.gosterge) {
      const gStand = new THREE.Mesh(
        new THREE.BoxGeometry(0.84, 0.12, 1.08),
        new THREE.MeshStandardMaterial({ map: getWoodTexture(), color: '#8A5630', roughness: 0.48 })
      );
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

    // 5. Render 4 Corner Discard Piles (left neighbor sits right at left end of South rack!)
    const nextDiscardTopIds = [null, null, null, null];
    for (let rel = 0; rel < 4; rel += 1) {
      const seatIdx = (viewerIdx + rel) % 4;
      const pileInfo = state.discardPiles[seatIdx];
      const baseCoord = this.discardZoneCoords[rel];

      if (rel === 0 && isMyTurn && state.turnPhase === 'play') {
        const hitPad = new THREE.Mesh(
          new THREE.BoxGeometry(1.18, 0.1, 1.44),
          new THREE.MeshBasicMaterial({
            color: this.selectedTileIds.size === 1 ? '#F3CF42' : '#2C6E52',
            transparent: true,
            opacity: this.selectedTileIds.size === 1 ? 0.5 : 0.25
          })
        );
        hitPad.position.set(baseCoord.x, 0.06, baseCoord.z);
        hitPad.userData = { kind: 'discardTarget' };
        this.dynamicGroup.add(hitPad);
        this.interactables.push(hitPad);
      }

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

            const ring = new THREE.Mesh(
              new THREE.RingGeometry(0.62, 0.78, 28),
              new THREE.MeshBasicMaterial({ color: '#4ADE80', side: THREE.DoubleSide })
            );
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
        new THREE.BoxGeometry(groupWidth + 0.16, 0.04, TILE_H * meldTileScale + 0.14),
        new THREE.MeshStandardMaterial({
          color: isLayoffTarget ? '#3FA876' : '#0E3122',
          emissive: isLayoffTarget ? '#1F6B47' : '#000000',
          roughness: 0.85
        })
      );
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
    const preset = CAMERA_PRESETS[presetName] || CAMERA_PRESETS.table;
    this.targetCamLook.copy(preset.target);
    this.targetSpherical.setFromVector3(preset.pos.clone().sub(preset.target));
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

    // Hide slot mesh and spawn a world-space floating 3D tile model to carry!
    drag.mesh.visible = false;
    const worldPos = new THREE.Vector3();
    drag.mesh.getWorldPosition(worldPos);

    const floating = this.createTileMesh(drag.tile, {
      faceUp: true,
      okeyTarget: this.currentState?.okeyTarget,
      selected: true,
      mustUse: this.currentState?.pickedDiscardTileId === drag.tile.id
    });
    floating.position.copy(worldPos);
    floating.position.y += 0.28;
    floating.rotation.x = -0.52;
    floating.scale.setScalar(1.07);
    this.scene.add(floating);
    drag.floatingMesh = floating;
  }

  bindEvents() {
    this.onPointerDown = (e) => {
      if (this.demoMode) return;
      this.updatePointer(e.clientX, e.clientY);

      if (e.button === 2 || e.button === 1) {
        this.orbitDrag = { x: e.clientX, y: e.clientY };
        return;
      }

      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.interactables, false);
      if (hits.length === 0) return;

      const hit = hits[0].object;
      const data = hit.userData;

      if (data.kind === 'handTile') {
        this.dragState = {
          tile: data.tile,
          fromSlotIdx: data.slotIdx,
          mesh: hit,
          floatingMesh: null,
          startX: e.clientX,
          startY: e.clientY,
          moved: false
        };
      } else if (data.kind === 'drawDeck') {
        this.callbacks.onDrawDeck?.();
      } else if (data.kind === 'leftDiscard') {
        this.callbacks.onDrawDiscard?.();
      } else if (data.kind === 'discardTarget') {
        const selected = this.getSelectedTiles();
        if (selected.length === 1) {
          this.callbacks.onDiscardTile?.(selected[0].id);
          this.selectedTileIds.clear();
        }
      } else if (data.kind === 'tableMeld' && data.isLayoffTarget) {
        const selected = this.getSelectedTiles();
        if (selected.length === 1) {
          this.callbacks.onLayoffTile?.(selected[0].id, data.meldId);
          this.selectedTileIds.clear();
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
          1.18
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

        if (this.dragState.moved) {
          this.updatePointer(e.clientX, e.clientY);
          this.raycaster.setFromCamera(this.pointer, this.camera);

          // Move the actual 3D tile model smoothly over rack & table
          const slotHits = this.raycaster.intersectObjects(this.rackSlotMeshes, false);
          this.rackSlotMeshes.forEach((m) => {
            m.material.opacity = 0;
          });

          if (slotHits.length > 0 && this.dragState.floatingMesh) {
            slotHits[0].object.material.opacity = 0.5;
            const slotWorld = new THREE.Vector3();
            slotHits[0].object.getWorldPosition(slotWorld);
            this.dragState.floatingMesh.position.set(slotWorld.x, slotWorld.y + 0.22, slotWorld.z + 0.25);
            this.dragState.floatingMesh.rotation.x = -0.32;
          } else if (this.dragState.floatingMesh) {
            const dragPt = new THREE.Vector3();
            if (this.raycaster.ray.intersectPlane(this.tableDragPlane, dragPt)) {
              this.dragState.floatingMesh.position.set(
                THREE.MathUtils.clamp(dragPt.x, -8.2, 8.2),
                Math.max(0.85, dragPt.y),
                THREE.MathUtils.clamp(dragPt.z, -6.8, 8.2)
              );
              this.dragState.floatingMesh.rotation.x = -0.82;
            }
          }
        }
        return;
      }

      if (this.demoMode) return;
      this.updatePointer(e.clientX, e.clientY);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.interactables, false);
      this.canvas.style.cursor = hits.length > 0 ? 'pointer' : 'default';
    };

    this.onPointerUp = (e) => {
      if (this.orbitDrag) {
        this.orbitDrag = null;
        return;
      }

      if (!this.dragState) return;
      const drag = this.dragState;
      this.dragState = null;
      this.canvas.style.cursor = 'default';
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
        if (this.selectedTileIds.has(drag.tile.id)) {
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

      // Check drop targets: Discard Pad, Valid Table Meld Layoff, or Rack Slot
      this.updatePointer(e.clientX, e.clientY);
      this.raycaster.setFromCamera(this.pointer, this.camera);

      const discardHits = this.raycaster.intersectObjects(
        this.interactables.filter((m) => m.userData?.kind === 'discardTarget'),
        false
      );
      if (discardHits.length > 0) {
        this.selectedTileIds.delete(drag.tile.id);
        this.callbacks.onDiscardTile?.(drag.tile.id);
        return;
      }

      const viewerIdx = this.currentState?.viewerSeatIndex ?? 0;
      const mySeat = this.currentState?.seats?.[viewerIdx];
      const isMyPlayTurn =
        this.currentState?.phase === 'playing' &&
        this.currentState?.currentSeat === viewerIdx &&
        this.currentState?.turnPhase === 'play';

      if (isMyPlayTurn && mySeat?.opened) {
        const meldHits = this.raycaster.intersectObjects(
          this.dynamicGroup.children.filter((m) => m.userData?.kind === 'tableMeld'),
          false
        );
        if (meldHits.length > 0) {
          const meldId = meldHits[0].object.userData.meldId;
          const meld = (this.currentState.tableMelds || []).find((m) => m.id === meldId);
          if (meld && canLayoffTile(drag.tile, meld, this.currentState.okeyTarget).valid) {
            this.selectedTileIds.delete(drag.tile.id);
            this.callbacks.onLayoffTile?.(drag.tile.id, meldId);
            return;
          }
        }
      }

      const slotHits = this.raycaster.intersectObjects(this.rackSlotMeshes, false);
      if (slotHits.length > 0) {
        const targetSlotIdx = slotHits[0].object.userData.slotIdx;
        if (targetSlotIdx !== drag.fromSlotIdx) {
          const targetTile = this.handSlotData[targetSlotIdx];
          this.handSlotData[targetSlotIdx] = drag.tile;
          this.handSlotData[drag.fromSlotIdx] = targetTile;
          this.callbacks.onRackReorder?.();
        }
      }

      if (this.currentState) {
        this.renderGameState(this.currentState, { skipSlotSync: true });
      }
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
    this.canvas.addEventListener('wheel', this.onWheel, { passive: true });
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('resize', this.onResize);
  }

  animate() {
    this.rafId = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.demoMode && !this.reducedMotion) {
      this.targetSpherical.theta += dt * 0.08;
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

    const offset = new THREE.Vector3().setFromSpherical(this.camSpherical);
    this.camera.position.copy(this.camTarget).add(offset);
    this.camera.lookAt(this.camTarget);

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
