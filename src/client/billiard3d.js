import * as THREE from 'three';
import { BILLIARD_POCKETS, BILLIARD_TABLE } from '../../shared/billiardSession.js';
import { buildKahveCharacter } from './playerVisuals.js';
import { soundFX } from './sound.js';
import {
  getBilliardBallTexture,
  getBilliardFeltTexture,
  getWoodTexture
} from './textures.js';

export const BILLIARD_WORLD_POS = new THREE.Vector3(72.0, 0, 0);
export const BILLIARD_SCALE = 2.40;

export class BilliardTable3D {
  constructor(parentScene, shared = {}) {
    this.root = new THREE.Group();
    this.root.position.copy(BILLIARD_WORLD_POS);
    this.root.scale.setScalar(BILLIARD_SCALE);
    parentScene.add(this.root);

    // World-proportioned auxiliary group so humans, PFPs, cue stands & ceiling chains match Okey scale 1:1
    this.worldAuxGroup = new THREE.Group();
    this.worldAuxGroup.scale.setScalar(1 / BILLIARD_SCALE);
    this.root.add(this.worldAuxGroup);

    this.bustGeom = shared.bustGeom || null;
    this.avatarMatCache = shared.avatarMatCache || new Map();
    this.onShotComplete = typeof shared.onShotComplete === 'function' ? shared.onShotComplete : null;

    this.feltHitMesh = null;
    this.ballMeshes = new Map();
    this.ballMats = [];
    this.nameplateMats = [];
    this.disposableGeoms = [];
    this.disposableMats = [];

    this.seatGroup = new THREE.Group();
    this.worldAuxGroup.add(this.seatGroup);

    this.pocketRackGroup = new THREE.Group();
    this.root.add(this.pocketRackGroup);

    this.cueStickGroup = new THREE.Group();
    this.root.add(this.cueStickGroup);

    this.aimLine = null;
    this.aimDot = null;
    this.cueRing = null;

    this.currentState = null;
    this.viewerId = null;
    this.activeShotId = 0;
    this.shotStartPerfMs = 0;
    this.cueStrikeTimer = 0;
    this.playedEventIndices = new Set();
    this.localAimAngle = -Math.PI / 2;
    this.localAimPower = 0.65;
    this.isAnimatingShot = false;
    this.lastSeatSig = '';
    this.lastPocketRackSig = '';
    this.ballPrevPos = new Map();
    this.pocketDropAnims = new Map();
    this.playerActors = [];
    this.animClock = 0;

    this.buildTable();
    this.buildWorldPropsAndLamp();
    this.buildBalls();
    this.buildCueAndGuides();
  }

  buildTable() {
    const { halfW, halfL } = BILLIARD_TABLE;
    const woodTex = getWoodTexture();
    const walnutMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      color: '#6E3B20',
      roughness: 0.4,
      metalness: 0.08
    });
    const darkWalnutMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      color: '#3F2112',
      roughness: 0.48,
      metalness: 0.06
    });
    const feltMat = new THREE.MeshStandardMaterial({
      map: getBilliardFeltTexture(),
      roughness: 0.88,
      metalness: 0.02
    });
    const cushionFeltMat = new THREE.MeshStandardMaterial({
      color: '#12633E',
      roughness: 0.86,
      metalness: 0.02
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: '#D4AC4B',
      roughness: 0.24,
      metalness: 0.82
    });
    const leatherPocketMat = new THREE.MeshStandardMaterial({
      color: '#2E1410',
      roughness: 0.65,
      metalness: 0.08
    });
    const netMat = new THREE.MeshStandardMaterial({
      color: '#D7C4A3',
      roughness: 0.88,
      wireframe: true
    });
    const pocketWellMat = new THREE.MeshBasicMaterial({ color: '#050404' });
    const ivorySightMat = new THREE.MeshStandardMaterial({
      color: '#F5EBD0',
      roughness: 0.25,
      metalness: 0.05
    });
    const chalkBlueMat = new THREE.MeshStandardMaterial({ color: '#1E64D8', roughness: 0.88 });
    const chalkWrapMat = new THREE.MeshStandardMaterial({ color: '#ECE3D0', roughness: 0.7 });

    this.disposableMats.push(
      walnutMat,
      darkWalnutMat,
      feltMat,
      cushionFeltMat,
      brassMat,
      leatherPocketMat,
      netMat,
      pocketWellMat,
      ivorySightMat,
      chalkBlueMat,
      chalkWrapMat
    );

    // Multi-tier sculpted mahogany apron & slate bed cabinet
    const apronMainGeo = new THREE.BoxGeometry(halfW * 2 + 0.72, 0.36, halfL * 2 + 0.72);
    const apronSkirtGeo = new THREE.BoxGeometry(halfW * 2 + 0.56, 0.22, halfL * 2 + 0.56);
    const brassBeltGeo = new THREE.BoxGeometry(halfW * 2 + 0.75, 0.035, halfL * 2 + 0.75);
    this.disposableGeoms.push(apronMainGeo, apronSkirtGeo, brassBeltGeo);

    const apronMain = new THREE.Mesh(apronMainGeo, darkWalnutMat);
    // Top sits just below the felt surface (y = 0); coplanar faces z-fought into dark stair-step patches.
    apronMain.position.y = -0.2;
    apronMain.castShadow = true;
    apronMain.receiveShadow = true;
    this.root.add(apronMain);

    const apronSkirt = new THREE.Mesh(apronSkirtGeo, walnutMat);
    apronSkirt.position.y = -0.44;
    apronSkirt.castShadow = true;
    this.root.add(apronSkirt);

    const brassBelt = new THREE.Mesh(brassBeltGeo, brassMat);
    brassBelt.position.y = -0.35;
    this.root.add(brassBelt);

    // Baize Felt Bed (exact gameplay surface at y = 0)
    const feltGeo = new THREE.BoxGeometry(halfW * 2 + 0.08, 0.08, halfL * 2 + 0.08);
    const felt = new THREE.Mesh(feltGeo, feltMat);
    felt.position.y = -0.04;
    felt.receiveShadow = true;
    felt.userData = { kind: 'billiardFelt' };
    this.root.add(felt);
    this.feltHitMesh = felt;
    this.disposableGeoms.push(feltGeo);

    // Sculpted Top Rails + Inner Felt Cushion Bevels
    const railH = 0.22;
    const railW = 0.42;
    const longRailGeo = new THREE.BoxGeometry(railW, railH, halfL * 2 + railW * 2);
    const shortRailGeo = new THREE.BoxGeometry(halfW * 2, railH, railW);
    const longCushionGeo = new THREE.BoxGeometry(0.055, 0.11, halfL * 2 - 0.38);
    const shortCushionGeo = new THREE.BoxGeometry(halfW * 2 - 0.38, 0.11, 0.055);
    this.disposableGeoms.push(longRailGeo, shortRailGeo, longCushionGeo, shortCushionGeo);

    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(longRailGeo, walnutMat);
      rail.position.set(sx * (halfW + railW / 2), 0.075, 0);
      rail.castShadow = true;
      rail.receiveShadow = true;
      this.root.add(rail);

      const cushion = new THREE.Mesh(longCushionGeo, cushionFeltMat);
      cushion.position.set(sx * (halfW + 0.01), 0.055, 0);
      this.root.add(cushion);
    }
    for (const sz of [-1, 1]) {
      const rail = new THREE.Mesh(shortRailGeo, walnutMat);
      rail.position.set(0, 0.075, sz * (halfL + railW / 2));
      rail.castShadow = true;
      rail.receiveShadow = true;
      this.root.add(rail);

      const cushion = new THREE.Mesh(shortCushionGeo, cushionFeltMat);
      cushion.position.set(0, 0.055, sz * (halfL + 0.01));
      this.root.add(cushion);
    }

    // Brass Corner Castings & Leather Pocket Guards
    const cornerPlateGeo = new THREE.BoxGeometry(0.48, 0.24, 0.48);
    const sidePlateGeo = new THREE.BoxGeometry(0.28, 0.23, 0.42);
    this.disposableGeoms.push(cornerPlateGeo, sidePlateGeo);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cap = new THREE.Mesh(cornerPlateGeo, brassMat);
        cap.position.set(sx * (halfW + 0.21), 0.08, sz * (halfL + 0.21));
        this.root.add(cap);
      }
      const sideCap = new THREE.Mesh(sidePlateGeo, brassMat);
      sideCap.position.set(sx * (halfW + 0.26), 0.08, 0);
      this.root.add(sideCap);
    }

    // Inlaid Diamond Sights on Rails
    const sightGeo = new THREE.BoxGeometry(0.055, 0.018, 0.055);
    this.disposableGeoms.push(sightGeo);
    for (const sx of [-1, 1]) {
      for (const dz of [-1.98, -1.32, -0.66, 0.66, 1.32, 1.98]) {
        const s = new THREE.Mesh(sightGeo, ivorySightMat);
        s.position.set(sx * (halfW + 0.22), 0.19, dz);
        s.rotation.y = Math.PI / 4;
        this.root.add(s);
      }
    }
    for (const sz of [-1, 1]) {
      for (const dx of [-0.67, 0, 0.67]) {
        const s = new THREE.Mesh(sightGeo, ivorySightMat);
        s.position.set(dx, 0.19, sz * (halfL + 0.22));
        s.rotation.y = Math.PI / 4;
        this.root.add(s);
      }
    }

    // 6 Real Recessed Pockets + Leather Collar + Hanging Drop Net Baskets
    const pocketWellGeo = new THREE.CylinderGeometry(0.20, 0.17, 0.14, 18);
    const pocketRimGeo = new THREE.TorusGeometry(0.21, 0.036, 8, 18);
    const pocketNetGeo = new THREE.ConeGeometry(0.18, 0.34, 12, 1, true);
    this.disposableGeoms.push(pocketWellGeo, pocketRimGeo, pocketNetGeo);

    for (const p of BILLIARD_POCKETS) {
      const well = new THREE.Mesh(pocketWellGeo, pocketWellMat);
      well.position.set(p.x, -0.055, p.z);
      this.root.add(well);

      const collar = new THREE.Mesh(pocketRimGeo, leatherPocketMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(p.x, 0.03, p.z);
      this.root.add(collar);

      const net = new THREE.Mesh(pocketNetGeo, netMat);
      net.rotation.x = Math.PI;
      net.position.set(p.x, -0.34, p.z);
      this.root.add(net);
    }

    // Blue Chalk Cubes on diagonal rail corners
    const chalkGeo = new THREE.BoxGeometry(0.075, 0.055, 0.075);
    const wrapGeo = new THREE.BoxGeometry(0.08, 0.032, 0.08);
    this.disposableGeoms.push(chalkGeo, wrapGeo);
    for (const [cx, cz] of [
      [-halfW - 0.22, halfL - 0.55],
      [halfW + 0.22, -halfL + 0.55]
    ]) {
      const wrap = new THREE.Mesh(wrapGeo, chalkWrapMat);
      wrap.position.set(cx, 0.205, cz);
      const chalk = new THREE.Mesh(chalkGeo, chalkBlueMat);
      chalk.position.set(cx, 0.215, cz);
      this.root.add(wrap, chalk);
    }

    // Pocketed-Ball Ball-Return Rail Shelf along West Apron
    const returnTrayGeo = new THREE.BoxGeometry(0.22, 0.09, 2.2);
    const returnTray = new THREE.Mesh(returnTrayGeo, darkWalnutMat);
    returnTray.position.set(-halfW - 0.44, -0.14, 0);
    this.root.add(returnTray);
    this.disposableGeoms.push(returnTrayGeo);

    // 4 Fluted Turned Legs + Brass Collar Rings + Broad Feet flush on floor
    const floorLocalY = -2.35 / BILLIARD_SCALE;
    const legTopY = -0.54;
    const legLen = Math.max(0.2, Math.abs(floorLocalY - legTopY));
    const legGeo = new THREE.CylinderGeometry(0.18, 0.12, legLen, 14);
    const collarGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.07, 14);
    const footGeo = new THREE.CylinderGeometry(0.18, 0.23, 0.09, 14);
    this.disposableGeoms.push(legGeo, collarGeo, footGeo);

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const lx = sx * (halfW - 0.02);
        const lz = sz * (halfL - 0.14);
        const leg = new THREE.Mesh(legGeo, darkWalnutMat);
        leg.position.set(lx, legTopY - legLen / 2, lz);
        leg.castShadow = true;
        this.root.add(leg);

        const colRing = new THREE.Mesh(collarGeo, brassMat);
        colRing.position.set(lx, legTopY - 0.04, lz);
        this.root.add(colRing);

        const foot = new THREE.Mesh(footGeo, brassMat);
        foot.position.set(lx, floorLocalY + 0.045, lz);
        this.root.add(foot);
      }
    }
  }

  buildWorldPropsAndLamp() {
    // Built inside worldAuxGroup (world units directly, exact ceiling y=16.0 and floor y=-2.35)
    const woodMat = new THREE.MeshStandardMaterial({
      map: getWoodTexture(),
      color: '#5C321A',
      roughness: 0.46,
      metalness: 0.08
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: '#D4AC4B',
      roughness: 0.26,
      metalness: 0.8
    });
    const shadeMat = new THREE.MeshStandardMaterial({
      color: '#135D3A',
      roughness: 0.34,
      metalness: 0.14,
      side: THREE.DoubleSide
    });
    const shadeRimMat = new THREE.MeshStandardMaterial({
      color: '#E5BD5C',
      roughness: 0.28,
      metalness: 0.78
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: '#FFF0C4' });
    const shaftMat = new THREE.MeshStandardMaterial({ color: '#E8CFA6', roughness: 0.45 });
    const buttMat = new THREE.MeshStandardMaterial({ color: '#3E1A12', roughness: 0.5 });

    this.disposableMats.push(woodMat, brassMat, shadeMat, shadeRimMat, glowMat, shaftMat, buttMat);

    // 1. 3-Shade Tiffany Pool Chandelier hung cleanly from ceiling y = 16.0 down to y = 7.6
    const lampY = 7.6;
    const barLen = 10.6;
    const barGeo = new THREE.CylinderGeometry(0.085, 0.085, barLen, 10);
    barGeo.rotateX(Math.PI / 2);
    const chainH = 16.0 - lampY;
    const chainGeo = new THREE.CylinderGeometry(0.055, 0.055, chainH, 8);
    const shadeGeo = new THREE.ConeGeometry(1.42, 0.96, 20, 1, true);
    const shadeRimGeo = new THREE.TorusGeometry(1.42, 0.05, 8, 22);
    const bulbGeo = new THREE.SphereGeometry(0.32, 12, 10);
    this.disposableGeoms.push(barGeo, chainGeo, shadeGeo, shadeRimGeo, bulbGeo);

    const lampBar = new THREE.Mesh(barGeo, brassMat);
    lampBar.position.set(0, lampY + 0.4, 0);
    this.worldAuxGroup.add(lampBar);

    for (const cz of [-3.6, 3.6]) {
      const chain = new THREE.Mesh(chainGeo, brassMat);
      chain.position.set(0, lampY + chainH / 2, cz);
      this.worldAuxGroup.add(chain);
    }

    for (const lz of [-3.8, 0, 3.8]) {
      const shade = new THREE.Mesh(shadeGeo, shadeMat);
      shade.position.set(0, lampY, lz);
      this.worldAuxGroup.add(shade);

      const rim = new THREE.Mesh(shadeRimGeo, shadeRimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(0, lampY - 0.47, lz);
      this.worldAuxGroup.add(rim);

      const bulb = new THREE.Mesh(bulbGeo, glowMat);
      bulb.position.set(0, lampY - 0.16, lz);
      this.worldAuxGroup.add(bulb);
    }

    // 2. Floor-Standing Mahogany Cue Rack + Triangle Rack on East flank of rug (x = +6.9, z = 0)
    const rackGroup = new THREE.Group();
    rackGroup.position.set(6.9, -2.35, 0);
    const rackBaseGeo = new THREE.BoxGeometry(0.95, 0.22, 3.2);
    const rackTopGeo = new THREE.BoxGeometry(0.75, 0.16, 3.0);
    const rackPostGeo = new THREE.CylinderGeometry(0.075, 0.095, 3.1, 10);
    const spareShaftGeo = new THREE.CylinderGeometry(0.024, 0.036, 1.85, 8);
    const spareButtGeo = new THREE.CylinderGeometry(0.036, 0.055, 1.55, 8);
    const triBarGeo = new THREE.BoxGeometry(0.08, 0.08, 1.35);
    this.disposableGeoms.push(rackBaseGeo, rackTopGeo, rackPostGeo, spareShaftGeo, spareButtGeo, triBarGeo);

    const rackBase = new THREE.Mesh(rackBaseGeo, woodMat);
    rackBase.position.y = 0.11;
    rackBase.castShadow = true;
    rackGroup.add(rackBase);

    const rackTop = new THREE.Mesh(rackTopGeo, woodMat);
    rackTop.position.y = 3.12;
    rackGroup.add(rackTop);

    for (const pz of [-1.25, 1.25]) {
      const post = new THREE.Mesh(rackPostGeo, woodMat);
      post.position.set(0, 1.62, pz);
      post.castShadow = true;
      rackGroup.add(post);
    }

    for (let i = 0; i < 4; i += 1) {
      const cz = -0.9 + i * 0.6;
      const butt = new THREE.Mesh(spareButtGeo, buttMat);
      butt.position.set(-0.08, 0.98, cz);
      const shaft = new THREE.Mesh(spareShaftGeo, shaftMat);
      shaft.position.set(-0.08, 2.68, cz);
      rackGroup.add(butt, shaft);
    }

    // Wooden triangle hanging off side peg
    const triGroup = new THREE.Group();
    triGroup.position.set(0.52, 2.15, 0);
    for (let s = 0; s < 3; s += 1) {
      const ang = (s * Math.PI * 2) / 3;
      const bar = new THREE.Mesh(triBarGeo, woodMat);
      bar.position.set(0, Math.cos(ang) * 0.38, Math.sin(ang) * 0.38);
      bar.rotation.x = ang;
      triGroup.add(bar);
    }
    rackGroup.add(triGroup);

    this.worldAuxGroup.add(rackGroup);
  }

  buildBalls() {
    const R = BILLIARD_TABLE.ballRadius;
    const sphereGeo = new THREE.SphereGeometry(R, 20, 16);
    this.disposableGeoms.push(sphereGeo);

    for (let id = 0; id <= 15; id += 1) {
      const mat = new THREE.MeshStandardMaterial({
        map: getBilliardBallTexture(id),
        roughness: 0.12,
        metalness: 0.08
      });
      this.ballMats.push(mat);
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.castShadow = true;
      mesh.position.set(0, R, 0);
      mesh.rotation.y = Math.PI * 0.35;
      this.root.add(mesh);
      this.ballMeshes.set(id, mesh);
      this.ballPrevPos.set(id, { x: 0, z: 0 });
    }
  }

  buildCueAndGuides() {
    // Tapered cue stick along local -X axis (tip near origin)
    const tipGeo = new THREE.CylinderGeometry(0.018, 0.02, 0.04, 10);
    tipGeo.rotateZ(Math.PI / 2);
    const ferruleGeo = new THREE.CylinderGeometry(0.02, 0.021, 0.055, 10);
    ferruleGeo.rotateZ(Math.PI / 2);
    const shaftGeo = new THREE.CylinderGeometry(0.021, 0.032, 1.5, 10);
    shaftGeo.rotateZ(Math.PI / 2);
    const buttGeo = new THREE.CylinderGeometry(0.032, 0.05, 1.38, 10);
    buttGeo.rotateZ(Math.PI / 2);

    const tipMat = new THREE.MeshBasicMaterial({ color: '#3B82F6' });
    const ferruleMat = new THREE.MeshBasicMaterial({ color: '#F8F4EC' });
    const shaftMat = new THREE.MeshStandardMaterial({ color: '#EAD2AC', roughness: 0.42 });
    const buttMat = new THREE.MeshStandardMaterial({ color: '#4B1D12', roughness: 0.44 });
    this.disposableGeoms.push(tipGeo, ferruleGeo, shaftGeo, buttGeo);
    this.disposableMats.push(tipMat, ferruleMat, shaftMat, buttMat);

    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.set(-0.02, 0, 0);
    const ferrule = new THREE.Mesh(ferruleGeo, ferruleMat);
    ferrule.position.set(-0.068, 0, 0);
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.set(-0.845, 0, 0);
    const butt = new THREE.Mesh(buttGeo, buttMat);
    butt.position.set(-2.285, 0, 0);

    this.cueStickGroup.add(tip, ferrule, shaft, butt);
    this.cueStickGroup.visible = false;

    // Dashed white aiming line + glowing ghost impact dot along +X
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.14, 0.02, 0),
      new THREE.Vector3(3.6, 0.02, 0)
    ]);
    const lineMat = new THREE.LineDashedMaterial({
      color: '#FFF6D6',
      dashSize: 0.16,
      gapSize: 0.1,
      transparent: true,
      opacity: 0.9
    });
    const dotGeo = new THREE.RingGeometry(0.06, 0.105, 20);
    dotGeo.rotateX(-Math.PI / 2);
    const dotMat = new THREE.MeshBasicMaterial({
      color: '#FDE047',
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });
    this.disposableGeoms.push(lineGeo, dotGeo);
    this.disposableMats.push(lineMat, dotMat);

    this.aimLine = new THREE.Line(lineGeo, lineMat);
    this.aimLine.computeLineDistances();
    this.aimLine.visible = false;
    this.root.add(this.aimLine);

    this.aimDot = new THREE.Mesh(dotGeo, dotMat);
    this.aimDot.visible = false;
    this.root.add(this.aimDot);

    // Highlight ring under cue ball during ball-in-hand
    const ringGeo = new THREE.RingGeometry(0.16, 0.24, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#FACC15',
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide
    });
    this.disposableGeoms.push(ringGeo);
    this.disposableMats.push(ringMat);
    this.cueRing = new THREE.Mesh(ringGeo, ringMat);
    this.cueRing.position.y = 0.014;
    this.cueRing.visible = false;
    this.root.add(this.cueRing);
  }

  getFeltHitMesh() {
    return this.feltHitMesh;
  }

  setLocalAim(angle, power) {
    if (Number.isFinite(angle)) this.localAimAngle = angle;
    if (Number.isFinite(power)) this.localAimPower = Math.max(0.1, Math.min(1, power));
  }

  applyBallRoll(id, mesh, x, z) {
    const prev = this.ballPrevPos.get(id);
    const R = BILLIARD_TABLE.ballRadius;
    if (prev) {
      const dx = x - prev.x;
      const dz = z - prev.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.0005 && dist < 1.2) {
        const axis = new THREE.Vector3(dz / dist, 0, -dx / dist).normalize();
        const q = new THREE.Quaternion().setFromAxisAngle(axis, dist / R);
        mesh.quaternion.premultiply(q);
      }
      prev.x = x;
      prev.z = z;
    }
    mesh.position.set(x, R, z);
    mesh.scale.setScalar(1);
  }

  syncPocketShowcase(state) {
    const balls = state?.balls || [];
    const pocketedIds = balls
      .filter((b) => b.pocketed && b.id !== 0)
      .map((b) => b.id)
      .sort((a, b) => a - b);
    const sig = pocketedIds.join(',');
    if (sig === this.lastPocketRackSig) return;
    this.lastPocketRackSig = sig;

    while (this.pocketRackGroup.children.length > 0) {
      this.pocketRackGroup.remove(this.pocketRackGroup.children[0]);
    }
    const { halfW } = BILLIARD_TABLE;
    const R = BILLIARD_TABLE.ballRadius * 0.88;
    const sphereGeo = this.ballMeshes.get(1)?.geometry;
    if (!sphereGeo) return;

    pocketedIds.forEach((id, idx) => {
      const srcMesh = this.ballMeshes.get(id);
      if (!srcMesh) return;
      const mini = new THREE.Mesh(sphereGeo, srcMesh.material);
      mini.scale.setScalar(0.86);
      mini.position.set(-halfW - 0.44, -0.05 + R, -0.95 + idx * 0.14);
      this.pocketRackGroup.add(mini);
    });
  }

  syncPlayers(state) {
    const seats = state?.seats || [];
    const sig = JSON.stringify({
      phase: state?.phase,
      cur: state?.currentSeat,
      seats: seats.map((s) => [s.type, s.name, s.avatar, s.group])
    });
    if (sig === this.lastSeatSig) return;
    this.lastSeatSig = sig;

    while (this.seatGroup.children.length > 0) {
      this.seatGroup.remove(this.seatGroup.children[0]);
    }
    for (const m of this.nameplateMats) {
      m?.map?.dispose();
      m?.dispose();
    }
    this.nameplateMats.length = 0;
    this.playerActors = [];

    // Standing world-scale spots flanking the 14.7m-long billiard bay clearly outside rails
    const spots = [
      { x: -6.4, z: 3.4, rotY: Math.PI * 0.36 },
      { x: -6.4, z: -3.4, rotY: Math.PI * 0.64 }
    ];

    seats.forEach((seat, idx) => {
      if (!seat || seat.type === 'empty') return;
      const spot = spots[idx];
      if (!spot) return;

      const isActive = state?.phase === 'playing' && state?.currentSeat === idx;
      const subLabel = seat.group
        ? (seat.group === 'solids' ? 'Düz' : 'Çizgili')
        : '';

      const actor = buildKahveCharacter({
        bustGeom: this.bustGeom,
        avatarMatCache: this.avatarMatCache,
        avatar: seat.avatar || `avatar-${idx + 5}`,
        name: seat.name || `Oyuncu ${idx + 1}`,
        nameplateSub: subLabel,
        vestColor: idx === 0 ? '#1F4E78' : '#7A2E2E',
        teamColor: idx === 0 ? '#56B4E9' : '#F4C44E',
        isBot: seat.type === 'bot',
        isActive,
        seated: false,
        medRadius: 0.96,
        headY: 2.68,
        rearPfp: true,
        hasCueStick: true,
        disposableMats: this.disposableMats
      });

      if (actor.nameplateMat) {
        this.nameplateMats.push(actor.nameplateMat);
      }

      // Feet sit at local y = -1.96, so at y = -0.39 feet stand squarely on parquet floor y = -2.35
      actor.group.position.set(spot.x, -0.39, spot.z);
      actor.group.rotation.y = spot.rotY;
      this.seatGroup.add(actor.group);
      this.playerActors.push({
        ...actor,
        phaseOffset: idx * 1.9,
        isActive
      });
    });
  }

  updateState(billiardState, viewerId = null) {
    this.currentState = billiardState || null;
    this.viewerId = viewerId || null;

    if (!billiardState) return;
    this.syncPlayers(billiardState);
    this.syncPocketShowcase(billiardState);

    const shot = billiardState.lastShot;
    if (shot && shot.id !== this.activeShotId) {
      const rawAgeMs = Date.now() - (shot.startedAt || Date.now());
      const clampedAgeMs = Math.max(0, rawAgeMs);
      if (clampedAgeMs < (shot.durationMs || 0) + 200) {
        this.activeShotId = shot.id;
        this.shotStartPerfMs = performance.now() - Math.min(clampedAgeMs, Math.max(0, (shot.durationMs || 0) - 50));
        this.playedEventIndices.clear();
        this.isAnimatingShot = true;
        this.cueStrikeTimer = clampedAgeMs < 350 ? 0.28 : 0;
        if (clampedAgeMs < 350) {
          soundFX.playBilliardCueShot(shot.power || 0.65);
        }
      } else {
        this.activeShotId = shot.id;
        this.isAnimatingShot = false;
      }
    } else if (!shot) {
      this.activeShotId = 0;
      this.isAnimatingShot = false;
    }

    if (!this.isAnimatingShot) {
      for (const b of billiardState.balls || []) {
        const mesh = this.ballMeshes.get(b.id);
        if (!mesh) continue;
        if (b.pocketed) {
          if (mesh.visible && !this.pocketDropAnims.has(b.id)) {
            this.pocketDropAnims.set(b.id, { t: 0, startY: mesh.position.y });
          }
        } else {
          this.pocketDropAnims.delete(b.id);
          mesh.visible = true;
          this.applyBallRoll(b.id, mesh, b.x, b.z);
        }
      }
    }
  }

  tick(dt = 0.016, { isMyBilliardTurn = false, localPlayerId = null } = {}) {
    this.animClock += dt;

    // Gentle idle breathing + turn halo pulse on Billiard players
    for (const actor of this.playerActors) {
      const breath = Math.sin(this.animClock * 2.1 + actor.phaseOffset) * 0.025;
      actor.bodyGroup.position.y = breath;
      if (actor.haloMesh) {
        actor.haloMesh.scale.setScalar(1 + Math.sin(this.animClock * 4.5) * 0.06);
      }
      if (actor.cuePivot) {
        actor.cuePivot.rotation.z = Math.sin(this.animClock * 1.4 + actor.phaseOffset) * 0.03;
      }
    }

    // Pocket drop finish animations
    for (const [bId, drop] of this.pocketDropAnims.entries()) {
      drop.t += dt;
      const p = Math.min(1, drop.t / 0.22);
      const mesh = this.ballMeshes.get(bId);
      if (mesh) {
        mesh.position.y = THREE.MathUtils.lerp(drop.startY, -0.22, p);
        mesh.scale.setScalar(Math.max(0.25, 1 - p * 0.72));
        if (p >= 1) {
          mesh.visible = false;
          mesh.scale.setScalar(1);
          this.pocketDropAnims.delete(bId);
        }
      } else {
        this.pocketDropAnims.delete(bId);
      }
    }

    const state = this.currentState;
    if (!state) return;

    const shot = state.lastShot;
    if (this.isAnimatingShot && shot && Array.isArray(shot.frames) && shot.frames.length > 0) {
      const elapsedSec = Math.max(0, (performance.now() - (this.shotStartPerfMs || performance.now())) / 1000);
      const frames = shot.frames;
      const lastFrame = frames[frames.length - 1];

      if (Array.isArray(shot.events)) {
        for (let i = 0; i < shot.events.length; i += 1) {
          if (this.playedEventIndices.has(i)) continue;
          const ev = shot.events[i];
          if (elapsedSec >= ev.t) {
            this.playedEventIndices.add(i);
            if (ev.kind === 'ball') soundFX.playBilliardHit(ev.intensity);
            else if (ev.kind === 'cushion') soundFX.playBilliardCushion(ev.intensity);
            else if (ev.kind === 'pocket') soundFX.playBilliardPocket();
          }
        }
      }

      if (elapsedSec >= lastFrame.t) {
        this.isAnimatingShot = false;
        for (const b of state.balls || []) {
          const mesh = this.ballMeshes.get(b.id);
          if (!mesh) continue;
          if (b.pocketed) {
            mesh.visible = false;
          } else {
            mesh.visible = true;
            this.applyBallRoll(b.id, mesh, b.x, b.z);
          }
        }
        this.syncPocketShowcase(state);
        this.onShotComplete?.();
      } else {
        let fIdx = 0;
        while (fIdx < frames.length - 2 && frames[fIdx + 1].t < elapsedSec) {
          fIdx += 1;
        }
        const fA = frames[fIdx];
        const fB = frames[Math.min(fIdx + 1, frames.length - 1)];
        const span = Math.max(0.0001, fB.t - fA.t);
        const alpha = Math.max(0, Math.min(1, (elapsedSec - fA.t) / span));

        for (let i = 0; i < fA.balls.length; i += 1) {
          const a = fA.balls[i];
          const b = fB.balls[i] || a;
          const id = a[0];
          const mesh = this.ballMeshes.get(id);
          if (!mesh) continue;
          const pocketed = a[3] === 1 && b[3] === 1;
          if (pocketed) {
            if (mesh.visible && !this.pocketDropAnims.has(id)) {
              this.pocketDropAnims.set(id, { t: 0, startY: mesh.position.y });
            }
          } else {
            this.pocketDropAnims.delete(id);
            mesh.visible = true;
            const ix = THREE.MathUtils.lerp(a[1], b[1], alpha);
            const iz = THREE.MathUtils.lerp(a[2], b[2], alpha);
            this.applyBallRoll(id, mesh, ix, iz);
          }
        }
      }
    } else if (this.isAnimatingShot) {
      this.isAnimatingShot = false;
      this.onShotComplete?.();
    }

    // Cue stick strike lunge or aiming breath
    const cueBall = this.ballMeshes.get(0);
    if (this.cueStrikeTimer > 0 && cueBall) {
      this.cueStrikeTimer = Math.max(0, this.cueStrikeTimer - dt);
      const p = 1 - this.cueStrikeTimer / 0.28;
      const aimAngle = shot?.angle ?? this.localAimAngle;
      const offset = p < 0.35
        ? THREE.MathUtils.lerp(0.32, 0.56, p / 0.35)
        : THREE.MathUtils.lerp(0.56, 0.08, (p - 0.35) / 0.65);
      this.cueStickGroup.visible = true;
      this.cueStickGroup.position.set(
        cueBall.position.x - Math.cos(aimAngle) * offset,
        BILLIARD_TABLE.ballRadius + 0.05,
        cueBall.position.z - Math.sin(aimAngle) * offset
      );
      this.cueStickGroup.rotation.order = 'YXZ';
      this.cueStickGroup.rotation.set(0, -aimAngle, -0.055);
      if (this.aimLine) this.aimLine.visible = false;
      if (this.aimDot) this.aimDot.visible = false;
      if (this.cueRing) this.cueRing.visible = false;
      return;
    }

    const showCue =
      state.phase === 'playing' &&
      !this.isAnimatingShot &&
      cueBall &&
      cueBall.visible;

    if (showCue) {
      const aimAngle = isMyBilliardTurn
        ? this.localAimAngle
        : (state.aimState?.angle ?? -Math.PI / 2);
      const aimPower = isMyBilliardTurn
        ? this.localAimPower
        : (state.aimState?.power ?? 0.62);

      const idleStroke = Math.sin(this.animClock * 2.8) * 0.04;
      const pullBack = 0.22 + aimPower * 0.42 + idleStroke;
      const cx = cueBall.position.x;
      const cz = cueBall.position.z;

      this.cueStickGroup.visible = true;
      this.cueStickGroup.position.set(
        cx - Math.cos(aimAngle) * pullBack,
        BILLIARD_TABLE.ballRadius + 0.05,
        cz - Math.sin(aimAngle) * pullBack
      );
      this.cueStickGroup.rotation.order = 'YXZ';
      this.cueStickGroup.rotation.set(0, -aimAngle, -0.055);

      if (this.aimLine) {
        this.aimLine.visible = isMyBilliardTurn || Boolean(localPlayerId);
        this.aimLine.position.set(cx, BILLIARD_TABLE.ballRadius - 0.01, cz);
        this.aimLine.rotation.set(0, -aimAngle, 0);
      }

      if (this.aimDot) {
        this.aimDot.visible = Boolean(this.aimLine?.visible);
        this.aimDot.position.set(
          cx + Math.cos(aimAngle) * 1.65,
          0.016,
          cz + Math.sin(aimAngle) * 1.65
        );
        this.aimDot.scale.setScalar(1 + Math.sin(this.animClock * 6) * 0.12);
      }

      if (this.cueRing) {
        this.cueRing.visible = Boolean(state.ballInHand && isMyBilliardTurn);
        this.cueRing.position.set(cx, 0.015, cz);
        this.cueRing.scale.setScalar(1 + Math.sin(this.animClock * 5) * 0.08);
      }
    } else {
      this.cueStickGroup.visible = false;
      if (this.aimLine) this.aimLine.visible = false;
      if (this.aimDot) this.aimDot.visible = false;
      if (this.cueRing) this.cueRing.visible = false;
    }
  }

  worldToLocalFelt(worldPoint) {
    return {
      x: (worldPoint.x - BILLIARD_WORLD_POS.x) / BILLIARD_SCALE,
      z: (worldPoint.z - BILLIARD_WORLD_POS.z) / BILLIARD_SCALE
    };
  }

  getCueBallWorldPosition() {
    const cue = this.ballMeshes.get(0);
    if (!cue) return BILLIARD_WORLD_POS.clone();
    return new THREE.Vector3(
      BILLIARD_WORLD_POS.x + cue.position.x * BILLIARD_SCALE,
      cue.position.y * BILLIARD_SCALE,
      BILLIARD_WORLD_POS.z + cue.position.z * BILLIARD_SCALE
    );
  }

  dispose() {
    for (const g of this.disposableGeoms) g?.dispose();
    for (const m of this.disposableMats) m?.dispose();
    for (const m of this.ballMats) m?.dispose();
    for (const m of this.nameplateMats) {
      m?.map?.dispose();
      m?.dispose();
    }
  }
}
