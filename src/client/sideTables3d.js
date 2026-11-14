import * as THREE from 'three';
import { SIDE_TABLE_DEFS } from '../../shared/sideGames.js';
import { buildKahveCharacter } from './playerVisuals.js';
import {
  getFeltTexture,
  getPlayingCardBackTexture,
  getPlayingCardTexture,
  getPokerFeltTexture,
  getSidePlaqueTexture,
  getTavlaBoardTexture,
  getWoodTexture
} from './textures.js';

// Equal grand salon seat radius matching Okey's 18.8x18.8 footprint & ~10.3 seat ring
const SEAT_OFFSETS = [
  { x: 0, z: 10.3, rotY: Math.PI },
  { x: 10.3, z: 0, rotY: -Math.PI / 2 },
  { x: 0, z: -10.3, rotY: 0 },
  { x: -10.3, z: 0, rotY: Math.PI / 2 }
];

const VEST_PALETTE = ['#6A4D1F', '#1F4B6A', '#6D2C26', '#2B533E'];

function createTableSignTexture(title, subtitle, statusLabel, isPlaying = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 148;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(20, 12, 8, 0.94)';
  ctx.strokeStyle = isPlaying ? '#F5C842' : '#B98C46';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 132, 22);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 34px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillStyle = '#FFF5E0';
  ctx.fillText(String(title || '').slice(0, 24), 256, 44);

  ctx.font = '700 22px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillStyle = '#D7BC8D';
  ctx.fillText(String(subtitle || '').slice(0, 32), 256, 82);

  ctx.font = '800 21px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillStyle = isPlaying ? '#6BE59B' : '#F5C842';
  ctx.fillText(String(statusLabel || ''), 256, 116);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class SideTables3D {
  constructor(parentScene, shared = {}) {
    this.root = new THREE.Group();
    parentScene.add(this.root);

    this.bustGeom = shared.bustGeom || null;
    this.avatarMatCache = shared.avatarMatCache || new Map();
    this.disposableGeoms = [];
    this.disposableMats = [];
    this.cachedFaceMats = new Map();
    this.cachedPlaqueMats = new Map();
    this.interactables = [];
    this.tableEntries = new Map();
    this.lastStateSig = '';

    this.cardAnims = [];
    this.prevCardPositions = new Map(); // `${tableId}:${cardKey}` -> { pos, quat }
    this.animatedProps = []; // steam puffs, lanterns, dealer button, turn halos, seated breathers
    this.lastHoveredMesh = null;
    this.animClock = 0;

    this.buildAllTables();
  }

  getInteractables() {
    return this.interactables;
  }

  getFaceMat(tex) {
    if (!tex) return this.sharedCardEdgeMat;
    if (this.cachedFaceMats.has(tex.uuid)) return this.cachedFaceMats.get(tex.uuid);
    if (this.cachedFaceMats.size > 340) {
      const oldestKey = this.cachedFaceMats.keys().next().value;
      this.cachedFaceMats.get(oldestKey)?.dispose();
      this.cachedFaceMats.delete(oldestKey);
    }
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.34,
      metalness: 0.04
    });
    this.cachedFaceMats.set(tex.uuid, mat);
    return mat;
  }

  getPlaqueMat(tex) {
    if (!tex) return this.sharedPlaqueEdgeMat;
    if (this.cachedPlaqueMats.has(tex.uuid)) return this.cachedPlaqueMats.get(tex.uuid);
    if (this.cachedPlaqueMats.size > 220) {
      const oldestKey = this.cachedPlaqueMats.keys().next().value;
      this.cachedPlaqueMats.get(oldestKey)?.dispose();
      this.cachedPlaqueMats.delete(oldestKey);
    }
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.38,
      metalness: 0.14
    });
    this.cachedPlaqueMats.set(tex.uuid, mat);
    return mat;
  }

  createPlayingCardMesh(card, { faceUp = true, legal = true, dimmed = false, highlighted = false, scale = 1.48 } = {}) {
    const topTex = faceUp
      ? getPlayingCardTexture(card, { legal, dimmed })
      : getPlayingCardBackTexture({ highlighted });
    const topMat = this.getFaceMat(topTex);
    const mats = [
      this.sharedCardEdgeMat,
      this.sharedCardEdgeMat,
      topMat,
      this.sharedCardBottomMat,
      this.sharedCardEdgeMat,
      this.sharedCardEdgeMat
    ];
    const mesh = new THREE.Mesh(this.sharedCardGeo, mats);
    mesh.scale.setScalar(scale);
    mesh.userData.baseScale = scale;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  createPlaqueMesh(title, subtitle, { tone = 'gold', highlighted = false, w = 2.4, h = 0.92 } = {}) {
    const tex = getSidePlaqueTexture(title, subtitle, { tone, highlighted });
    const topMat = this.getPlaqueMat(tex);
    const mats = [
      this.sharedPlaqueEdgeMat,
      this.sharedPlaqueEdgeMat,
      topMat,
      this.sharedPlaqueEdgeMat,
      this.sharedPlaqueEdgeMat,
      this.sharedPlaqueEdgeMat
    ];
    const mesh = new THREE.Mesh(this.sharedPlaqueGeo, mats);
    mesh.scale.set(w, 1, h);
    mesh.userData.baseScaleVec = new THREE.Vector3(w, 1, h);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  buildChair(woodMat, leatherMat, brassMat) {
    const chair = new THREE.Group();
    const legGeo = new THREE.CylinderGeometry(0.11, 0.08, 1.76, 8);
    const frameGeo = new THREE.BoxGeometry(2.3, 0.18, 2.15);
    const cushGeo = new THREE.BoxGeometry(2.1, 0.2, 1.98);
    const postGeo = new THREE.CylinderGeometry(0.095, 0.1, 2.45, 8);
    const slatGeo = new THREE.BoxGeometry(0.2, 1.56, 0.09);
    const crestGeo = new THREE.BoxGeometry(2.35, 0.32, 0.18);
    const tackGeo = new THREE.SphereGeometry(0.055, 8, 6);
    this.disposableGeoms.push(legGeo, frameGeo, cushGeo, postGeo, slatGeo, crestGeo, tackGeo);

    for (const [lx, ly, lz] of [
      [-0.98, -1.48, -0.92],
      [0.98, -1.48, -0.92],
      [-0.98, -1.48, 0.92],
      [0.98, -1.48, 0.92]
    ]) {
      const leg = new THREE.Mesh(legGeo, woodMat);
      leg.position.set(lx, ly, lz);
      leg.castShadow = true;
      chair.add(leg);
    }

    const frame = new THREE.Mesh(frameGeo, woodMat);
    frame.position.set(0, -0.58, 0);
    chair.add(frame);

    const cushion = new THREE.Mesh(cushGeo, leatherMat);
    cushion.position.set(0, -0.44, 0.02);
    chair.add(cushion);

    for (const sx of [-1.02, 1.02]) {
      const post = new THREE.Mesh(postGeo, woodMat);
      post.position.set(sx, 0.65, -0.98);
      post.rotation.x = -0.06;
      chair.add(post);
    }
    for (const sx of [-0.62, 0, 0.62]) {
      const slat = new THREE.Mesh(slatGeo, woodMat);
      slat.position.set(sx, 0.82, -0.99);
      slat.rotation.x = -0.06;
      chair.add(slat);
    }
    const crest = new THREE.Mesh(crestGeo, woodMat);
    crest.position.set(0, 1.78, -1.06);
    crest.rotation.x = -0.06;
    chair.add(crest);

    for (const tx of [-1.02, 1.02]) {
      const finial = new THREE.Mesh(tackGeo, brassMat);
      finial.position.set(tx, 1.92, -1.07);
      chair.add(finial);
    }

    return chair;
  }

  buildSteamPuffs(parent, baseX, baseY, baseZ) {
    for (let i = 0; i < 3; i += 1) {
      const puffMat = new THREE.MeshBasicMaterial({
        color: '#FFF8EC',
        transparent: true,
        opacity: 0.34,
        depthWrite: false
      });
      this.disposableMats.push(puffMat);
      const puff = new THREE.Mesh(this.sharedSteamGeo, puffMat);
      puff.position.set(baseX, baseY, baseZ);
      parent.add(puff);
      this.animatedProps.push({
        kind: 'steam',
        mesh: puff,
        baseX,
        baseY,
        baseZ,
        phase: i / 3
      });
    }
  }

  buildAllTables() {
    const woodTex = getWoodTexture();
    const walnutMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      color: '#B8845A',
      roughness: 0.44,
      metalness: 0.06
    });
    const darkWalnutMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      color: '#5B341D',
      roughness: 0.5,
      metalness: 0.06
    });
    const leatherMat = new THREE.MeshStandardMaterial({
      color: '#2A1812',
      roughness: 0.68,
      metalness: 0.05
    });
    const pokerLeatherMat = new THREE.MeshStandardMaterial({
      color: '#3B1418',
      roughness: 0.54,
      metalness: 0.08
    });
    const feltGreenMat = new THREE.MeshStandardMaterial({
      map: getFeltTexture('green'),
      roughness: 0.88,
      metalness: 0.02
    });
    const pokerFeltMat = new THREE.MeshStandardMaterial({
      map: getPokerFeltTexture(),
      roughness: 0.86,
      metalness: 0.02
    });
    const tavlaMat = new THREE.MeshStandardMaterial({
      map: getTavlaBoardTexture(),
      roughness: 0.46,
      metalness: 0.06
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: '#D4A84B',
      roughness: 0.25,
      metalness: 0.8
    });
    const globeMat = new THREE.MeshBasicMaterial({ color: '#FFE6A8' });
    const copperMat = new THREE.MeshStandardMaterial({ color: '#C26C38', roughness: 0.24, metalness: 0.78 });
    const silverMat = new THREE.MeshStandardMaterial({ color: '#D4DCE0', roughness: 0.24, metalness: 0.8 });
    const saucerMat = new THREE.MeshStandardMaterial({ color: '#F3EDE3', roughness: 0.34 });
    const teaMat = new THREE.MeshStandardMaterial({ color: '#8E250B', roughness: 0.18 });
    const creamCheckerMat = new THREE.MeshStandardMaterial({ color: '#EFE1C0', roughness: 0.35 });
    const darkCheckerMat = new THREE.MeshStandardMaterial({ color: '#381B12', roughness: 0.38 });
    const baklavaMat = new THREE.MeshStandardMaterial({ color: '#C88D2C', roughness: 0.55 });
    const lanternFlameMat = new THREE.MeshBasicMaterial({ color: '#FFCC66' });

    this.sharedCardEdgeMat = new THREE.MeshStandardMaterial({ color: '#EDE4D1', roughness: 0.4 });
    this.sharedCardBottomMat = new THREE.MeshStandardMaterial({
      map: getPlayingCardBackTexture({ highlighted: false }),
      roughness: 0.4
    });
    this.sharedPlaqueEdgeMat = new THREE.MeshStandardMaterial({ color: '#3E2818', roughness: 0.45 });
    this.sharedEmptySlotMat = new THREE.MeshBasicMaterial({
      color: '#F5C842',
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide
    });
    this.sharedTurnRingMat = new THREE.MeshBasicMaterial({ color: '#F5C842', side: THREE.DoubleSide });
    this.sharedDealerMat = new THREE.MeshStandardMaterial({
      color: '#F6EEDF',
      roughness: 0.28,
      metalness: 0.25
    });

    this.chipMats = ['#C42828', '#1F56B0', '#E5B842', '#1C1B1A'].map((col) => {
      const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.34, metalness: 0.16 });
      this.disposableMats.push(m);
      return m;
    });

    this.disposableMats.push(
      walnutMat,
      darkWalnutMat,
      leatherMat,
      pokerLeatherMat,
      feltGreenMat,
      pokerFeltMat,
      tavlaMat,
      brassMat,
      globeMat,
      copperMat,
      silverMat,
      saucerMat,
      teaMat,
      creamCheckerMat,
      darkCheckerMat,
      baklavaMat,
      lanternFlameMat,
      this.sharedCardEdgeMat,
      this.sharedCardBottomMat,
      this.sharedPlaqueEdgeMat,
      this.sharedEmptySlotMat,
      this.sharedTurnRingMat,
      this.sharedDealerMat
    );

    this.sharedCardGeo = new THREE.BoxGeometry(0.92, 0.025, 1.32);
    this.sharedDeckGeo = new THREE.BoxGeometry(0.92, 0.28, 1.32);
    this.sharedPlaqueGeo = new THREE.BoxGeometry(1, 0.085, 1);
    this.sharedChipGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.065, 18);
    this.sharedSlotRingGeo = new THREE.RingGeometry(0.75, 0.88, 28);
    this.sharedSteamGeo = new THREE.SphereGeometry(0.09, 10, 8);
    this.sharedDealerGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.11, 24);
    const turnRingGeo = new THREE.RingGeometry(1.18, 1.36, 24);
    this.disposableGeoms.push(
      this.sharedCardGeo,
      this.sharedDeckGeo,
      this.sharedPlaqueGeo,
      this.sharedChipGeo,
      this.sharedSlotRingGeo,
      this.sharedSteamGeo,
      this.sharedDealerGeo,
      turnRingGeo
    );

    for (const def of SIDE_TABLE_DEFS) {
      const group = new THREE.Group();
      group.position.set(def.x, 0, def.z);
      group.rotation.y = def.rotY || 0;

      if (def.shape === 'oval') {
        // Grand 20.4 x 14.4 Texas Hold'em Casino Table
        const baseApron = new THREE.Mesh(new THREE.CylinderGeometry(7.35, 7.45, 0.56, 48), darkWalnutMat);
        baseApron.scale.set(1.38, 1, 0.98);
        baseApron.position.y = -0.28;
        baseApron.castShadow = true;
        baseApron.receiveShadow = true;
        group.add(baseApron);

        const railTorus = new THREE.Mesh(new THREE.TorusGeometry(7.1, 0.44, 14, 48), pokerLeatherMat);
        railTorus.rotation.x = Math.PI / 2;
        railTorus.scale.set(1.38, 0.98, 0.72);
        railTorus.position.y = 0.05;
        railTorus.castShadow = true;
        group.add(railTorus);

        const felt = new THREE.Mesh(new THREE.CylinderGeometry(6.35, 6.35, 0.08, 48), pokerFeltMat);
        felt.scale.set(1.36, 1, 0.94);
        felt.position.y = -0.02;
        felt.receiveShadow = true;
        group.add(felt);

        // 4 Brass Cup Holders embedded in rail
        const cupGeo = new THREE.CylinderGeometry(0.28, 0.24, 0.14, 14);
        this.disposableGeoms.push(baseApron.geometry, railTorus.geometry, felt.geometry, cupGeo);
        for (const [cx, cz] of [[-4.8, 5.4], [4.8, 5.4], [-4.8, -5.4], [4.8, -5.4]]) {
          const cup = new THREE.Mesh(cupGeo, brassMat);
          cup.position.set(cx, 0.14, cz);
          group.add(cup);
        }
      } else if (def.shape === 'round') {
        // Grand 17.6 diameter Carved Round Salon Table
        const top = new THREE.Mesh(new THREE.CylinderGeometry(8.8, 8.75, 0.54, 42), walnutMat);
        top.position.y = -0.28;
        top.castShadow = true;
        top.receiveShadow = true;
        group.add(top);

        const trimRing = new THREE.Mesh(new THREE.TorusGeometry(7.9, 0.11, 10, 42), brassMat);
        trimRing.rotation.x = Math.PI / 2;
        trimRing.position.y = 0.01;
        group.add(trimRing);

        const felt = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 0.08, 42), feltGreenMat);
        felt.position.y = -0.015;
        felt.receiveShadow = true;
        group.add(felt);
        this.disposableGeoms.push(top.geometry, trimRing.geometry, felt.geometry);
      } else {
        // Grand 17.6 x 17.6 Square Table matching Okey 18.8x18.8 stature + brass corner plates
        const outer = new THREE.Mesh(new THREE.BoxGeometry(17.6, 0.58, 17.6), walnutMat);
        outer.position.y = -0.3;
        outer.castShadow = true;
        outer.receiveShadow = true;
        group.add(outer);

        const felt = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.08, 15.2), feltGreenMat);
        felt.position.y = -0.015;
        felt.receiveShadow = true;
        group.add(felt);

        const cornerGeo = new THREE.BoxGeometry(0.92, 0.62, 0.92);
        this.disposableGeoms.push(outer.geometry, felt.geometry, cornerGeo);
        for (const [cx, cz] of [[-8.38, -8.38], [8.38, -8.38], [-8.38, 8.38], [8.38, 8.38]]) {
          const cap = new THREE.Mesh(cornerGeo, brassMat);
          cap.position.set(cx, -0.29, cz);
          group.add(cap);
        }
      }

      // Sculpted Center Pedestal + 4 Splayed Claw Feet resting cleanly at y = -2.35
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.55, 1.9, 16), darkWalnutMat);
      col.position.y = -1.3;
      col.castShadow = true;
      group.add(col);
      const footDisc = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.1, 0.24, 16), darkWalnutMat);
      footDisc.position.y = -2.23;
      footDisc.receiveShadow = true;
      group.add(footDisc);
      this.disposableGeoms.push(col.geometry, footDisc.geometry);

      // Rich 3D Props for Tavla & Sohbet Lounge Tables
      if (def.props === 'tavla') {
        const board = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.18, 4.1), darkWalnutMat);
        board.position.set(-0.6, 0.09, 0.2);
        board.rotation.y = 0.12;
        board.castShadow = true;
        group.add(board);

        const boardFace = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 3.75), tavlaMat);
        boardFace.rotation.x = -Math.PI / 2;
        boardFace.rotation.z = 0.12;
        boardFace.position.set(-0.6, 0.186, 0.2);
        group.add(boardFace);

        // 3D Checkers in classic Backgammon formation
        const checkerGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 14);
        const diceGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
        this.disposableGeoms.push(board.geometry, boardFace.geometry, checkerGeo, diceGeo);

        const checkerSpecs = [
          [-2.6, -1.25, 2, true],
          [-0.9, 1.25, 3, false],
          [0.95, 1.25, 4, true],
          [2.1, -1.25, 4, false]
        ];
        for (const [cx, cz, cnt, isCream] of checkerSpecs) {
          for (let k = 0; k < cnt; k += 1) {
            const chk = new THREE.Mesh(checkerGeo, isCream ? creamCheckerMat : darkCheckerMat);
            chk.position.set(-0.6 + cx * 0.9, 0.215, 0.2 + cz + (cz > 0 ? -k * 0.34 : k * 0.34));
            chk.castShadow = true;
            group.add(chk);
          }
        }
        for (const [dx, dz] of [[0.45, 0.12], [0.85, 0.35]]) {
          const die = new THREE.Mesh(diceGeo, creamCheckerMat);
          die.position.set(-0.6 + dx, 0.31, 0.2 + dz);
          die.rotation.y = dx;
          die.castShadow = true;
          group.add(die);
        }
      }

      if (def.props === 'tea' || def.props === 'tavla') {
        const trayX = def.props === 'tavla' ? 4.4 : 0;
        const trayZ = def.props === 'tavla' ? -2.8 : 0;
        const tray = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.48, 0.08, 22), silverMat);
        tray.position.set(trayX, 0.045, trayZ);
        tray.castShadow = true;
        group.add(tray);
        this.disposableGeoms.push(tray.geometry);

        if (def.props === 'tea') {
          // Brass samovar pot + flickering warm table lantern + baklava plate
          const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.56, 1.15, 16), copperMat);
          pot.position.set(0, 0.65, 0);
          pot.castShadow = true;
          group.add(pot);

          const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.62, 10), brassMat);
          lantern.position.set(-3.2, 0.34, 2.4);
          group.add(lantern);

          const flame = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), lanternFlameMat);
          flame.position.set(-3.2, 0.42, 2.4);
          group.add(flame);
          this.animatedProps.push({ kind: 'lantern', mesh: flame });

          const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.72, 0.06, 18), saucerMat);
          plate.position.set(2.9, 0.04, 2.4);
          group.add(plate);
          const bakGeo = new THREE.BoxGeometry(0.32, 0.18, 0.32);
          this.disposableGeoms.push(pot.geometry, lantern.geometry, flame.geometry, plate.geometry, bakGeo);
          for (const [bx, bz] of [[-0.25, -0.2], [0.22, -0.18], [-0.15, 0.24], [0.24, 0.22]]) {
            const b = new THREE.Mesh(bakGeo, baklavaMat);
            b.position.set(2.9 + bx, 0.16, 2.4 + bz);
            b.rotation.y = bx + bz;
            group.add(b);
          }
        }

        const teaOffsets = def.props === 'tavla'
          ? [[3.85, -2.5], [4.95, -2.9], [-4.2, 3.6]]
          : [[-0.95, 0.65], [0.95, 0.65], [-0.95, -0.65], [0.95, -0.65]];
        const saucerGeo = new THREE.CylinderGeometry(0.4, 0.3, 0.05, 14);
        const teaGeo = new THREE.CylinderGeometry(0.18, 0.13, 0.44, 12);
        this.disposableGeoms.push(saucerGeo, teaGeo);
        for (const [gx, gz] of teaOffsets) {
          const sx = def.props === 'tavla' ? gx : trayX + gx;
          const sz = def.props === 'tavla' ? gz : trayZ + gz;
          const saucer = new THREE.Mesh(saucerGeo, saucerMat);
          saucer.position.set(sx, 0.08, sz);
          group.add(saucer);
          const tea = new THREE.Mesh(teaGeo, teaMat);
          tea.position.set(sx, 0.31, sz);
          group.add(tea);
          this.buildSteamPuffs(group, sx, 0.58, sz);
        }
      }

      // 4 Enlarged Tufted Chairs at radius 10.3
      for (const off of SEAT_OFFSETS) {
        const ch = this.buildChair(darkWalnutMat, leatherMat, brassMat);
        ch.position.set(off.x, 0, off.z);
        ch.rotation.y = off.rotY;
        group.add(ch);
      }

      // Overhead Brass Chandelier Pendant up to ceiling y = 16.0
      const lampY = 10.6;
      const chainH = 16.0 - lampY;
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, chainH, 6), brassMat);
      chain.position.set(0, lampY + chainH / 2, 0);
      group.add(chain);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.68, 16), brassMat);
      cap.position.set(0, lampY + 0.32, 0);
      group.add(cap);
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 12), globeMat);
      globe.position.set(0, lampY - 0.22, 0);
      group.add(globe);
      this.disposableGeoms.push(chain.geometry, cap.geometry, globe.geometry);

      // Floating table title sign
      const signTex = createTableSignTexture(def.title, def.subtitle, '0/4 Kişi · [E] Otur', false);
      const signMat = new THREE.SpriteMaterial({ map: signTex, transparent: true, depthWrite: false });
      const signSprite = new THREE.Sprite(signMat);
      signSprite.position.set(0, 5.65, 0);
      signSprite.scale.set(7.6, 2.2, 1);
      group.add(signSprite);

      // Dynamic group for seated players, 3D cards & interactive felt plaques
      const dynamicGroup = new THREE.Group();
      group.add(dynamicGroup);

      this.root.add(group);
      this.tableEntries.set(def.id, {
        def,
        group,
        dynamicGroup,
        signMat,
        turnRingGeo,
        nameplateMats: [],
        seatActors: []
      });
    }
  }

  renderChipStack(parent, x, y, z, chipCount, colorOffset = 0) {
    const layers = Math.max(1, Math.min(10, chipCount));
    for (let h = 0; h < layers; h += 1) {
      const mat = this.chipMats[(colorOffset + h) % this.chipMats.length];
      const chip = new THREE.Mesh(this.sharedChipGeo, mat);
      chip.position.set(x, y + h * 0.065, z);
      chip.castShadow = true;
      parent.add(chip);
    }
  }

  captureCardSnapshot(tableId) {
    const entry = this.tableEntries.get(tableId);
    if (!entry) return;
    entry.group.updateMatrixWorld(true);
    entry.dynamicGroup.traverse((obj) => {
      const ck = obj.userData?.animCardKey;
      if (!ck) return;
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      obj.getWorldPosition(pos);
      obj.getWorldQuaternion(quat);
      this.prevCardPositions.set(`${tableId}:${ck}`, { pos, quat, expiresAt: performance.now() + 3000 });
    });
  }

  enqueueCardFlight(mesh, parentObj, tableId, cardKey, fallbackStartLocal = null, { duration = 0.42, arcHeight = 1.05, delay = 0 } = {}) {
    const entry = this.tableEntries.get(tableId);
    if (!entry) return;
    parentObj.updateMatrixWorld(true);
    mesh.updateMatrixWorld(true);

    const targetWorldPos = new THREE.Vector3();
    const targetWorldQuat = new THREE.Quaternion();
    mesh.getWorldPosition(targetWorldPos);
    mesh.getWorldQuaternion(targetWorldQuat);

    const prev = cardKey ? this.prevCardPositions.get(`${tableId}:${cardKey}`) : null;
    if (prev && prev.pos.distanceTo(targetWorldPos) < 0.08) {
      return; // Card stayed in same place, no need to fly
    }

    let startWorldPos = prev ? prev.pos.clone() : null;
    const startWorldQuat = prev ? prev.quat.clone() : targetWorldQuat.clone();

    if (!startWorldPos) {
      if (fallbackStartLocal) {
        startWorldPos = fallbackStartLocal.clone().applyMatrix4(entry.group.matrixWorld);
      } else {
        startWorldPos = new THREE.Vector3(0, 0.5, 0).applyMatrix4(entry.group.matrixWorld);
      }
    }

    const parentInv = parentObj.matrixWorld.clone().invert();
    const parentRotInv = new THREE.Quaternion().setFromRotationMatrix(parentInv);

    const startLocalPos = startWorldPos.clone().applyMatrix4(parentInv);
    const targetLocalPos = mesh.position.clone();
    const startLocalQuat = parentRotInv.clone().multiply(startWorldQuat);
    const targetLocalQuat = mesh.quaternion.clone();

    mesh.position.copy(startLocalPos);
    mesh.quaternion.copy(startLocalQuat);

    this.cardAnims.push({
      mesh,
      startPos: startLocalPos,
      targetPos: targetLocalPos,
      startQuat: startLocalQuat,
      targetQuat: targetLocalQuat,
      elapsed: 0,
      delay,
      duration,
      arcHeight
    });
  }

  updateStates(sideTables = [], viewerCtx = {}) {
    const list = Array.isArray(sideTables) ? sideTables : [];
    const mySideTableId = viewerCtx.mySideTableId || null;
    const mySideSeatIndex = viewerCtx.mySideSeatIndex ?? null;

    const sig = JSON.stringify({
      mySideTableId,
      mySideSeatIndex,
      list: list.map((t) => ({
        id: t.id,
        p: t.phase,
        bp: t.batakSubPhase,
        ps: t.pokerStage,
        cs: t.currentSeat,
        ms: t.mySeatIndex,
        mt: t.isMyTurn,
        dc: t.deckCount,
        pot: t.pot,
        cb: t.currentBet,
        cc: t.centerCount,
        ct: t.centerTopCard?.id || null,
        com: (t.communityCards || []).map((c) => c.id),
        tc: (t.trickCards || []).map((tc) => `${tc.seatIndex}:${tc.card?.id}`),
        dts: t.drawTargetSeatIndex,
        dtc: t.drawTargetCount,
        mh: (t.myHand || []).map((c) => c.id),
        lg: t.legalCardIds || [],
        wt: t.winnerText || '',
        ds: t.dealerSeatIndex ?? 0,
        s: (t.seats || []).map((st) => [
          st.type,
          st.name,
          st.avatar,
          st.handCount,
          st.bid,
          st.tricksWon,
          st.bet,
          st.chips,
          st.folded,
          st.pistiPoints,
          (st.revealedHand || []).map((c) => c.id)
        ])
      }))
    });

    if (sig === this.lastStateSig) return;
    this.lastStateSig = sig;
    this.interactables = [];
    this.cardAnims = [];
    this.lastHoveredMesh = null;

    for (const t of list) {
      const entry = this.tableEntries.get(t.id);
      if (!entry) continue;

      this.captureCardSnapshot(t.id);

      while (entry.dynamicGroup.children.length > 0) {
        entry.dynamicGroup.remove(entry.dynamicGroup.children[0]);
      }
      for (const m of entry.nameplateMats) {
        m.map?.dispose();
        m.dispose();
      }
      entry.nameplateMats = [];
      entry.seatActors = [];

      const activeSeats = (t.seats || []).filter((s) => s.type !== 'empty');
      const statusLabel =
        t.phase === 'playing'
          ? `${activeSeats.length}/4 · Oyun Devam Ediyor`
          : t.kind === 'chat'
            ? `${activeSeats.length}/4 Kişi · Sohbet`
            : `${activeSeats.length}/4 Kişi · Hazır`;

      entry.signMat.map?.dispose();
      entry.signMat.map = createTableSignTexture(t.title, t.subtitle, statusLabel, t.phase === 'playing');
      entry.signMat.needsUpdate = true;

      const isMyTable = mySideTableId === t.id && Number.isInteger(t.mySeatIndex ?? mySideSeatIndex);
      const localSeatIdx = isMyTable ? (t.mySeatIndex ?? mySideSeatIndex ?? 0) : 0;
      const localSeatOff = SEAT_OFFSETS[localSeatIdx] || SEAT_OFFSETS[0];

      const viewerFrame = new THREE.Group();
      viewerFrame.rotation.y = localSeatOff.rotY + Math.PI;
      entry.dynamicGroup.add(viewerFrame);

      // Setup / GameOver 3D Plaques on felt
      if (t.kind !== 'chat' && t.phase !== 'playing') {
        const hasPlayers = activeSeats.length > 0;
        if (t.winnerText) {
          const winPlaque = this.createPlaqueMesh(
            'EL SONUCU',
            String(t.winnerText).slice(0, 22),
            { tone: 'dark', w: 6.2, h: 1.55 }
          );
          winPlaque.position.set(0, 0.1, -2.4);
          winPlaque.rotation.x = 0.24;
          viewerFrame.add(winPlaque);
        }

        if (hasPlayers) {
          const startLabel = t.phase === 'gameOver' ? 'YENİ EL' : 'BAŞLAT';
          const startPlaque = this.createPlaqueMesh(startLabel, '3D Masayı Aç', {
            tone: 'emerald',
            highlighted: true,
            w: 3.4,
            h: 1.32
          });
          startPlaque.position.set(-2.0, 0.16, 0.65);
          startPlaque.rotation.x = 0.34;
          startPlaque.userData = {
            kind: 'sideSetup',
            tableId: t.id,
            command: 'start',
            label: startLabel,
            baseY: 0.16,
            baseScaleVec: startPlaque.userData.baseScaleVec
          };
          viewerFrame.add(startPlaque);
          this.interactables.push(startPlaque);
        }

        if (t.seats?.some((s) => s.type !== 'human')) {
          const hasBot = t.seats.some((s) => s.type === 'bot');
          const botLabel = hasBot ? 'BOTU ÇIKAR' : 'BOT EKLE';
          const botPlaque = this.createPlaqueMesh(botLabel, 'Koltuk Ayarı', {
            tone: 'gold',
            w: 3.4,
            h: 1.32
          });
          botPlaque.position.set(hasPlayers ? 2.0 : 0, 0.16, 0.65);
          botPlaque.rotation.x = 0.34;
          botPlaque.userData = {
            kind: 'sideSetup',
            tableId: t.id,
            command: 'toggleBot',
            label: botLabel,
            baseY: 0.16,
            baseScaleVec: botPlaque.userData.baseScaleVec
          };
          viewerFrame.add(botPlaque);
          this.interactables.push(botPlaque);
        }
      }

      // Active Card Game Visuals
      if (t.phase === 'playing' && t.kind !== 'chat') {
        if (t.kind === 'pisti') {
          const deckPos = new THREE.Vector3(-2.4, 0.18, -0.5);
          if ((t.deckCount || 0) > 0) {
            const deckMats = [
              this.sharedCardEdgeMat,
              this.sharedCardEdgeMat,
              this.getFaceMat(getPlayingCardBackTexture({ highlighted: false })),
              this.sharedCardEdgeMat,
              this.sharedCardEdgeMat,
              this.sharedCardEdgeMat
            ];
            const deckMesh = new THREE.Mesh(this.sharedDeckGeo, deckMats);
            const hScale = Math.max(0.25, Math.min(1.15, (t.deckCount || 0) / 36));
            deckMesh.scale.set(1.55, hScale, 1.55);
            deckMesh.position.set(deckPos.x, 0.03 + 0.16 * hScale, deckPos.z);
            deckMesh.castShadow = true;
            viewerFrame.add(deckMesh);
          }

          const deckTag = this.createPlaqueMesh(`DESTE: ${t.deckCount ?? 0}`, `ORTA: ${t.centerCount ?? 0}`, {
            tone: 'dark',
            w: 2.9,
            h: 0.96
          });
          deckTag.position.set(-2.4, 0.1, 1.35);
          deckTag.rotation.x = 0.26;
          viewerFrame.add(deckTag);

          if (t.centerTopCard) {
            if ((t.centerCount || 0) > 1) {
              const under = this.createPlayingCardMesh(t.centerTopCard, { faceUp: false, scale: 1.66 });
              under.position.set(1.02, 0.05, -0.45);
              under.rotation.y = 0.18;
              viewerFrame.add(under);
            }
            const topMesh = this.createPlayingCardMesh(t.centerTopCard, { faceUp: true, scale: 1.72 });
            topMesh.position.set(1.05, 0.11, -0.5);
            topMesh.rotation.y = -0.06;
            topMesh.userData.animCardKey = `pisti-top-${t.centerTopCard.id}`;
            viewerFrame.add(topMesh);
            this.enqueueCardFlight(topMesh, viewerFrame, t.id, topMesh.userData.animCardKey, new THREE.Vector3(0, 0.9, -4));
          } else {
            const emptyPlaque = this.createPlaqueMesh('ORTA BOŞ', 'Kart At', {
              tone: 'dark',
              w: 2.4,
              h: 1.0
            });
            emptyPlaque.position.set(1.05, 0.08, -0.5);
            viewerFrame.add(emptyPlaque);
          }
        } else if (t.kind === 'poker') {
          const potPlaque = this.createPlaqueMesh(
            `POT: ${t.pot ?? 0}`,
            `BAHİS: ${t.currentBet ?? 0}`,
            { tone: 'gold', highlighted: (t.pot || 0) > 0, w: 3.9, h: 1.18 }
          );
          potPlaque.position.set(-0.6, 0.1, -3.1);
          potPlaque.rotation.x = 0.24;
          viewerFrame.add(potPlaque);

          const potStacks = Math.min(4, Math.ceil((t.pot || 0) / 70));
          for (let cs = 0; cs < potStacks; cs += 1) {
            this.renderChipStack(viewerFrame, 2.2 + cs * 0.62, 0.05, -3.0 + (cs % 2) * 0.36, 4 + cs, cs);
          }

          // Sliding Animated Dealer Button ("D")
          const dealerSeatOff = SEAT_OFFSETS[t.dealerSeatIndex ?? 0] || SEAT_OFFSETS[0];
          const dealerHolder = new THREE.Group();
          dealerHolder.rotation.y = dealerSeatOff.rotY + Math.PI;
          const dBtn = new THREE.Mesh(this.sharedDealerGeo, this.sharedDealerMat);
          dBtn.position.set(1.9, 0.08, 4.9);
          dBtn.castShadow = true;
          dealerHolder.add(dBtn);
          entry.dynamicGroup.add(dealerHolder);

          const comm = Array.isArray(t.communityCards) ? t.communityCards : [];
          for (let ci = 0; ci < 5; ci += 1) {
            const cx = (ci - 2) * 1.85;
            const cz = -0.65;
            if (comm[ci]) {
              const cardMesh = this.createPlayingCardMesh(comm[ci], { faceUp: true, scale: 1.62 });
              cardMesh.position.set(cx, 0.08, cz);
              cardMesh.userData.animCardKey = `comm-${comm[ci].id}`;
              viewerFrame.add(cardMesh);
              this.enqueueCardFlight(cardMesh, viewerFrame, t.id, cardMesh.userData.animCardKey, new THREE.Vector3(0, 1.1, -3.2), {
                delay: ci * 0.04
              });
            } else {
              const slotRing = new THREE.Mesh(this.sharedSlotRingGeo, this.sharedEmptySlotMat);
              slotRing.rotation.x = -Math.PI / 2;
              slotRing.position.set(cx, 0.04, cz);
              viewerFrame.add(slotRing);
            }
          }

          if (isMyTable && t.isMyTurn) {
            const mySeat = t.seats?.[localSeatIdx];
            const toCall = Math.max(0, (t.currentBet || 0) - (mySeat?.bet || 0));
            const actions = [
              {
                title: toCall > 0 ? `GÖR (${toCall})` : 'PAS',
                sub: 'Devam Et',
                tone: 'emerald',
                action: toCall > 0 ? 'call' : 'check',
                payload: {}
              }
            ];
            if ((mySeat?.chips || 0) > toCall + 10) {
              actions.push({
                title: '+20 ARTIR',
                sub: 'Bahis Yükselt',
                tone: 'gold',
                action: 'raise',
                payload: { amount: 20 }
              });
            }
            if ((mySeat?.chips || 0) > toCall + 40) {
              actions.push({
                title: '+50 ARTIR',
                sub: 'Büyük Artış',
                tone: 'gold',
                action: 'raise',
                payload: { amount: 50 }
              });
            }
            actions.push({
              title: 'ÇEKİL',
              sub: 'Elden Çık',
              tone: 'red',
              action: 'fold',
              payload: {}
            });

            // The viewer's two hole cards sit in the middle of the near edge, so the
            // buttons fan out to both sides of them instead of hiding behind them.
            const spacing = 2.3;
            const innerX = 2.85;
            const leftCount = Math.ceil(actions.length / 2);
            actions.forEach((act, aIdx) => {
              const ax = aIdx < leftCount
                ? -innerX - (leftCount - 1 - aIdx) * spacing
                : innerX + (aIdx - leftCount) * spacing;
              const plaque = this.createPlaqueMesh(act.title, act.sub, {
                tone: act.tone,
                highlighted: true,
                w: 2.15,
                h: 0.98
              });
              plaque.position.set(ax, 0.32, 3.15);
              plaque.rotation.x = 0.56;
              plaque.userData = {
                kind: 'sideAction',
                tableId: t.id,
                action: act.action,
                payload: act.payload,
                label: act.title,
                baseY: 0.32,
                baseScaleVec: plaque.userData.baseScaleVec
              };
              viewerFrame.add(plaque);
              this.interactables.push(plaque);
            });
          }
        } else if (t.kind === 'batak') {
          const trumpPlaque = this.createPlaqueMesh('KOZ: ♠ MAÇA', `EL ${t.roundNumber || 1}`, {
            tone: 'dark',
            w: 3.1,
            h: 1.0
          });
          trumpPlaque.position.set(0, 0.1, -3.7);
          trumpPlaque.rotation.x = 0.24;
          viewerFrame.add(trumpPlaque);

          const trickList = Array.isArray(t.trickCards) ? t.trickCards : [];
          trickList.forEach((entryItem, idx) => {
            const seatOff = SEAT_OFFSETS[entryItem.seatIndex] || SEAT_OFFSETS[0];
            const cardFrame = new THREE.Group();
            cardFrame.rotation.y = seatOff.rotY + Math.PI;
            const cMesh = this.createPlayingCardMesh(entryItem.card, { faceUp: true, scale: 1.56 });
            cMesh.position.set(0, 0.06 + idx * 0.012, 2.05);
            cMesh.userData.animCardKey = `trick-${entryItem.card.id}`;
            cardFrame.add(cMesh);
            entry.dynamicGroup.add(cardFrame);
            this.enqueueCardFlight(cMesh, cardFrame, t.id, cMesh.userData.animCardKey, new THREE.Vector3(seatOff.x * 0.6, 1.0, seatOff.z * 0.6));
          });

          if (isMyTable && t.isMyTurn && t.batakSubPhase === 'bidding') {
            const bidHead = this.createPlaqueMesh('İHALE SEÇ', '1 - 13 El Tahmini', {
              tone: 'gold',
              highlighted: true,
              w: 3.7,
              h: 0.9
            });
            bidHead.position.set(0, 0.22, 0.15);
            bidHead.rotation.x = 0.35;
            viewerFrame.add(bidHead);

            for (let bid = 1; bid <= 13; bid += 1) {
              const row = bid <= 7 ? 0 : 1;
              const col = bid <= 7 ? bid - 1 : bid - 8;
              const colsInRow = row === 0 ? 7 : 6;
              const bx = (col - (colsInRow - 1) / 2) * 1.24;
              const bz = row === 0 ? 1.55 : 2.68;
              const bidPlaque = this.createPlaqueMesh(String(bid), '', {
                tone: 'gold',
                highlighted: true,
                w: 1.1,
                h: 0.84
              });
              bidPlaque.position.set(bx, 0.3 + row * 0.08, bz);
              bidPlaque.rotation.x = 0.54;
              bidPlaque.userData = {
                kind: 'sideAction',
                tableId: t.id,
                action: 'bid',
                payload: { bid },
                label: `İhale ${bid}`,
                baseY: 0.3 + row * 0.08,
                baseScaleVec: bidPlaque.userData.baseScaleVec
              };
              viewerFrame.add(bidPlaque);
              this.interactables.push(bidPlaque);
            }
          }
        } else if (t.kind === 'papazkacti') {
          const infoText = t.isMyTurn && t.drawTargetSeatIndex !== null
            ? `${t.drawTargetName} ELİNDEN KART ÇEK`
            : 'PAPAZ KAÇTI (K♠)';
          const subText = t.isMyTurn ? 'Parlayan Karta Tıkla' : (t.statusMessage || 'Sıra Bekleniyor');
          const pkPlaque = this.createPlaqueMesh(infoText, subText, {
            tone: t.isMyTurn ? 'gold' : 'dark',
            highlighted: Boolean(t.isMyTurn),
            w: 5.2,
            h: 1.24
          });
          pkPlaque.position.set(0, 0.12, 0);
          pkPlaque.rotation.x = 0.24;
          viewerFrame.add(pkPlaque);
        }
      }

      // Seated Player 3D Hand + Opponent Hands + Unified Brass PFP Characters + Chips
      const legalSet = new Set(Array.isArray(t.legalCardIds) ? t.legalCardIds : []);
      const canPlayHandCard = Boolean(
        isMyTable &&
        t.isMyTurn &&
        (t.kind === 'pisti' || (t.kind === 'batak' && t.batakSubPhase === 'playing'))
      );

      for (const s of t.seats || []) {
        if (!s || s.type === 'empty') continue;
        const off = SEAT_OFFSETS[s.seatIndex];
        if (!off) continue;

        const seatFrame = new THREE.Group();
        seatFrame.rotation.y = off.rotY + Math.PI;
        entry.dynamicGroup.add(seatFrame);

        const isLocalViewerSeat = isMyTable && s.seatIndex === localSeatIdx;

        if (t.kind === 'poker' && t.phase === 'playing') {
          if (!s.folded && (s.chips || 0) > 0) {
            this.renderChipStack(seatFrame, 2.25, 0.05, 5.4, Math.ceil((s.chips || 0) / 140), s.seatIndex);
          }
          if ((s.bet || 0) > 0 || s.folded) {
            const betPlaque = this.createPlaqueMesh(
              s.folded ? 'ÇEKİLDİ' : `BAHİS: ${s.bet}`,
              `${s.chips ?? 0} Çip`,
              { tone: s.folded ? 'red' : 'dark', w: 2.2, h: 0.78 }
            );
            betPlaque.position.set(-2.1, 0.1, 4.75);
            betPlaque.rotation.x = 0.24;
            seatFrame.add(betPlaque);
          }
        }

        if (isLocalViewerSeat) {
          const myHand = Array.isArray(t.myHand) ? t.myHand : [];
          const n = myHand.length;
          if (n > 0) {
            const maxSpan = n <= 4 ? 5.6 : 9.4;
            const isPokerHand = t.kind === 'poker';
            const step = n > 1 ? Math.min(isPokerHand ? 1.12 : 1.58, maxSpan / (n - 1)) : 0;
            myHand.forEach((card, cIdx) => {
              const offset = cIdx - (n - 1) / 2;
              const isLegal = !canPlayHandCard || legalSet.has(card.id);
              const cardMesh = this.createPlayingCardMesh(card, {
                faceUp: true,
                legal: isLegal,
                dimmed: canPlayHandCard && !isLegal,
                scale: isPokerHand ? 1.08 : n <= 4 ? 1.56 : 1.38
              });
              cardMesh.rotation.order = 'YXZ';
              const baseY = 1.05 + cIdx * 0.006 + (canPlayHandCard && isLegal ? 0.18 : 0);
              cardMesh.position.set(
                offset * step,
                baseY,
                6.25 + Math.abs(offset) * 0.045
              );
              cardMesh.rotation.x = 0.72;
              cardMesh.rotation.y = -offset * 0.03;
              cardMesh.userData = {
                kind: canPlayHandCard && isLegal ? 'sideAction' : 'sideCard',
                tableId: t.id,
                action: 'playCard',
                payload: { cardId: card.id },
                label: card.label,
                animCardKey: `hand-${card.id}`,
                baseY,
                baseScale: cardMesh.userData.baseScale
              };

              if (canPlayHandCard && isLegal) {
                this.interactables.push(cardMesh);
              }
              seatFrame.add(cardMesh);
              this.enqueueCardFlight(cardMesh, seatFrame, t.id, cardMesh.userData.animCardKey, new THREE.Vector3(0, 0.8, 0), {
                delay: cIdx * 0.025
              });
            });
          }
        } else if (t.kind === 'poker' && t.phase === 'gameOver' && Array.isArray(s.revealedHand) && s.revealedHand.length > 0) {
          s.revealedHand.forEach((card, rIdx) => {
            const cMesh = this.createPlayingCardMesh(card, { faceUp: true, scale: 1.42 });
            cMesh.position.set((rIdx - 0.5) * 1.52, 0.08, 5.5);
            seatFrame.add(cMesh);
          });
        } else if (t.phase === 'playing' && (s.handCount || 0) > 0 && !s.folded) {
          const isDrawTarget =
            isMyTable &&
            t.kind === 'papazkacti' &&
            t.isMyTurn &&
            t.drawTargetSeatIndex === s.seatIndex;
          const cardCount = Math.min(13, s.handCount || 0);
          const span = isDrawTarget ? Math.min(8.4, cardCount * 0.98) : Math.min(5.6, cardCount * 0.5);
          const step = cardCount > 1 ? span / (cardCount - 1) : 0;

          for (let c = 0; c < cardCount; c += 1) {
            const offset = c - (cardCount - 1) / 2;
            const cMesh = this.createPlayingCardMesh(null, {
              faceUp: false,
              highlighted: isDrawTarget,
              scale: isDrawTarget ? 1.5 : 1.24
            });
            cMesh.rotation.order = 'YXZ';
            const baseY = isDrawTarget ? 1.22 : 0.82 + c * 0.005;
            cMesh.position.set(
              offset * step,
              baseY,
              isDrawTarget ? 5.35 : 6.45 + Math.abs(offset) * 0.03
            );
            cMesh.rotation.x = isDrawTarget ? -0.45 : -0.62;
            cMesh.rotation.y = offset * 0.025;

            if (isDrawTarget) {
              cMesh.userData = {
                kind: 'sideAction',
                tableId: t.id,
                action: 'drawCard',
                payload: { pickIndex: c },
                label: `${s.name} · ${c + 1}. Kart`,
                baseY,
                baseScale: cMesh.userData.baseScale
              };
              this.interactables.push(cMesh);
            }
            seatFrame.add(cMesh);
          }
        }

        // Skip rendering the seated local player's own 3D bust so FP camera never clips inside their head
        if (isLocalViewerSeat) continue;

        const isActive = t.phase === 'playing' && t.currentSeat === s.seatIndex;
        const actor = buildKahveCharacter({
          bustGeom: this.bustGeom,
          avatarMatCache: this.avatarMatCache,
          avatar: s.avatar || `avatar-${(s.seatIndex % 16) + 1}`,
          name: s.name || 'Oyuncu',
          vestColor: s.type === 'bot' ? '#244A6E' : VEST_PALETTE[s.seatIndex % VEST_PALETTE.length],
          teamColor: s.type === 'bot' ? '#56B4E9' : '#C59A4B',
          isBot: s.type === 'bot',
          isActive,
          seated: true,
          medRadius: 0.96,
          headY: 2.75,
          rearPfp: true,
          disposableMats: this.disposableMats
        });

        if (actor.nameplateMat) {
          entry.nameplateMats.push(actor.nameplateMat);
        }
        actor.group.position.set(off.x, -0.35, off.z);
        actor.group.rotation.y = off.rotY;
        entry.dynamicGroup.add(actor.group);
        entry.seatActors.push({
          ...actor,
          phaseOffset: s.seatIndex * 1.7 + t.id.length * 0.5
        });
      }
    }
  }

  tick(dt = 0.016, hoveredMesh = null) {
    this.animClock += dt;

    // 1. Parabolic 3D Card Deal & Play Flight Animations
    for (let i = this.cardAnims.length - 1; i >= 0; i -= 1) {
      const a = this.cardAnims[i];
      a.elapsed += dt;
      if (a.elapsed < a.delay) continue;
      const p = Math.min(1, (a.elapsed - a.delay) / a.duration);
      const ease = 1 - (1 - p) ** 3;
      a.mesh.position.lerpVectors(a.startPos, a.targetPos, ease);
      a.mesh.position.y += Math.sin(p * Math.PI) * a.arcHeight;
      a.mesh.quaternion.slerpQuaternions(a.startQuat, a.targetQuat, ease);
      if (p >= 1) {
        a.mesh.position.copy(a.targetPos);
        a.mesh.quaternion.copy(a.targetQuat);
        this.cardAnims.splice(i, 1);
      }
    }

    // 2. Interactive 3D Hover Lift & Scale Highlight on cards/plaques
    if (this.lastHoveredMesh && this.lastHoveredMesh !== hoveredMesh) {
      const prev = this.lastHoveredMesh;
      if (Number.isFinite(prev.userData?.baseY)) prev.position.y = prev.userData.baseY;
      if (Number.isFinite(prev.userData?.baseScale)) prev.scale.setScalar(prev.userData.baseScale);
      else if (prev.userData?.baseScaleVec) prev.scale.copy(prev.userData.baseScaleVec);
      this.lastHoveredMesh = null;
    }
    if (hoveredMesh && (hoveredMesh.userData?.kind === 'sideAction' || hoveredMesh.userData?.kind === 'sideSetup')) {
      this.lastHoveredMesh = hoveredMesh;
      const isAnim = this.cardAnims.some((a) => a.mesh === hoveredMesh);
      if (!isAnim) {
        if (Number.isFinite(hoveredMesh.userData?.baseY)) {
          hoveredMesh.position.y = hoveredMesh.userData.baseY + 0.16;
        }
        if (Number.isFinite(hoveredMesh.userData?.baseScale)) {
          hoveredMesh.scale.setScalar(hoveredMesh.userData.baseScale * 1.07);
        } else if (hoveredMesh.userData?.baseScaleVec) {
          hoveredMesh.scale.copy(hoveredMesh.userData.baseScaleVec).multiplyScalar(1.06);
        }
      }
    }

    // 3. Ambient Salon Table Props (rising tea steam + flickering table lantern)
    for (const p of this.animatedProps) {
      if (p.kind === 'steam') {
        p.phase = (p.phase + dt * 0.42) % 1;
        p.mesh.position.y = p.baseY + p.phase * 0.85;
        p.mesh.position.x = p.baseX + Math.sin(p.phase * Math.PI * 2) * 0.06;
        p.mesh.scale.setScalar(0.75 + p.phase * 0.95);
        p.mesh.material.opacity = Math.sin(p.phase * Math.PI) * 0.34;
      } else if (p.kind === 'lantern') {
        const pulse = 0.9 + Math.sin(this.animClock * 6.5) * 0.14;
        p.mesh.scale.setScalar(pulse);
      }
    }

    // 4. Seated Player Breathing Sway + Turn Halo Pulse
    for (const entry of this.tableEntries.values()) {
      for (const actor of entry.seatActors) {
        actor.bodyGroup.position.y = Math.sin(this.animClock * 1.9 + actor.phaseOffset) * 0.022;
        if (actor.haloMesh) {
          actor.haloMesh.scale.setScalar(1 + Math.sin(this.animClock * 4.5) * 0.06);
        }
      }
    }
  }

  getSeatCameraPose(tableId, seatIndex = 0, preset = 'fp') {
    const def = SIDE_TABLE_DEFS.find((d) => d.id === tableId) || SIDE_TABLE_DEFS[0];
    const sIdx = [0, 1, 2, 3].includes(Number(seatIndex)) ? Number(seatIndex) : 0;
    const off = SEAT_OFFSETS[sIdx];
    const worldRotY = (def.rotY || 0) + off.rotY + Math.PI;
    const tableCenter = new THREE.Vector3(def.x, 0, def.z);
    const yAxis = new THREE.Vector3(0, 1, 0);

    let localPos;
    let localTarget;
    let fov = 60;

    if (preset === 'top') {
      localPos = new THREE.Vector3(0, 22.0, 1.5);
      localTarget = new THREE.Vector3(0, 0.1, 0);
      fov = 48;
    } else if (preset === 'table') {
      localPos = new THREE.Vector3(0, 11.4, 16.5);
      localTarget = new THREE.Vector3(0, 0.35, 0);
      fov = 48;
    } else {
      localPos = new THREE.Vector3(0, 5.1, 11.6);
      localTarget = new THREE.Vector3(0, 0.72, 0.3);
      fov = 60;
    }

    const pos = localPos.applyAxisAngle(yAxis, worldRotY).add(tableCenter);
    const target = localTarget.applyAxisAngle(yAxis, worldRotY).add(tableCenter);
    return { pos, target, fov };
  }

  dispose() {
    for (const entry of this.tableEntries.values()) {
      entry.signMat?.map?.dispose();
      entry.signMat?.dispose();
      for (const m of entry.nameplateMats) {
        m.map?.dispose();
        m.dispose();
      }
    }
    this.tableEntries.clear();
    for (const m of this.cachedFaceMats.values()) m?.dispose();
    for (const m of this.cachedPlaqueMats.values()) m?.dispose();
    this.cachedFaceMats.clear();
    this.cachedPlaqueMats.clear();
    for (const g of this.disposableGeoms) g?.dispose();
    for (const m of this.disposableMats) m?.dispose();
    this.disposableGeoms = [];
    this.disposableMats = [];
    this.interactables = [];
    this.animatedProps = [];
    this.cardAnims = [];
  }
}
