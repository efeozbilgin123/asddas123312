import * as THREE from 'three';
import { SIDE_TABLE_DEFS } from '../../shared/sideGames.js';
import { createNameplateTexture, getAvatarTexture, getFeltTexture, getWoodTexture } from './textures.js';

const SEAT_OFFSETS = [
  { x: 0, z: 2.85, rotY: Math.PI },
  { x: 2.85, z: 0, rotY: -Math.PI / 2 },
  { x: 0, z: -2.85, rotY: 0 },
  { x: -2.85, z: 0, rotY: Math.PI / 2 }
];

function createTableSignTexture(title, subtitle, statusLabel, isPlaying = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 148;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(20, 12, 8, 0.9)';
  ctx.strokeStyle = isPlaying ? '#F5C842' : '#B98C46';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 132, 22);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 34px "Inter", system-ui, sans-serif';
  ctx.fillStyle = '#FFF5E0';
  ctx.fillText(String(title || '').slice(0, 24), 256, 44);

  ctx.font = '600 22px "Inter", system-ui, sans-serif';
  ctx.fillStyle = '#D7BC8D';
  ctx.fillText(String(subtitle || '').slice(0, 32), 256, 82);

  ctx.font = 'bold 21px "Inter", system-ui, sans-serif';
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
    this.tableEntries = new Map();
    this.lastStateSig = '';

    this.buildAllTables();
  }

  buildChair(woodMat, leatherMat) {
    const chair = new THREE.Group();
    const legGeo = new THREE.CylinderGeometry(0.075, 0.055, 1.74, 8);
    this.disposableGeoms.push(legGeo);
    for (const [lx, ly, lz] of [
      [-0.7, -1.48, -0.66],
      [0.7, -1.48, -0.66],
      [-0.7, -1.48, 0.66],
      [0.7, -1.48, 0.66]
    ]) {
      const leg = new THREE.Mesh(legGeo, woodMat);
      leg.position.set(lx, ly, lz);
      leg.castShadow = true;
      chair.add(leg);
    }

    const frameGeo = new THREE.BoxGeometry(1.62, 0.14, 1.52);
    const cushGeo = new THREE.BoxGeometry(1.48, 0.14, 1.4);
    const postGeo = new THREE.CylinderGeometry(0.068, 0.072, 2.22, 8);
    const slatGeo = new THREE.BoxGeometry(0.14, 1.38, 0.07);
    const crestGeo = new THREE.BoxGeometry(1.64, 0.24, 0.14);
    this.disposableGeoms.push(frameGeo, cushGeo, postGeo, slatGeo, crestGeo);

    const frame = new THREE.Mesh(frameGeo, woodMat);
    frame.position.set(0, -0.58, 0);
    chair.add(frame);

    const cushion = new THREE.Mesh(cushGeo, leatherMat);
    cushion.position.set(0, -0.46, 0.02);
    chair.add(cushion);

    for (const sx of [-0.72, 0.72]) {
      const post = new THREE.Mesh(postGeo, woodMat);
      post.position.set(sx, 0.54, -0.7);
      post.rotation.x = -0.06;
      chair.add(post);
    }
    for (const sx of [-0.44, 0, 0.44]) {
      const slat = new THREE.Mesh(slatGeo, woodMat);
      slat.position.set(sx, 0.7, -0.71);
      slat.rotation.x = -0.06;
      chair.add(slat);
    }
    const crest = new THREE.Mesh(crestGeo, woodMat);
    crest.position.set(0, 1.54, -0.76);
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
    const cardBackMat = new THREE.MeshStandardMaterial({ color: '#8C1D24', roughness: 0.42 });
    const cardFaceMat = new THREE.MeshStandardMaterial({ color: '#FAF5EA', roughness: 0.36 });
    const traySilverMat = new THREE.MeshStandardMaterial({ color: '#CBD2D6', roughness: 0.26, metalness: 0.75 });
    const saucerMat = new THREE.MeshStandardMaterial({ color: '#F0EAE0', roughness: 0.35 });
    const teaMat = new THREE.MeshStandardMaterial({ color: '#8E250B', roughness: 0.2 });

    this.disposableMats.push(
      walnutMat,
      darkWalnutMat,
      leatherMat,
      feltGreenMat,
      pokerFeltMat,
      brassMat,
      globeMat,
      cardBackMat,
      cardFaceMat,
      traySilverMat,
      saucerMat,
      teaMat
    );

    const turnRingGeo = new THREE.RingGeometry(1.06, 1.2, 24);
    this.disposableGeoms.push(turnRingGeo);

    for (const def of SIDE_TABLE_DEFS) {
      const group = new THREE.Group();
      group.position.set(def.x, 0, def.z);
      group.rotation.y = def.rotY || 0;

      // Table geometry by shape
      if (def.shape === 'oval') {
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(2.85, 2.95, 0.26, 28), darkWalnutMat);
        rim.scale.set(1.22, 1, 0.92);
        rim.position.y = -0.14;
        rim.castShadow = true;
        rim.receiveShadow = true;
        group.add(rim);

        const felt = new THREE.Mesh(new THREE.CylinderGeometry(2.38, 2.38, 0.06, 28), pokerFeltMat);
        felt.scale.set(1.22, 1, 0.92);
        felt.position.y = -0.01;
        felt.receiveShadow = true;
        group.add(felt);
        this.disposableGeoms.push(rim.geometry, felt.geometry);
      } else if (def.shape === 'round') {
        const top = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.35, 0.24, 24), walnutMat);
        top.position.y = -0.14;
        top.castShadow = true;
        top.receiveShadow = true;
        group.add(top);

        const felt = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.04, 24), feltGreenMat);
        felt.position.y = -0.01;
        felt.receiveShadow = true;
        group.add(felt);
        this.disposableGeoms.push(top.geometry, felt.geometry);
      } else {
        const top = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.24, 4.5), walnutMat);
        top.position.y = -0.14;
        top.castShadow = true;
        top.receiveShadow = true;
        group.add(top);

        const felt = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.04, 3.7), feltGreenMat);
        felt.position.y = -0.01;
        felt.receiveShadow = true;
        group.add(felt);
        this.disposableGeoms.push(top.geometry, felt.geometry);
      }

      // Pedestal + grounded base foot (flush with floor y = -2.35)
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.54, 2.2, 12), darkWalnutMat);
      col.position.y = -1.25;
      col.castShadow = true;
      group.add(col);
      const baseFoot = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.38, 0.16, 12), darkWalnutMat);
      baseFoot.position.y = -2.27;
      baseFoot.receiveShadow = true;
      group.add(baseFoot);
      this.disposableGeoms.push(col.geometry, baseFoot.geometry);

      // Table-specific props
      if (def.props === 'chips') {
        const chipColors = ['#B82A2A', '#1E4E9C', '#E6B945', '#1C1B1A'];
        const chipGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.032, 12);
        this.disposableGeoms.push(chipGeo);
        chipColors.forEach((colHex, cIdx) => {
          const mat = new THREE.MeshStandardMaterial({ color: colHex, roughness: 0.38 });
          this.disposableMats.push(mat);
          for (let h = 0; h < 4; h += 1) {
            const chip = new THREE.Mesh(chipGeo, mat);
            chip.position.set(-0.75 + cIdx * 0.26, 0.036 + h * 0.032, -0.65 + (cIdx % 2) * 0.2);
            group.add(chip);
          }
        });
        const deck = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.5), cardBackMat);
        deck.position.set(0.65, 0.08, -0.35);
        group.add(deck);
        this.disposableGeoms.push(deck.geometry);
      } else if (def.props === 'cards') {
        const deck = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.5), cardBackMat);
        deck.position.set(-0.45, 0.09, -0.2);
        deck.rotation.y = 0.2;
        group.add(deck);
        const topCard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.5), cardFaceMat);
        topCard.position.set(0.15, 0.02, 0.1);
        topCard.rotation.y = -0.3;
        group.add(topCard);
        this.disposableGeoms.push(deck.geometry, topCard.geometry);
      } else if (def.props === 'tavla') {
        const board = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.12, 1.2), darkWalnutMat);
        board.position.set(0, 0.06, 0);
        board.rotation.y = 0.22;
        group.add(board);
        this.disposableGeoms.push(board.geometry);
      }

      if (def.props === 'tea' || def.props === 'tavla') {
        const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.55, 0.04, 16), traySilverMat);
        tray.position.set(0.85, 0.04, -0.65);
        group.add(tray);
        this.disposableGeoms.push(tray.geometry);
        for (const [gx, gz] of [
          [0.7, -0.55],
          [1.02, -0.78],
          [-1.3, 1.1]
        ]) {
          const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.03, 10), saucerMat);
          saucer.position.set(gx, 0.04, gz);
          group.add(saucer);
          const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.24, 8), teaMat);
          tea.position.set(gx, 0.17, gz);
          group.add(tea);
          this.disposableGeoms.push(saucer.geometry, tea.geometry);
        }
      }

      // 4 Chairs
      for (const off of SEAT_OFFSETS) {
        const ch = this.buildChair(darkWalnutMat, leatherMat);
        ch.position.set(off.x, 0, off.z);
        ch.rotation.y = off.rotY;
        group.add(ch);
      }

      // Hanging pendant lamp above table (up to ceiling y=16.0)
      const lampY = 9.4;
      const chainH = 16.0 - lampY;
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, chainH, 6), brassMat);
      chain.position.set(0, lampY + chainH / 2, 0);
      group.add(chain);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.42, 12), brassMat);
      cap.position.set(0, lampY + 0.24, 0);
      group.add(cap);
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), globeMat);
      globe.position.set(0, lampY - 0.16, 0);
      group.add(globe);
      this.disposableGeoms.push(chain.geometry, cap.geometry, globe.geometry);

      // Floating table title sign
      const signTex = createTableSignTexture(def.title, def.subtitle, '0/4 Kişi · [E] Otur', false);
      const signMat = new THREE.SpriteMaterial({ map: signTex, transparent: true, depthWrite: false });
      const signSprite = new THREE.Sprite(signMat);
      signSprite.position.set(0, 4.35, 0);
      signSprite.scale.set(5.4, 1.56, 1);
      group.add(signSprite);

      // Dynamic group for seated players + felt cards
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

    this.sharedCardGeo = new THREE.BoxGeometry(0.38, 0.02, 0.54);
    this.sharedBadgeGeo = new THREE.CircleGeometry(0.45, 16);
    this.sharedRearBadgeGeo = new THREE.CircleGeometry(0.42, 16);
    this.sharedCardMat = new THREE.MeshStandardMaterial({ color: '#F9F3E6', roughness: 0.35 });
    this.sharedBodyHumanMat = new THREE.MeshStandardMaterial({ color: '#7D3028', roughness: 0.7 });
    this.sharedBodyBotMat = new THREE.MeshStandardMaterial({ color: '#365878', roughness: 0.7 });
    this.sharedTurnRingMat = new THREE.MeshBasicMaterial({ color: '#F5C842', side: THREE.DoubleSide });
    this.disposableGeoms.push(this.sharedCardGeo, this.sharedBadgeGeo, this.sharedRearBadgeGeo);
    this.disposableMats.push(
      this.sharedCardMat,
      this.sharedBodyHumanMat,
      this.sharedBodyBotMat,
      this.sharedTurnRingMat
    );
  }

  updateStates(sideTables = []) {
    const list = Array.isArray(sideTables) ? sideTables : [];
    const sig = JSON.stringify(
      list.map((t) => ({
        id: t.id,
        p: t.phase,
        cs: t.currentSeat,
        cc: t.centerCount,
        com: t.communityCards?.length || 0,
        tc: t.trickCards?.length || 0,
        s: (t.seats || []).map((st) => [st.type, st.name, st.avatar])
      }))
    );
    if (sig === this.lastStateSig) return;
    this.lastStateSig = sig;

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

      // Render dynamic cards in center if playing
      if (t.phase === 'playing' && t.kind !== 'chat') {
        const cardCount = t.kind === 'poker'
          ? (t.communityCards?.length || 0)
          : t.kind === 'batak'
            ? (t.trickCards?.length || 0)
            : Math.min(4, t.centerCount || 0);
        for (let i = 0; i < cardCount; i += 1) {
          const cardMesh = new THREE.Mesh(this.sharedCardGeo, this.sharedCardMat);
          cardMesh.position.set((i - (cardCount - 1) / 2) * 0.44, 0.03 + i * 0.004, 0.12);
          cardMesh.rotation.y = (i - 1.5) * 0.08;
          entry.dynamicGroup.add(cardMesh);
        }
      }

      // Render seated busts + nameplates
      for (const s of t.seats || []) {
        if (!s || s.type === 'empty') continue;
        const off = SEAT_OFFSETS[s.seatIndex];
        if (!off) continue;

        const pGroup = new THREE.Group();
        pGroup.position.set(off.x, -0.35, off.z);
        pGroup.rotation.y = off.rotY;

        const isActive = t.phase === 'playing' && t.currentSeat === s.seatIndex;
        const bodyMat = s.type === 'bot' ? this.sharedBodyBotMat : this.sharedBodyHumanMat;

        if (this.bustGeom) {
          const bust = new THREE.Mesh(this.bustGeom, bodyMat);
          bust.scale.setScalar(0.86);
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
        badge.position.set(0, 1.48, 0.33);
        pGroup.add(badge);

        const rear = new THREE.Mesh(this.sharedRearBadgeGeo, avMat);
        rear.position.set(0, 1.48, -0.31);
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
        np.position.set(0, 2.55, 0);
        np.scale.set(2.9, 0.72, 1);
        pGroup.add(np);

        entry.dynamicGroup.add(pGroup);
      }
    }
  }

  getSeatCameraPose(tableId, seatIndex = 0) {
    const def = SIDE_TABLE_DEFS.find((d) => d.id === tableId) || SIDE_TABLE_DEFS[0];
    const sIdx = [0, 1, 2, 3].includes(Number(seatIndex)) ? Number(seatIndex) : 0;
    const off = SEAT_OFFSETS[sIdx];
    const rotY = def.rotY || 0;

    // Seat world position slightly behind chair looking across the felt
    const localPos = new THREE.Vector3(off.x * 1.38, 3.65, off.z * 1.38);
    localPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    localPos.add(new THREE.Vector3(def.x, 0, def.z));

    const target = new THREE.Vector3(def.x, 0.15, def.z);
    return { pos: localPos, target, fov: 54 };
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
    for (const g of this.disposableGeoms) g?.dispose();
    for (const m of this.disposableMats) m?.dispose();
    this.disposableGeoms = [];
    this.disposableMats = [];
  }
}
