import * as THREE from 'three';
import { SIDE_TABLE_DEFS } from '../../shared/sideGames.js';
import {
  createNameplateTexture,
  getAvatarTexture,
  getFeltTexture,
  getPlayingCardBackTexture,
  getPlayingCardTexture,
  getSidePlaqueTexture,
  getWoodTexture
} from './textures.js';

const SEAT_OFFSETS = [
  { x: 0, z: 6.1, rotY: Math.PI },
  { x: 6.1, z: 0, rotY: -Math.PI / 2 },
  { x: 0, z: -6.1, rotY: 0 },
  { x: -6.1, z: 0, rotY: Math.PI / 2 }
];

function createTableSignTexture(title, subtitle, statusLabel, isPlaying = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 148;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(20, 12, 8, 0.92)';
  ctx.strokeStyle = isPlaying ? '#F5C842' : '#B98C46';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 132, 22);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 34px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillStyle = '#FFF5E0';
  ctx.fillText(String(title || '').slice(0, 24), 256, 44);

  ctx.font = '600 22px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillStyle = '#D7BC8D';
  ctx.fillText(String(subtitle || '').slice(0, 32), 256, 82);

  ctx.font = 'bold 21px "Plus Jakarta Sans", system-ui, sans-serif';
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

    this.buildAllTables();
  }

  getInteractables() {
    return this.interactables;
  }

  getFaceMat(tex) {
    if (!tex) return this.sharedCardEdgeMat;
    if (this.cachedFaceMats.has(tex.uuid)) return this.cachedFaceMats.get(tex.uuid);
    if (this.cachedFaceMats.size > 320) {
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
    if (this.cachedPlaqueMats.size > 200) {
      const oldestKey = this.cachedPlaqueMats.keys().next().value;
      this.cachedPlaqueMats.get(oldestKey)?.dispose();
      this.cachedPlaqueMats.delete(oldestKey);
    }
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.38,
      metalness: 0.12
    });
    this.cachedPlaqueMats.set(tex.uuid, mat);
    return mat;
  }

  createPlayingCardMesh(card, { faceUp = true, legal = true, dimmed = false, highlighted = false, scale = 1 } = {}) {
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
    if (scale !== 1) mesh.scale.setScalar(scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  createPlaqueMesh(title, subtitle, { tone = 'gold', highlighted = false, w = 1.6, h = 0.62 } = {}) {
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
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  buildChair(woodMat, leatherMat) {
    const chair = new THREE.Group();
    const legGeo = new THREE.CylinderGeometry(0.09, 0.065, 1.74, 8);
    this.disposableGeoms.push(legGeo);
    for (const [lx, ly, lz] of [
      [-0.82, -1.48, -0.78],
      [0.82, -1.48, -0.78],
      [-0.82, -1.48, 0.78],
      [0.82, -1.48, 0.78]
    ]) {
      const leg = new THREE.Mesh(legGeo, woodMat);
      leg.position.set(lx, ly, lz);
      leg.castShadow = true;
      chair.add(leg);
    }

    const frameGeo = new THREE.BoxGeometry(1.9, 0.16, 1.8);
    const cushGeo = new THREE.BoxGeometry(1.74, 0.16, 1.66);
    const postGeo = new THREE.CylinderGeometry(0.08, 0.085, 2.22, 8);
    const slatGeo = new THREE.BoxGeometry(0.16, 1.38, 0.08);
    const crestGeo = new THREE.BoxGeometry(1.92, 0.26, 0.16);
    this.disposableGeoms.push(frameGeo, cushGeo, postGeo, slatGeo, crestGeo);

    const frame = new THREE.Mesh(frameGeo, woodMat);
    frame.position.set(0, -0.58, 0);
    chair.add(frame);

    const cushion = new THREE.Mesh(cushGeo, leatherMat);
    cushion.position.set(0, -0.46, 0.02);
    chair.add(cushion);

    for (const sx of [-0.84, 0.84]) {
      const post = new THREE.Mesh(postGeo, woodMat);
      post.position.set(sx, 0.54, -0.82);
      post.rotation.x = -0.06;
      chair.add(post);
    }
    for (const sx of [-0.52, 0, 0.52]) {
      const slat = new THREE.Mesh(slatGeo, woodMat);
      slat.position.set(sx, 0.7, -0.83);
      slat.rotation.x = -0.06;
      chair.add(slat);
    }
    const crest = new THREE.Mesh(crestGeo, woodMat);
    crest.position.set(0, 1.54, -0.88);
    crest.rotation.x = -0.06;
    chair.add(crest);

    return chair;
  }

  buildAllTables() {
    const woodTex = getWoodTexture();
    const walnutMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      color: '#734528',
      roughness: 0.44,
      metalness: 0.08
    });
    const darkWalnutMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      color: '#4B2A18',
      roughness: 0.5,
      metalness: 0.06
    });
    const leatherMat = new THREE.MeshStandardMaterial({
      color: '#2A1913',
      roughness: 0.72,
      metalness: 0.04
    });
    const feltGreenMat = new THREE.MeshStandardMaterial({
      map: getFeltTexture('green'),
      roughness: 0.88,
      metalness: 0.02
    });
    const pokerFeltMat = new THREE.MeshStandardMaterial({
      color: '#125E3F',
      roughness: 0.86,
      metalness: 0.02
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: '#C79B42',
      roughness: 0.28,
      metalness: 0.72
    });
    const globeMat = new THREE.MeshBasicMaterial({ color: '#FFE6A8' });
    const traySilverMat = new THREE.MeshStandardMaterial({ color: '#CBD2D6', roughness: 0.26, metalness: 0.75 });
    const saucerMat = new THREE.MeshStandardMaterial({ color: '#F0EAE0', roughness: 0.35 });
    const teaMat = new THREE.MeshStandardMaterial({ color: '#8E250B', roughness: 0.2 });

    this.sharedCardEdgeMat = new THREE.MeshStandardMaterial({ color: '#EDE4D1', roughness: 0.4 });
    this.sharedCardBottomMat = new THREE.MeshStandardMaterial({
      map: getPlayingCardBackTexture({ highlighted: false }),
      roughness: 0.4
    });
    this.sharedPlaqueEdgeMat = new THREE.MeshStandardMaterial({ color: '#3E2818', roughness: 0.45 });
    this.sharedEmptySlotMat = new THREE.MeshBasicMaterial({
      color: '#F5C842',
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide
    });
    this.sharedBodyHumanMat = new THREE.MeshStandardMaterial({ color: '#7D3028', roughness: 0.7 });
    this.sharedBodyBotMat = new THREE.MeshStandardMaterial({ color: '#365878', roughness: 0.7 });
    this.sharedTurnRingMat = new THREE.MeshBasicMaterial({ color: '#F5C842', side: THREE.DoubleSide });

    this.chipMats = ['#C42828', '#1F56B0', '#E5B842', '#1C1B1A'].map((col) => {
      const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.36, metalness: 0.14 });
      this.disposableMats.push(m);
      return m;
    });

    this.disposableMats.push(
      walnutMat,
      darkWalnutMat,
      leatherMat,
      feltGreenMat,
      pokerFeltMat,
      brassMat,
      globeMat,
      traySilverMat,
      saucerMat,
      teaMat,
      this.sharedCardEdgeMat,
      this.sharedCardBottomMat,
      this.sharedPlaqueEdgeMat,
      this.sharedEmptySlotMat,
      this.sharedBodyHumanMat,
      this.sharedBodyBotMat,
      this.sharedTurnRingMat
    );

    this.sharedCardGeo = new THREE.BoxGeometry(0.92, 0.025, 1.32);
    this.sharedDeckGeo = new THREE.BoxGeometry(0.92, 0.26, 1.32);
    this.sharedPlaqueGeo = new THREE.BoxGeometry(1, 0.075, 1);
    this.sharedChipGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.048, 16);
    this.sharedSlotRingGeo = new THREE.RingGeometry(0.55, 0.65, 24);
    this.sharedBadgeGeo = new THREE.CircleGeometry(0.52, 16);
    this.sharedRearBadgeGeo = new THREE.CircleGeometry(0.48, 16);
    const turnRingGeo = new THREE.RingGeometry(1.18, 1.36, 24);
    this.disposableGeoms.push(
      this.sharedCardGeo,
      this.sharedDeckGeo,
      this.sharedPlaqueGeo,
      this.sharedChipGeo,
      this.sharedSlotRingGeo,
      this.sharedBadgeGeo,
      this.sharedRearBadgeGeo,
      turnRingGeo
    );

    for (const def of SIDE_TABLE_DEFS) {
      const group = new THREE.Group();
      group.position.set(def.x, 0, def.z);
      group.rotation.y = def.rotY || 0;

      // Enlarged table geometry matching central Okey table proportions
      if (def.shape === 'oval') {
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(6.0, 6.18, 0.34, 36), darkWalnutMat);
        rim.scale.set(1.18, 1, 0.88);
        rim.position.y = -0.17;
        rim.castShadow = true;
        rim.receiveShadow = true;
        group.add(rim);

        const felt = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.07, 36), pokerFeltMat);
        felt.scale.set(1.18, 1, 0.88);
        felt.position.y = -0.01;
        felt.receiveShadow = true;
        group.add(felt);
        this.disposableGeoms.push(rim.geometry, felt.geometry);
      } else if (def.shape === 'round') {
        const top = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.3, 32), walnutMat);
        top.position.y = -0.16;
        top.castShadow = true;
        top.receiveShadow = true;
        group.add(top);

        const felt = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 0.06, 32), feltGreenMat);
        felt.position.y = -0.01;
        felt.receiveShadow = true;
        group.add(felt);
        this.disposableGeoms.push(top.geometry, felt.geometry);
      } else {
        const top = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.3, 10.2), walnutMat);
        top.position.y = -0.16;
        top.castShadow = true;
        top.receiveShadow = true;
        group.add(top);

        const felt = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.06, 8.8), feltGreenMat);
        felt.position.y = -0.01;
        felt.receiveShadow = true;
        group.add(felt);
        this.disposableGeoms.push(top.geometry, felt.geometry);
      }

      // Pedestal + grounded base foot (flush with floor y = -2.35)
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.96, 2.2, 16), darkWalnutMat);
      col.position.y = -1.25;
      col.castShadow = true;
      group.add(col);
      const baseFoot = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.45, 0.22, 16), darkWalnutMat);
      baseFoot.position.y = -2.24;
      baseFoot.receiveShadow = true;
      group.add(baseFoot);
      this.disposableGeoms.push(col.geometry, baseFoot.geometry);

      // Decorative corner props for chat/tavla tables (kept out of the center for card tables)
      if (def.props === 'tavla') {
        const board = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 2.3), darkWalnutMat);
        board.position.set(0, 0.09, 0);
        board.rotation.y = 0.18;
        group.add(board);
        this.disposableGeoms.push(board.geometry);
      }

      if (def.props === 'tea' || def.props === 'tavla') {
        const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.85, 0.05, 18), traySilverMat);
        tray.position.set(2.2, 0.04, -1.8);
        group.add(tray);
        this.disposableGeoms.push(tray.geometry);
        for (const [gx, gz] of [
          [1.9, -1.6],
          [2.45, -2.0],
          [-2.3, 2.0]
        ]) {
          const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.04, 12), saucerMat);
          saucer.position.set(gx, 0.04, gz);
          group.add(saucer);
          const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.34, 10), teaMat);
          tea.position.set(gx, 0.22, gz);
          group.add(tea);
          this.disposableGeoms.push(saucer.geometry, tea.geometry);
        }
      }

      // 4 Chairs at enlarged radius
      for (const off of SEAT_OFFSETS) {
        const ch = this.buildChair(darkWalnutMat, leatherMat);
        ch.position.set(off.x, 0, off.z);
        ch.rotation.y = off.rotY;
        group.add(ch);
      }

      // Hanging pendant lamp above table (up to ceiling y=16.0)
      const lampY = 10.2;
      const chainH = 16.0 - lampY;
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, chainH, 6), brassMat);
      chain.position.set(0, lampY + chainH / 2, 0);
      group.add(chain);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.56, 14), brassMat);
      cap.position.set(0, lampY + 0.28, 0);
      group.add(cap);
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.56, 12, 10), globeMat);
      globe.position.set(0, lampY - 0.18, 0);
      group.add(globe);
      this.disposableGeoms.push(chain.geometry, cap.geometry, globe.geometry);

      // Floating table title sign
      const signTex = createTableSignTexture(def.title, def.subtitle, '0/4 Kişi · [E] Otur', false);
      const signMat = new THREE.SpriteMaterial({ map: signTex, transparent: true, depthWrite: false });
      const signSprite = new THREE.Sprite(signMat);
      signSprite.position.set(0, 5.2, 0);
      signSprite.scale.set(6.8, 1.96, 1);
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
        nameplateMats: []
      });
    }
  }

  renderChipStack(parent, x, y, z, chipCount, colorOffset = 0) {
    const layers = Math.max(1, Math.min(10, chipCount));
    for (let h = 0; h < layers; h += 1) {
      const mat = this.chipMats[(colorOffset + h) % this.chipMats.length];
      const chip = new THREE.Mesh(this.sharedChipGeo, mat);
      chip.position.set(x, y + h * 0.048, z);
      chip.castShadow = true;
      parent.add(chip);
    }
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

    for (const t of list) {
      const entry = this.tableEntries.get(t.id);
      if (!entry) continue;

      while (entry.dynamicGroup.children.length > 0) {
        entry.dynamicGroup.remove(entry.dynamicGroup.children[0]);
      }
      for (const m of entry.nameplateMats) {
        m.map?.dispose();
        m.dispose();
      }
      entry.nameplateMats = [];

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

      // Viewer-aligned coordinate frame centered at (0,0,0) on table top
      const viewerFrame = new THREE.Group();
      viewerFrame.rotation.y = localSeatOff.rotY + Math.PI;
      entry.dynamicGroup.add(viewerFrame);

      // Setup / GameOver 3D Plaques right on the felt when not playing
      if (t.kind !== 'chat' && t.phase !== 'playing') {
        const hasPlayers = activeSeats.length > 0;
        if (t.winnerText) {
          const winPlaque = this.createPlaqueMesh(
            'EL SONUCU',
            String(t.winnerText).slice(0, 22),
            { tone: 'dark', w: 4.4, h: 1.1 }
          );
          winPlaque.position.set(0, 0.08, -1.6);
          winPlaque.rotation.x = 0.25;
          viewerFrame.add(winPlaque);
        }

        if (hasPlayers) {
          const startLabel = t.phase === 'gameOver' ? 'YENİ EL' : 'BAŞLAT';
          const startPlaque = this.createPlaqueMesh(startLabel, '3D Masayı Aç', {
            tone: 'emerald',
            highlighted: true,
            w: 2.35,
            h: 0.92
          });
          startPlaque.position.set(-1.35, 0.12, 0.45);
          startPlaque.rotation.x = 0.34;
          startPlaque.userData = {
            kind: 'sideSetup',
            tableId: t.id,
            command: 'start',
            label: startLabel
          };
          viewerFrame.add(startPlaque);
          this.interactables.push(startPlaque);
        }

        if (t.seats?.some((s) => s.type !== 'human')) {
          const hasBot = t.seats.some((s) => s.type === 'bot');
          const botLabel = hasBot ? 'BOTU ÇIKAR' : 'BOT EKLE';
          const botPlaque = this.createPlaqueMesh(botLabel, 'Koltuk Ayarı', {
            tone: 'gold',
            w: 2.35,
            h: 0.92
          });
          botPlaque.position.set(hasPlayers ? 1.35 : 0, 0.12, 0.45);
          botPlaque.rotation.x = 0.34;
          botPlaque.userData = {
            kind: 'sideSetup',
            tableId: t.id,
            command: 'toggleBot',
            label: botLabel
          };
          viewerFrame.add(botPlaque);
          this.interactables.push(botPlaque);
        }
      }

      // Playing Center Visuals & 3D Felt Controls
      if (t.phase === 'playing' && t.kind !== 'chat') {
        if (t.kind === 'pisti') {
          // Deck stack on left of center
          const deckPos = new THREE.Vector3(-1.55, 0.14, -0.35);
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
            const hScale = Math.max(0.2, Math.min(1.0, (t.deckCount || 0) / 40));
            deckMesh.scale.set(1.08, hScale, 1.08);
            deckMesh.position.set(deckPos.x, 0.02 + 0.13 * hScale, deckPos.z);
            deckMesh.castShadow = true;
            viewerFrame.add(deckMesh);
          }
          const deckTag = this.createPlaqueMesh(`DESTE: ${t.deckCount ?? 0}`, `ORTA: ${t.centerCount ?? 0}`, {
            tone: 'dark',
            w: 2.0,
            h: 0.68
          });
          deckTag.position.set(-1.55, 0.08, 0.85);
          deckTag.rotation.x = 0.25;
          viewerFrame.add(deckTag);

          // Center pile top card
          if (t.centerTopCard) {
            if ((t.centerCount || 0) > 1) {
              const under = this.createPlayingCardMesh(t.centerTopCard, { faceUp: false, scale: 1.18 });
              under.position.set(0.62, 0.045, -0.32);
              under.rotation.y = 0.16;
              viewerFrame.add(under);
            }
            const topMesh = this.createPlayingCardMesh(t.centerTopCard, { faceUp: true, scale: 1.22 });
            topMesh.position.set(0.65, 0.085, -0.35);
            topMesh.rotation.y = -0.06;
            viewerFrame.add(topMesh);
          } else {
            const emptyPlaque = this.createPlaqueMesh('ORTA BOŞ', 'Kart At', {
              tone: 'dark',
              w: 1.65,
              h: 0.72
            });
            emptyPlaque.position.set(0.65, 0.06, -0.35);
            viewerFrame.add(emptyPlaque);
          }
        } else if (t.kind === 'poker') {
          // Pot & Bet plaque + 3D chips
          const potPlaque = this.createPlaqueMesh(
            `POT: ${t.pot ?? 0}`,
            `BAHİS: ${t.currentBet ?? 0}`,
            { tone: 'gold', highlighted: (t.pot || 0) > 0, w: 2.7, h: 0.86 }
          );
          potPlaque.position.set(-0.35, 0.08, -2.05);
          potPlaque.rotation.x = 0.24;
          viewerFrame.add(potPlaque);

          const potStacks = Math.min(3, Math.ceil((t.pot || 0) / 80));
          for (let cs = 0; cs < potStacks; cs += 1) {
            this.renderChipStack(viewerFrame, 1.55 + cs * 0.44, 0.05, -2.0 + (cs % 2) * 0.25, 4 + cs, cs);
          }

          // 5 Community card slots
          const comm = Array.isArray(t.communityCards) ? t.communityCards : [];
          for (let ci = 0; ci < 5; ci += 1) {
            const cx = (ci - 2) * 1.24;
            const cz = -0.45;
            if (comm[ci]) {
              const cardMesh = this.createPlayingCardMesh(comm[ci], { faceUp: true, scale: 1.12 });
              cardMesh.position.set(cx, 0.06, cz);
              viewerFrame.add(cardMesh);
            } else {
              const slotRing = new THREE.Mesh(this.sharedSlotRingGeo, this.sharedEmptySlotMat);
              slotRing.rotation.x = -Math.PI / 2;
              slotRing.position.set(cx, 0.035, cz);
              viewerFrame.add(slotRing);
            }
          }

          // Interactive Poker 3D Action Plaques for seated active player
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

            const spacing = 1.65;
            actions.forEach((act, aIdx) => {
              const ax = (aIdx - (actions.length - 1) / 2) * spacing;
              const plaque = this.createPlaqueMesh(act.title, act.sub, {
                tone: act.tone,
                highlighted: true,
                w: 1.48,
                h: 0.68
              });
              plaque.position.set(ax, 0.28, 2.05);
              plaque.rotation.x = 0.56;
              plaque.userData = {
                kind: 'sideAction',
                tableId: t.id,
                action: act.action,
                payload: act.payload,
                label: act.title
              };
              viewerFrame.add(plaque);
              this.interactables.push(plaque);
            });
          }
        } else if (t.kind === 'batak') {
          const trumpPlaque = this.createPlaqueMesh('KOZ: ♠ MAÇA', `EL ${t.roundNumber || 1}`, {
            tone: 'dark',
            w: 2.2,
            h: 0.72
          });
          trumpPlaque.position.set(0, 0.08, -2.55);
          trumpPlaque.rotation.x = 0.24;
          viewerFrame.add(trumpPlaque);

          // 4-seat center trick cards aligned to each player's seat
          const trickList = Array.isArray(t.trickCards) ? t.trickCards : [];
          trickList.forEach((entryItem, idx) => {
            const seatOff = SEAT_OFFSETS[entryItem.seatIndex] || SEAT_OFFSETS[0];
            const cardFrame = new THREE.Group();
            cardFrame.rotation.y = seatOff.rotY + Math.PI;
            const cMesh = this.createPlayingCardMesh(entryItem.card, { faceUp: true, scale: 1.08 });
            cMesh.position.set(0, 0.05 + idx * 0.008, 1.35);
            cardFrame.add(cMesh);
            entry.dynamicGroup.add(cardFrame);
          });

          // 3D Bid Grid (1..13) on felt when bidding
          if (isMyTable && t.isMyTurn && t.batakSubPhase === 'bidding') {
            const bidHead = this.createPlaqueMesh('İHALE SEÇ', '1 - 13 El Tahmini', {
              tone: 'gold',
              highlighted: true,
              w: 2.6,
              h: 0.62
            });
            bidHead.position.set(0, 0.16, 0.15);
            bidHead.rotation.x = 0.35;
            viewerFrame.add(bidHead);

            for (let bid = 1; bid <= 13; bid += 1) {
              const row = bid <= 7 ? 0 : 1;
              const col = bid <= 7 ? bid - 1 : bid - 8;
              const colsInRow = row === 0 ? 7 : 6;
              const bx = (col - (colsInRow - 1) / 2) * 0.86;
              const bz = row === 0 ? 1.05 : 1.82;
              const bidPlaque = this.createPlaqueMesh(String(bid), '', {
                tone: 'gold',
                highlighted: true,
                w: 0.76,
                h: 0.58
              });
              bidPlaque.position.set(bx, 0.24 + row * 0.06, bz);
              bidPlaque.rotation.x = 0.54;
              bidPlaque.userData = {
                kind: 'sideAction',
                tableId: t.id,
                action: 'bid',
                payload: { bid },
                label: `İhale ${bid}`
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
            w: 3.6,
            h: 0.86
          });
          pkPlaque.position.set(0, 0.08, 0.0);
          pkPlaque.rotation.x = 0.24;
          viewerFrame.add(pkPlaque);
        }
      }

      // Seated Player 3D Hand + Opponent Hands + Busts + Nameplates + Chip Stacks
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

        // Per-seat Poker chips & bet tag
        if (t.kind === 'poker' && t.phase === 'playing') {
          if (!s.folded && (s.chips || 0) > 0) {
            this.renderChipStack(seatFrame, 1.5, 0.05, 3.6, Math.ceil((s.chips || 0) / 150), s.seatIndex);
          }
          if ((s.bet || 0) > 0 || s.folded) {
            const betPlaque = this.createPlaqueMesh(
              s.folded ? 'ÇEKİLDİ' : `BAHİS: ${s.bet}`,
              `${s.chips ?? 0} Çip`,
              { tone: s.folded ? 'red' : 'dark', w: 1.5, h: 0.55 }
            );
            betPlaque.position.set(-1.35, 0.08, 3.1);
            betPlaque.rotation.x = 0.24;
            seatFrame.add(betPlaque);
          }
        }

        // Seat cards
        if (isLocalViewerSeat) {
          const myHand = Array.isArray(t.myHand) ? t.myHand : [];
          const n = myHand.length;
          if (n > 0) {
            const maxSpan = n <= 4 ? 3.8 : 6.4;
            const step = n > 1 ? Math.min(1.08, maxSpan / (n - 1)) : 0;
            myHand.forEach((card, cIdx) => {
              const offset = cIdx - (n - 1) / 2;
              const isLegal = !canPlayHandCard || legalSet.has(card.id);
              const cardMesh = this.createPlayingCardMesh(card, {
                faceUp: true,
                legal: isLegal,
                dimmed: canPlayHandCard && !isLegal,
                scale: n <= 4 ? 1.08 : 0.96
              });
              cardMesh.rotation.order = 'YXZ';
              cardMesh.position.set(
                offset * step,
                0.76 + cIdx * 0.004 + (canPlayHandCard && isLegal ? 0.12 : 0),
                3.92 + Math.abs(offset) * 0.032
              );
              cardMesh.rotation.x = 0.72;
              cardMesh.rotation.y = -offset * 0.03;

              if (canPlayHandCard && isLegal) {
                cardMesh.userData = {
                  kind: 'sideAction',
                  tableId: t.id,
                  action: 'playCard',
                  payload: { cardId: card.id },
                  label: card.label
                };
                this.interactables.push(cardMesh);
              }
              seatFrame.add(cardMesh);
            });
          }
        } else if (t.kind === 'poker' && t.phase === 'gameOver' && Array.isArray(s.revealedHand) && s.revealedHand.length > 0) {
          s.revealedHand.forEach((card, rIdx) => {
            const cMesh = this.createPlayingCardMesh(card, { faceUp: true, scale: 0.95 });
            cMesh.position.set((rIdx - 0.5) * 1.02, 0.06, 3.6);
            seatFrame.add(cMesh);
          });
        } else if (t.phase === 'playing' && (s.handCount || 0) > 0 && !s.folded) {
          const isDrawTarget =
            isMyTable &&
            t.kind === 'papazkacti' &&
            t.isMyTurn &&
            t.drawTargetSeatIndex === s.seatIndex;
          const cardCount = Math.min(13, s.handCount || 0);
          const span = isDrawTarget ? Math.min(5.8, cardCount * 0.68) : Math.min(3.8, cardCount * 0.34);
          const step = cardCount > 1 ? span / (cardCount - 1) : 0;

          for (let c = 0; c < cardCount; c += 1) {
            const offset = c - (cardCount - 1) / 2;
            const cMesh = this.createPlayingCardMesh(null, {
              faceUp: false,
              highlighted: isDrawTarget,
              scale: isDrawTarget ? 1.02 : 0.85
            });
            cMesh.rotation.order = 'YXZ';
            cMesh.position.set(
              offset * step,
              isDrawTarget ? 0.88 : 0.58 + c * 0.003,
              isDrawTarget ? 3.55 : 4.05 + Math.abs(offset) * 0.02
            );
            // Tilt opponent cards slightly toward center when Papaz Kacti target so backs face active player cleanly
            cMesh.rotation.x = isDrawTarget ? -0.45 : -0.62;
            cMesh.rotation.y = offset * 0.025;

            if (isDrawTarget) {
              cMesh.userData = {
                kind: 'sideAction',
                tableId: t.id,
                action: 'drawCard',
                payload: { pickIndex: c },
                label: `${s.name} · ${c + 1}. Kart`
              };
              this.interactables.push(cMesh);
            }
            seatFrame.add(cMesh);
          }
        }

        // Skip rendering the seated local player's own 3D bust so FP camera never clips inside their head
        if (isLocalViewerSeat) continue;

        const pGroup = new THREE.Group();
        pGroup.position.set(off.x, -0.35, off.z);
        pGroup.rotation.y = off.rotY;

        const isActive = t.phase === 'playing' && t.currentSeat === s.seatIndex;
        const bodyMat = s.type === 'bot' ? this.sharedBodyBotMat : this.sharedBodyHumanMat;

        if (this.bustGeom) {
          const bust = new THREE.Mesh(this.bustGeom, bodyMat);
          bust.scale.setScalar(1.0);
          bust.castShadow = true;
          pGroup.add(bust);
        }

        const avKey = `side-tbl-${s.avatar || 'avatar-1'}`;
        let avMat = this.avatarMatCache.get(avKey);
        if (!avMat) {
          avMat = new THREE.MeshBasicMaterial({ map: getAvatarTexture(s.avatar || 'avatar-1', s.name || 'O') });
          this.avatarMatCache.set(avKey, avMat);
        }
        const badge = new THREE.Mesh(this.sharedBadgeGeo, avMat);
        badge.position.set(0, 1.72, 0.38);
        pGroup.add(badge);

        const rear = new THREE.Mesh(this.sharedRearBadgeGeo, avMat);
        rear.position.set(0, 1.72, -0.36);
        rear.rotation.y = Math.PI;
        pGroup.add(rear);

        if (isActive) {
          const ring = new THREE.Mesh(entry.turnRingGeo, this.sharedTurnRingMat);
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = 0.08;
          pGroup.add(ring);
        }

        const npMat = new THREE.SpriteMaterial({
          map: createNameplateTexture(s.name || 'Oyuncu', { isActive, isBot: s.type === 'bot' }),
          transparent: true,
          depthWrite: false
        });
        entry.nameplateMats.push(npMat);
        const np = new THREE.Sprite(npMat);
        np.position.set(0, 2.85, 0);
        np.scale.set(3.2, 0.8, 1);
        pGroup.add(np);

        entry.dynamicGroup.add(pGroup);
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
    let fov = 62;

    if (preset === 'top') {
      localPos = new THREE.Vector3(0, 15.2, 0.9);
      localTarget = new THREE.Vector3(0, 0.05, 0);
      fov = 48;
    } else if (preset === 'table') {
      localPos = new THREE.Vector3(0, 6.2, 10.8);
      localTarget = new THREE.Vector3(0, 0.25, 0);
      fov = 52;
    } else {
      // 'fp' First-Person seated view looking down at 3D cards & felt controls
      localPos = new THREE.Vector3(0, 2.95, 6.25);
      localTarget = new THREE.Vector3(0, 0.38, -0.6);
      fov = 62;
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
  }
}
