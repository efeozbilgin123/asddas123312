import * as THREE from 'three';
import { canLayoffTile } from '../../shared/melds.js';
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
    this.scene.background = getKahveBackdropTexture();
    this.scene.fog = new THREE.FogExp2('#1C140F', 0.014);

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 90);
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
    this.renderer.toneMappingExposure = 1.06;

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
    this.animations = [];

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

  buildEnvironment() {
    const hemi = new THREE.HemisphereLight('#FFEBD2', '#261A12', 0.85);
    this.scene.add(hemi);

    // Warm kahvehane overhead pendant key light
    const pendantLight = new THREE.PointLight('#FFCF86', 48, 36, 1.45);
    pendantLight.position.set(0, 8.8, 0.5);
    this.scene.add(pendantLight);

    const keyLight = new THREE.DirectionalLight('#FFF0D4', 1.32);
    keyLight.position.set(6, 16, 9);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 38;
    const d = 13;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0004;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#CBD8FF', 0.34);
    rimLight.position.set(-9, 9, -10);
    this.scene.add(rimLight);

    // Warm dark oak café floor + subtle Turkish kilim rug under table
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
      { rel: 0, pos: [-5.85, 0.0, 8.1], rotY: 0, compact: true },
      { rel: 1, pos: [8.85, 0.0, 0], rotY: -Math.PI / 2, compact: false },
      { rel: 2, pos: [0, 0.0, -8.85], rotY: 0, compact: false },
      { rel: 3, pos: [-8.85, 0.0, 0], rotY: Math.PI / 2, compact: false }
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

      if (!cfg.compact) {
        // Seated torso / shoulders + wooden kahve chair back
        const chairWood = new THREE.MeshStandardMaterial({
          map: getWoodTexture(),
          color: '#6C4227',
          roughness: 0.65
        });
        const chairBack = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.5, 0.14), chairWood);
        chairBack.position.set(
          cfg.rel === 1 ? 0.55 : cfg.rel === 3 ? -0.55 : 0,
          0.35,
          cfg.rel === 2 ? -0.55 : 0
        );
        chairBack.rotation.y = cfg.rotY;
        holder.add(chairBack);

        const torsoMat = new THREE.MeshStandardMaterial({
          color: teamMode === 'paired' ? (seat.teamIndex === 0 ? '#6A4D1F' : '#1F4B6A') : '#382C25',
          roughness: 0.78
        });
        const torso = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.72, 0.85, 20),
          torsoMat
        );
        torso.position.y = 0.45;
        holder.add(torso);
      }

      // Sculpted Head Pedestal + Framed Profile Avatar Medallion ("oturan kafası")
      const headY = cfg.compact ? 0.65 : 1.32;
      const headGroup = new THREE.Group();
      headGroup.position.y = headY;

      const ringMat = new THREE.MeshStandardMaterial({
        color: isActive ? '#F4C44E' : teamColor,
        emissive: isActive ? '#8C6812' : '#000000',
        roughness: 0.32,
        metalness: 0.65
      });

      const medRadius = cfg.compact ? 0.44 : 0.62;
      const bezel = new THREE.Mesh(
        new THREE.CylinderGeometry(medRadius + 0.07, medRadius + 0.07, 0.16, 32),
        ringMat
      );
      bezel.rotation.x = Math.PI / 2;
      headGroup.add(bezel);

      const avatarMat = new THREE.MeshBasicMaterial({
        map: getAvatarTexture(seat.avatar)
      });
      const frontDisc = new THREE.Mesh(new THREE.CircleGeometry(medRadius, 32), avatarMat);
      frontDisc.position.z = 0.085;
      headGroup.add(frontDisc);

      const backDisc = new THREE.Mesh(new THREE.CircleGeometry(medRadius, 32), avatarMat);
      backDisc.rotation.y = Math.PI;
      backDisc.position.z = -0.085;
      headGroup.add(backDisc);

      // Orient avatar head toward the south camera so portraits are always clearly readable
      headGroup.lookAt(0, headY, 13.5);
      holder.add(headGroup);

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
      nameplate.position.set(0, headY + (cfg.compact ? 0.8 : 1.05), 0);
      nameplate.scale.set(cfg.compact ? 2.1 : 2.65, cfg.compact ? 0.52 : 0.66, 1);
      nameplate.renderOrder = 20;
      holder.add(nameplate);

      this.dynamicGroup.add(holder);
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

  renderGameState(state, { skipSlotSync = false } = {}) {
    this.demoMode = false;
    this.currentState = state;
    this.clearDynamic();

    if (!state) {
      this.buildDemoSetup();
      return;
    }

    const viewerIdx = state.viewerSeatIndex ?? 0;
    const mySeat = state.seats[viewerIdx];
    const isMyTurn = state.phase === 'playing' && state.currentSeat === viewerIdx;

    if (!skipSlotSync && mySeat?.hand) {
      this.syncHandToSlots(mySeat.hand);
    }

    const rackMeshes = [];
    this.dynamicGroup.userData.rackMeshes = rackMeshes;

    // 1. Render South rack tiles (Your hand)
    for (let slotIdx = 0; slotIdx < this.handSlotData.length; slotIdx += 1) {
      const tile = this.handSlotData[slotIdx];
      if (!tile) continue;

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
    }

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
        const layers = Math.min(4, pileInfo.count);
        for (let i = 0; i < layers; i += 1) {
          const isTop = i === layers - 1;
          const tMesh = this.createTileMesh(pileInfo.topTile, {
            faceUp: isTop,
            okeyTarget: state.okeyTarget
          });
          tMesh.rotation.x = -Math.PI / 2;
          tMesh.position.set(baseCoord.x, 0.095 + i * (TILE_D + 0.004), baseCoord.z);
          if (isTop && rel === 3 && isMyTurn && state.turnPhase === 'draw') {
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
        }
      }
    }

    // 6. Render Opened Table Melds
    this.renderTableMelds(state, mySeat, isMyTurn);
  }

  renderTableMelds(state, mySeat, isMyTurn) {
    const melds = state.tableMelds || [];
    if (melds.length === 0) return;

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
        const mesh = this.createTileMesh(slot.tile, {
          faceUp: true,
          okeyTarget: state.okeyTarget
        });
        mesh.scale.setScalar(meldTileScale);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(cursorX + sIdx * tileStep, 0.095, cursorZ);
        mesh.userData = { kind: 'tableMeld', meldId: meld.id, isLayoffTarget };
        this.dynamicGroup.add(mesh);
        if (isLayoffTarget) {
          this.interactables.push(mesh);
        }
      });

      cursorX += groupWidth + groupGap;
    }
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
        22
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
