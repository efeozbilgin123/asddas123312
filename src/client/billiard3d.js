import * as THREE from 'three';
import { BILLIARD_POCKETS, BILLIARD_TABLE } from '../../shared/billiardSession.js';
import { soundFX } from './sound.js';
import { createNameplateTexture, getAvatarTexture, getBilliardBallTexture, getWoodTexture } from './textures.js';

export const BILLIARD_WORLD_POS = new THREE.Vector3(16.5, 0, -2.2);

export class BilliardTable3D {
  constructor(parentScene, shared = {}) {
    this.root = new THREE.Group();
    this.root.position.copy(BILLIARD_WORLD_POS);
    parentScene.add(this.root);

    this.bustGeom = shared.bustGeom || null;
    this.avatarMatCache = shared.avatarMatCache || new Map();

    this.feltHitMesh = null;
    this.ballMeshes = new Map();
    this.ballMats = [];
    this.nameplateMats = [];
    this.disposableGeoms = [];
    this.disposableMats = [];

    this.seatGroup = new THREE.Group();
    this.root.add(this.seatGroup);

    this.cueStickGroup = new THREE.Group();
    this.root.add(this.cueStickGroup);

    this.aimLine = null;
    this.cueRing = null;

    this.currentState = null;
    this.viewerId = null;
    this.activeShotId = 0;
    this.playedEventIndices = new Set();
    this.localAimAngle = -Math.PI / 2;
    this.localAimPower = 0.65;
    this.isAnimatingShot = false;
    this.lastSeatSig = '';
    this.ballPrevPos = new Map();

    this.buildTable();
    this.buildBalls();
    this.buildCueAndGuides();
  }

  buildTable() {
    const { halfW, halfL } = BILLIARD_TABLE;
    const woodTex = getWoodTexture();
    const walnutMat = new THREE.MeshLambertMaterial({ map: woodTex, color: '#5A321D' });
    const darkWalnutMat = new THREE.MeshLambertMaterial({ map: woodTex, color: '#3E2112' });
    const feltMat = new THREE.MeshStandardMaterial({
      color: '#136B44',
      roughness: 0.92,
      metalness: 0.02
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: '#D4AC4B',
      roughness: 0.3,
      metalness: 0.72
    });
    const pocketMat = new THREE.MeshBasicMaterial({ color: '#080707' });
    const ivorySightMat = new THREE.MeshBasicMaterial({ color: '#F3E7C9' });
    const lampShadeMat = new THREE.MeshLambertMaterial({ color: '#145D3A' });
    const lampGlowMat = new THREE.MeshBasicMaterial({ color: '#FFF0C2' });

    this.disposableMats.push(
      walnutMat,
      darkWalnutMat,
      feltMat,
      brassMat,
      pocketMat,
      ivorySightMat,
      lampShadeMat,
      lampGlowMat
    );

    // Apron & Slate Base
    const apronGeo = new THREE.BoxGeometry(halfW * 2 + 0.52, 0.56, halfL * 2 + 0.52);
    const apron = new THREE.Mesh(apronGeo, darkWalnutMat);
    apron.position.y = -0.32;
    apron.castShadow = true;
    apron.receiveShadow = true;
    this.root.add(apron);
    this.disposableGeoms.push(apronGeo);

    // Green Baize Felt Bed (surface at y = 0)
    const feltGeo = new THREE.BoxGeometry(halfW * 2 + 0.06, 0.08, halfL * 2 + 0.06);
    const felt = new THREE.Mesh(feltGeo, feltMat);
    felt.position.y = -0.04;
    felt.receiveShadow = true;
    felt.userData = { kind: 'billiardFelt' };
    this.root.add(felt);
    this.feltHitMesh = felt;
    this.disposableGeoms.push(feltGeo);

    // 4 Cushion Rails
    const railH = 0.22;
    const railW = 0.36;
    const longRailGeo = new THREE.BoxGeometry(railW, railH, halfL * 2 + railW * 2);
    const shortRailGeo = new THREE.BoxGeometry(halfW * 2, railH, railW);
    this.disposableGeoms.push(longRailGeo, shortRailGeo);

    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(longRailGeo, walnutMat);
      rail.position.set(sx * (halfW + railW / 2), 0.06, 0);
      rail.castShadow = true;
      rail.receiveShadow = true;
      this.root.add(rail);
    }
    for (const sz of [-1, 1]) {
      const rail = new THREE.Mesh(shortRailGeo, walnutMat);
      rail.position.set(0, 0.06, sz * (halfL + railW / 2));
      rail.castShadow = true;
      rail.receiveShadow = true;
      this.root.add(rail);
    }

    // Brass Corner Caps
    const cornerGeo = new THREE.BoxGeometry(0.42, 0.24, 0.42);
    this.disposableGeoms.push(cornerGeo);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cap = new THREE.Mesh(cornerGeo, brassMat);
        cap.position.set(sx * (halfW + 0.17), 0.065, sz * (halfL + 0.17));
        this.root.add(cap);
      }
    }

    // Diamond Rail Sights
    const sightGeo = new THREE.BoxGeometry(0.05, 0.02, 0.05);
    this.disposableGeoms.push(sightGeo);
    for (const sx of [-1, 1]) {
      for (const dz of [-2.62, -1.75, -0.88, 0.88, 1.75, 2.62]) {
        const s = new THREE.Mesh(sightGeo, ivorySightMat);
        s.position.set(sx * (halfW + 0.19), 0.175, dz);
        s.rotation.y = Math.PI / 4;
        this.root.add(s);
      }
    }
    for (const sz of [-1, 1]) {
      for (const dx of [-0.88, 0, 0.88]) {
        const s = new THREE.Mesh(sightGeo, ivorySightMat);
        s.position.set(dx, 0.175, sz * (halfL + 0.19));
        s.rotation.y = Math.PI / 4;
        this.root.add(s);
      }
    }

    // 6 Pockets
    const pocketGeo = new THREE.CylinderGeometry(0.22, 0.2, 0.06, 16);
    this.disposableGeoms.push(pocketGeo);
    for (const p of BILLIARD_POCKETS) {
      const mesh = new THREE.Mesh(pocketGeo, pocketMat);
      mesh.position.set(p.x, -0.01, p.z);
      this.root.add(mesh);
    }

    // 4 Sturdy Turned Legs reaching parquet floor at y = -2.35
    const legGeo = new THREE.CylinderGeometry(0.21, 0.15, 1.85, 12);
    const footGeo = new THREE.CylinderGeometry(0.2, 0.23, 0.14, 12);
    this.disposableGeoms.push(legGeo, footGeo);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, darkWalnutMat);
        leg.position.set(sx * (halfW - 0.12), -1.42, sz * (halfL - 0.25));
        this.root.add(leg);

        const foot = new THREE.Mesh(footGeo, brassMat);
        foot.position.set(sx * (halfW - 0.12), -2.28, sz * (halfL - 0.25));
        this.root.add(foot);
      }
    }

    // Overhead 3-Shade Classic Pool Table Lamp
    const barGeo = new THREE.CylinderGeometry(0.04, 0.04, 5.2, 8);
    barGeo.rotateX(Math.PI / 2);
    const shadeGeo = new THREE.ConeGeometry(0.62, 0.44, 16, 1, true);
    const bulbGeo = new THREE.SphereGeometry(0.16, 10, 8);
    const cordGeo = new THREE.CylinderGeometry(0.025, 0.025, 6.4, 6);
    this.disposableGeoms.push(barGeo, shadeGeo, bulbGeo, cordGeo);

    const lampBar = new THREE.Mesh(barGeo, brassMat);
    lampBar.position.set(0, 6.2, 0);
    this.root.add(lampBar);

    for (const cz of [-1.8, 1.8]) {
      const cord = new THREE.Mesh(cordGeo, brassMat);
      cord.position.set(0, 9.4, cz);
      this.root.add(cord);
    }

    for (const lz of [-1.95, 0, 1.95]) {
      const shade = new THREE.Mesh(shadeGeo, lampShadeMat);
      shade.position.set(0, 5.95, lz);
      this.root.add(shade);

      const bulb = new THREE.Mesh(bulbGeo, lampGlowMat);
      bulb.position.set(0, 5.82, lz);
      this.root.add(bulb);
    }

    const poolLight = new THREE.PointLight('#FFE8B6', 24, 18, 1.4);
    poolLight.position.set(0, 5.4, 0);
    this.root.add(poolLight);
  }

  buildBalls() {
    const R = BILLIARD_TABLE.ballRadius;
    const sphereGeo = new THREE.SphereGeometry(R, 18, 14);
    this.disposableGeoms.push(sphereGeo);

    for (let id = 0; id <= 15; id += 1) {
      const mat = new THREE.MeshStandardMaterial({
        map: getBilliardBallTexture(id),
        roughness: 0.14,
        metalness: 0.06
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
    // Tapered wooden cue stick along local -X axis (tip near origin)
    const tipGeo = new THREE.CylinderGeometry(0.018, 0.02, 0.04, 10);
    tipGeo.rotateZ(Math.PI / 2);
    const shaftGeo = new THREE.CylinderGeometry(0.02, 0.032, 1.55, 10);
    shaftGeo.rotateZ(Math.PI / 2);
    const buttGeo = new THREE.CylinderGeometry(0.032, 0.048, 1.35, 10);
    buttGeo.rotateZ(Math.PI / 2);

    const tipMat = new THREE.MeshBasicMaterial({ color: '#3B82F6' });
    const shaftMat = new THREE.MeshLambertMaterial({ color: '#E8CFA6' });
    const buttMat = new THREE.MeshLambertMaterial({ color: '#4A1F14' });
    this.disposableGeoms.push(tipGeo, shaftGeo, buttGeo);
    this.disposableMats.push(tipMat, shaftMat, buttMat);

    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.set(-0.02, 0, 0);
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.set(-0.815, 0, 0);
    const butt = new THREE.Mesh(buttGeo, buttMat);
    butt.position.set(-2.265, 0, 0);

    this.cueStickGroup.add(tip, shaft, butt);
    this.cueStickGroup.visible = false;

    // Dashed white aiming guide line along +X from cue ball
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.14, 0.02, 0),
      new THREE.Vector3(3.4, 0.02, 0)
    ]);
    const lineMat = new THREE.LineDashedMaterial({
      color: '#FFF6D6',
      dashSize: 0.18,
      gapSize: 0.12,
      transparent: true,
      opacity: 0.85
    });
    this.disposableGeoms.push(lineGeo);
    this.disposableMats.push(lineMat);

    this.aimLine = new THREE.Line(lineGeo, lineMat);
    this.aimLine.computeLineDistances();
    this.aimLine.visible = false;
    this.root.add(this.aimLine);

    // Highlight ring under cue ball during ball-in-hand
    const ringGeo = new THREE.RingGeometry(0.16, 0.23, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#FACC15',
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });
    this.disposableGeoms.push(ringGeo);
    this.disposableMats.push(ringMat);
    this.cueRing = new THREE.Mesh(ringGeo, ringMat);
    this.cueRing.position.y = 0.012;
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

    const spots = [
      { x: -3.15, z: 2.25, rotY: Math.PI / 2 },
      { x: 3.15, z: -2.25, rotY: -Math.PI / 2 }
    ];

    seats.forEach((seat, idx) => {
      if (!seat || seat.type === 'empty') return;
      const spot = spots[idx];
      if (!spot) return;

      const pGroup = new THREE.Group();
      pGroup.position.set(spot.x, -0.35, spot.z);
      pGroup.rotation.y = spot.rotY;

      if (this.bustGeom) {
        const vestColor = idx === 0 ? '#1F4E78' : '#7A2E2E';
        const vestMat = new THREE.MeshStandardMaterial({ color: vestColor, roughness: 0.65 });
        this.disposableMats.push(vestMat);
        const bust = new THREE.Mesh(this.bustGeom, vestMat);
        bust.scale.setScalar(0.92);
        pGroup.add(bust);
      }

      const avKey = `billiard-av-${seat.avatar || idx}`;
      let avMat = this.avatarMatCache.get(avKey);
      if (!avMat) {
        avMat = new THREE.MeshBasicMaterial({ map: getAvatarTexture(seat.avatar || `avatar-${idx + 5}`) });
        this.avatarMatCache.set(avKey, avMat);
      }
      const badge = new THREE.Mesh(new THREE.CircleGeometry(0.46, 18), avMat);
      badge.position.set(0, 1.5, 0.34);
      pGroup.add(badge);

      const isActive = state?.phase === 'playing' && state?.currentSeat === idx;
      const label = seat.group
        ? `${seat.name} (${seat.group === 'solids' ? 'Düz' : 'Çizgili'})`
        : seat.name || `Oyuncu ${idx + 1}`;
      const npMat = new THREE.SpriteMaterial({
        map: createNameplateTexture(label, { isActive }),
        transparent: true,
        depthWrite: false
      });
      this.nameplateMats.push(npMat);
      const np = new THREE.Sprite(npMat);
      np.position.set(0, 2.55, 0);
      np.scale.set(3.2, 0.8, 1);
      pGroup.add(np);

      this.seatGroup.add(pGroup);
    });
  }

  updateState(billiardState, viewerId = null) {
    this.currentState = billiardState || null;
    this.viewerId = viewerId || null;

    if (!billiardState) return;
    this.syncPlayers(billiardState);

    const shot = billiardState.lastShot;
    if (shot && shot.id !== this.activeShotId) {
      const ageMs = Date.now() - (shot.startedAt || Date.now());
      if (ageMs < (shot.durationMs || 0) + 250) {
        this.activeShotId = shot.id;
        this.playedEventIndices.clear();
        this.isAnimatingShot = true;
        if (ageMs < 250) {
          soundFX.playBilliardCueShot(shot.power || 0.65);
        }
      } else {
        this.activeShotId = shot.id;
        this.isAnimatingShot = false;
      }
    }

    if (!this.isAnimatingShot) {
      for (const b of billiardState.balls || []) {
        const mesh = this.ballMeshes.get(b.id);
        if (!mesh) continue;
        mesh.visible = !b.pocketed;
        if (!b.pocketed) {
          this.applyBallRoll(b.id, mesh, b.x, b.z);
        }
      }
    }
  }

  tick(dt = 0.016, { isMyBilliardTurn = false, localPlayerId = null } = {}) {
    const state = this.currentState;
    if (!state) return;

    const shot = state.lastShot;
    if (this.isAnimatingShot && shot && Array.isArray(shot.frames) && shot.frames.length > 0) {
      const elapsedSec = Math.max(0, (Date.now() - (shot.startedAt || 0)) / 1000);
      const frames = shot.frames;
      const lastFrame = frames[frames.length - 1];

      // Trigger spatial/synced audio events
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
          mesh.visible = !b.pocketed;
          if (!b.pocketed) this.applyBallRoll(b.id, mesh, b.x, b.z);
        }
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
          mesh.visible = !pocketed;
          if (!pocketed) {
            const ix = THREE.MathUtils.lerp(a[1], b[1], alpha);
            const iz = THREE.MathUtils.lerp(a[2], b[2], alpha);
            this.applyBallRoll(id, mesh, ix, iz);
          }
        }
      }
    }

    // Cue stick + aiming guideline while active player (or bot) lines up a shot
    const cueBall = this.ballMeshes.get(0);
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

      const pullBack = 0.22 + aimPower * 0.42;
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

      if (this.cueRing) {
        this.cueRing.visible = Boolean(state.ballInHand && isMyBilliardTurn);
        this.cueRing.position.set(cx, 0.015, cz);
      }
    } else {
      this.cueStickGroup.visible = false;
      if (this.aimLine) this.aimLine.visible = false;
      if (this.cueRing) this.cueRing.visible = false;
    }
  }

  worldToLocalFelt(worldPoint) {
    return {
      x: worldPoint.x - BILLIARD_WORLD_POS.x,
      z: worldPoint.z - BILLIARD_WORLD_POS.z
    };
  }

  getCueBallWorldPosition() {
    const cue = this.ballMeshes.get(0);
    if (!cue) return BILLIARD_WORLD_POS.clone();
    return new THREE.Vector3(
      BILLIARD_WORLD_POS.x + cue.position.x,
      cue.position.y,
      BILLIARD_WORLD_POS.z + cue.position.z
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
