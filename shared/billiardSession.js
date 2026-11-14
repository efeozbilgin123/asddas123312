import { pickRandomBotAvatar, pickRandomBotName, PRESET_AVATAR_COUNT } from './presets.js';

export const BILLIARD_TABLE = Object.freeze({
  halfW: 1.75,
  halfL: 3.5,
  ballRadius: 0.125
});

export const BILLIARD_POCKETS = Object.freeze([
  { x: -1.72, z: -3.47, r: 0.25 },
  { x: 1.72, z: -3.47, r: 0.25 },
  { x: -1.79, z: 0, r: 0.23 },
  { x: 1.79, z: 0, r: 0.23 },
  { x: -1.72, z: 3.47, r: 0.25 },
  { x: 1.72, z: 3.47, r: 0.25 }
]);

const SOLIDS_SET = new Set([1, 2, 3, 4, 5, 6, 7]);
const STRIPES_SET = new Set([9, 10, 11, 12, 13, 14, 15]);

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

export function getBallGroup(ballId) {
  if (SOLIDS_SET.has(ballId)) return 'solids';
  if (STRIPES_SET.has(ballId)) return 'stripes';
  if (ballId === 8) return 'eight';
  return 'cue';
}

function createInitialRackBalls() {
  const R = BILLIARD_TABLE.ballRadius;
  const dx = R * 2.04;
  const dz = Math.sqrt(3) * R * 1.03;
  const apexZ = -1.75;

  // Standard 8-ball triangle order: apex=1, center of row3=8, opposing corners solid(5)/stripe(11)
  const rackOrder = [
    1,
    9, 2,
    10, 8, 3,
    4, 14, 7, 12,
    5, 13, 6, 15, 11
  ];

  const balls = [
    { id: 0, x: 0, z: 1.75, vx: 0, vz: 0, pocketed: false }
  ];

  let idx = 0;
  for (let row = 0; row < 5; row += 1) {
    const z = apexZ - row * dz;
    const startX = -(row * dx) / 2;
    for (let col = 0; col <= row; col += 1) {
      const id = rackOrder[idx];
      idx += 1;
      balls.push({
        id,
        x: round3(startX + col * dx),
        z: round3(z),
        vx: 0,
        vz: 0,
        pocketed: false
      });
    }
  }
  return balls;
}

function findSafeCueSpot(balls, desiredX = 0, desiredZ = 1.75) {
  const R = BILLIARD_TABLE.ballRadius;
  const minD2 = (R * 2.15) ** 2;
  const maxX = BILLIARD_TABLE.halfW - R * 1.3;
  const maxZ = BILLIARD_TABLE.halfL - R * 1.3;

  const isFree = (x, z) => {
    for (const b of balls) {
      if (b.id === 0 || b.pocketed) continue;
      const dx = b.x - x;
      const dz = b.z - z;
      if (dx * dx + dz * dz < minD2) return false;
    }
    return true;
  };

  const cx = Math.max(-maxX, Math.min(maxX, Number(desiredX) || 0));
  const cz = Math.max(-maxZ, Math.min(maxZ, Number(desiredZ) || 0));
  if (isFree(cx, cz)) return { x: round3(cx), z: round3(cz) };

  for (let ring = 1; ring <= 14; ring += 1) {
    const rad = ring * R * 1.4;
    for (let a = 0; a < 12; a += 1) {
      const ang = (a * Math.PI * 2) / 12;
      const tx = Math.max(-maxX, Math.min(maxX, cx + Math.cos(ang) * rad));
      const tz = Math.max(-maxZ, Math.min(maxZ, cz + Math.sin(ang) * rad));
      if (isFree(tx, tz)) return { x: round3(tx), z: round3(tz) };
    }
  }
  return { x: 0, z: 1.75 };
}

export class BilliardSession {
  constructor({ onStateChange } = {}) {
    this.onStateChange = onStateChange || (() => {});
    this.seats = [0, 1].map((idx) => ({
      seatIndex: idx,
      type: 'empty', // 'empty' | 'human' | 'bot'
      playerId: null,
      name: null,
      avatar: `avatar-${((idx + 4) % PRESET_AVATAR_COUNT) + 1}`,
      connected: false,
      group: null // null | 'solids' | 'stripes'
    }));

    this.phase = 'waiting'; // 'waiting' | 'playing' | 'gameOver'
    this.balls = createInitialRackBalls();
    this.currentSeat = 0;
    this.isBreakShot = true;
    this.ballInHand = false;
    this.winnerSeat = null;
    this.winReason = '';
    this.statusMessage = 'Bilardo masası hazır. 2 oyuncu oturduğunda başlatabilirsiniz.';
    this.shotSeq = 0;
    this.lastShot = null;
    this.shotBusyUntil = 0;
    this.aimState = { seatIndex: 0, angle: -Math.PI / 2, power: 0.68 };
    this.wins = [0, 0];
    this.botTimer = null;
    this.shotResolveTimer = null;
  }

  clearTimers() {
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
    if (this.shotResolveTimer) {
      clearTimeout(this.shotResolveTimer);
      this.shotResolveTimer = null;
    }
  }

  destroy() {
    this.clearTimers();
  }

  emitChange() {
    this.onStateChange(this.getClientView());
  }

  hasHumans() {
    return this.seats.some((s) => s.type === 'human' && s.connected);
  }

  findHumanSeat(playerId) {
    if (!playerId) return null;
    return this.seats.find((s) => s.type === 'human' && s.playerId === playerId) || null;
  }

  assignBot(seatIndex) {
    const seat = this.seats[seatIndex];
    if (!seat) return { ok: false, error: 'Geçersiz bilardo koltuğu.' };
    const other = this.seats[1 - seatIndex];
    const usedNames = other?.name ? [other.name] : [];
    const usedAvatars = other?.avatar ? [other.avatar] : [];
    seat.type = 'bot';
    seat.playerId = `billiard-bot-${seatIndex}`;
    seat.name = pickRandomBotName(usedNames);
    seat.avatar = pickRandomBotAvatar(usedAvatars);
    seat.connected = true;
    return { ok: true, seat };
  }

  toggleBotSeat(seatIndex) {
    const idx = Number(seatIndex);
    const seat = this.seats[idx];
    if (!seat) return { ok: false, error: 'Geçersiz bilardo koltuğu.' };
    if (seat.type === 'human') {
      return { ok: false, error: 'Bu koltukta gerçek oyuncu var.' };
    }
    if (this.phase === 'playing') {
      return { ok: false, error: 'Bilardo oyunu devam ederken bot değiştirilemez.' };
    }
    if (seat.type === 'empty') {
      this.assignBot(idx);
    } else {
      seat.type = 'empty';
      seat.playerId = null;
      seat.name = null;
      seat.connected = false;
    }
    this.emitChange();
    return { ok: true };
  }

  sitHuman({ playerId, playerName, playerAvatar, seatIndex = null }) {
    const already = this.findHumanSeat(playerId);
    if (already) {
      already.connected = true;
      if (playerName) already.name = String(playerName).trim().slice(0, 20) || already.name;
      if (playerAvatar) already.avatar = playerAvatar;
      this.emitChange();
      return { ok: true, seatIndex: already.seatIndex };
    }

    const reqIdx = seatIndex !== null && seatIndex !== undefined ? Number(seatIndex) : null;
    let target = null;
    if (reqIdx !== null && this.seats[reqIdx]) {
      const c = this.seats[reqIdx];
      if (
        c.type === 'empty' ||
        (this.phase !== 'playing' && c.type === 'bot') ||
        (c.type === 'human' && !c.connected)
      ) {
        target = c;
      }
    } else {
      target =
        this.seats.find((s) => s.type === 'empty') ||
        this.seats.find((s) => s.type === 'human' && !s.connected) ||
        (this.phase !== 'playing' ? this.seats.find((s) => s.type === 'bot') : null) ||
        null;
    }

    if (!target) {
      return { ok: false, error: 'Bilardo masasında boş koltuk yok.' };
    }

    target.type = 'human';
    target.playerId = playerId;
    target.name = (typeof playerName === 'string' ? playerName.trim().slice(0, 20) : '') || `Bilardocu ${target.seatIndex + 1}`;
    target.avatar = playerAvatar || target.avatar;
    target.connected = true;
    this.emitChange();
    return { ok: true, seatIndex: target.seatIndex };
  }

  standHuman(playerId, { convertToBotIfActive = true } = {}) {
    const seat = this.findHumanSeat(playerId);
    if (!seat) return { ok: false, error: 'Bilardo masasında oturmuyorsunuz.' };

    const otherHuman = this.seats.some((s) => s.seatIndex !== seat.seatIndex && s.type === 'human' && s.connected);
    if (this.phase === 'playing' && otherHuman && convertToBotIfActive) {
      this.assignBot(seat.seatIndex);
      this.statusMessage = `${seat.name} bot olarak devraldı.`;
      this.scheduleBotIfNeeded();
    } else {
      seat.type = 'empty';
      seat.playerId = null;
      seat.name = null;
      seat.connected = false;
      if (this.phase === 'playing' && !otherHuman) {
        this.clearTimers();
        this.phase = 'waiting';
        this.statusMessage = 'Bilardo masası bekliyor.';
      }
    }
    this.emitChange();
    return { ok: true };
  }

  startMatch({ autoFillBot = true } = {}) {
    this.clearTimers();

    const activeCount = this.seats.filter((s) => s.type !== 'empty').length;
    if (activeCount === 0) {
      return { ok: false, error: 'Önce en az bir oyuncu bilardo masasına oturmalı.' };
    }
    if (activeCount === 1 && autoFillBot) {
      const emptySeat = this.seats.find((s) => s.type === 'empty');
      if (emptySeat) this.assignBot(emptySeat.seatIndex);
    } else if (activeCount < 2) {
      return { ok: false, error: 'Bilardo için 2 oyuncu gerekiyor.' };
    }

    this.balls = createInitialRackBalls();
    this.seats[0].group = null;
    this.seats[1].group = null;
    this.phase = 'playing';
    this.currentSeat = 0;
    this.isBreakShot = true;
    this.ballInHand = false;
    this.winnerSeat = null;
    this.winReason = '';
    this.shotBusyUntil = 0;
    this.aimState = { seatIndex: 0, angle: -Math.PI / 2, power: 0.78 };
    this.statusMessage = `${this.seats[0].name || '1. Oyuncu'} açılış vuruşu yapıyor.`;
    this.emitChange();
    this.scheduleBotIfNeeded();
    return { ok: true };
  }

  updateAim(playerId, { angle, power }) {
    if (this.phase !== 'playing') return { ok: false };
    const seat = this.seats[this.currentSeat];
    if (!seat || seat.type !== 'human' || seat.playerId !== playerId) {
      return { ok: false };
    }
    const cleanAngle = Number.isFinite(Number(angle)) ? Number(angle) : this.aimState.angle;
    const cleanPower = Math.max(0.1, Math.min(1, Number(power) || this.aimState.power));
    this.aimState = {
      seatIndex: this.currentSeat,
      angle: cleanAngle,
      power: cleanPower
    };
    return { ok: true, aimState: this.aimState };
  }

  placeCueBall(playerId, { x, z }) {
    if (this.phase !== 'playing') return { ok: false, error: 'Bilardo maçı aktif değil.' };
    if (!this.ballInHand) return { ok: false, error: 'Şu an beyaz top elinizde değil.' };
    if (Date.now() < this.shotBusyUntil) return { ok: false, error: 'Topların durmasını bekleyin.' };

    const seat = this.seats[this.currentSeat];
    if (!seat || seat.type !== 'human' || seat.playerId !== playerId) {
      return { ok: false, error: 'Sıra sizde değil.' };
    }

    const spot = findSafeCueSpot(this.balls, x, z);
    const cue = this.balls.find((b) => b.id === 0);
    if (cue) {
      cue.x = spot.x;
      cue.z = spot.z;
      cue.vx = 0;
      cue.vz = 0;
      cue.pocketed = false;
    }
    this.emitChange();
    return { ok: true, spot };
  }

  shoot(playerId, { angle, power }, { isBotAction = false } = {}) {
    if (this.phase !== 'playing') {
      return { ok: false, error: 'Bilardo maçı aktif değil.' };
    }
    if (Date.now() < this.shotBusyUntil) {
      return { ok: false, error: 'Toplar henüz durmadı.' };
    }

    const seat = this.seats[this.currentSeat];
    if (!seat) return { ok: false, error: 'Geçersiz sıra.' };
    if (!isBotAction) {
      if (seat.type !== 'human' || seat.playerId !== playerId) {
        return { ok: false, error: 'Vuruş sırası sizde değil.' };
      }
    }

    const cue = this.balls.find((b) => b.id === 0);
    if (!cue || cue.pocketed) {
      const spot = findSafeCueSpot(this.balls, 0, 1.75);
      if (cue) {
        cue.x = spot.x;
        cue.z = spot.z;
        cue.pocketed = false;
      }
    }

    const shotAngle = Number.isFinite(Number(angle)) ? Number(angle) : -Math.PI / 2;
    const shotPower = Math.max(0.12, Math.min(1, Number(power) || 0.65));
    const speed = 3.2 + shotPower * 13.4;

    cue.vx = Math.cos(shotAngle) * speed;
    cue.vz = Math.sin(shotAngle) * speed;

    const sim = this.simulatePhysics();
    this.applyShotRules(seat, sim);

    this.shotSeq += 1;
    const now = Date.now();
    this.lastShot = {
      id: this.shotSeq,
      shooterSeat: seat.seatIndex,
      angle: round3(shotAngle),
      power: round3(shotPower),
      startedAt: now,
      durationMs: sim.durationMs,
      frames: sim.frames,
      events: sim.events
    };
    this.shotBusyUntil = now + Math.max(200, sim.durationMs - 200);
    this.aimState = {
      seatIndex: this.currentSeat,
      angle: shotAngle,
      power: 0.62
    };

    if (this.shotResolveTimer) {
      clearTimeout(this.shotResolveTimer);
      this.shotResolveTimer = null;
    }

    this.emitChange();
    this.scheduleBotIfNeeded();
    return { ok: true, shot: this.lastShot };
  }

  simulatePhysics() {
    const R = BILLIARD_TABLE.ballRadius;
    const { halfW, halfL } = BILLIARD_TABLE;
    const dt = 1 / 120;
    const maxSteps = 960; // up to 8 seconds max
    const minVel = 0.055;

    const frames = [];
    const events = [];
    const pocketedThisShot = [];
    let firstHitBallId = null;
    let lastSoundBallAt = -1;
    let lastSoundCushionAt = -1;

    const snapshotFrame = (t) => {
      frames.push({
        t: round3(t),
        balls: this.balls.map((b) => [b.id, round3(b.x), round3(b.z), b.pocketed ? 1 : 0])
      });
    };

    snapshotFrame(0);

    let step = 0;
    for (step = 1; step <= maxSteps; step += 1) {
      const t = step * dt;
      let anyMoving = false;

      // 1. Move & apply felt rolling drag
      const drag = Math.exp(-1.12 * dt);
      for (const b of this.balls) {
        if (b.pocketed) continue;
        const speedSq = b.vx * b.vx + b.vz * b.vz;
        if (speedSq < minVel * minVel) {
          b.vx = 0;
          b.vz = 0;
          continue;
        }
        anyMoving = true;
        b.x += b.vx * dt;
        b.z += b.vz * dt;
        b.vx *= drag;
        b.vz *= drag;
        // Slightly stronger low-speed settle for realistic stop
        if (speedSq < 0.35) {
          b.vx *= 0.992;
          b.vz *= 0.992;
        }
      }

      if (!anyMoving && step > 2) {
        break;
      }

      // 2. Check pocket capture
      for (const b of this.balls) {
        if (b.pocketed) continue;
        for (let pIdx = 0; pIdx < BILLIARD_POCKETS.length; pIdx += 1) {
          const p = BILLIARD_POCKETS[pIdx];
          const dx = b.x - p.x;
          const dz = b.z - p.z;
          if (dx * dx + dz * dz <= p.r * p.r) {
            b.pocketed = true;
            b.vx = 0;
            b.vz = 0;
            b.x = p.x;
            b.z = p.z;
            pocketedThisShot.push(b.id);
            events.push({ t: round3(t), kind: 'pocket', ballId: b.id, intensity: 0.9 });
            break;
          }
        }
      }

      // 3. Cushion bounces (leaving slight openings right at corner/side pocket mouths)
      for (const b of this.balls) {
        if (b.pocketed) continue;
        const inSideMouth = Math.abs(b.z) < 0.24;
        const inCornerZ = Math.abs(b.z) > halfL - 0.27;
        const inCornerX = Math.abs(b.x) > halfW - 0.27;

        if (!inSideMouth && !inCornerZ) {
          if (b.x > halfW - R) {
            b.x = halfW - R;
            if (b.vx > 0) {
              if (t - lastSoundCushionAt > 0.045 && Math.abs(b.vx) > 0.5) {
                lastSoundCushionAt = t;
                events.push({ t: round3(t), kind: 'cushion', intensity: Math.min(1, Math.abs(b.vx) / 8) });
              }
              b.vx = -b.vx * 0.80;
            }
          } else if (b.x < -halfW + R) {
            b.x = -halfW + R;
            if (b.vx < 0) {
              if (t - lastSoundCushionAt > 0.045 && Math.abs(b.vx) > 0.5) {
                lastSoundCushionAt = t;
                events.push({ t: round3(t), kind: 'cushion', intensity: Math.min(1, Math.abs(b.vx) / 8) });
              }
              b.vx = -b.vx * 0.80;
            }
          }
        }

        if (!inCornerX) {
          if (b.z > halfL - R) {
            b.z = halfL - R;
            if (b.vz > 0) {
              if (t - lastSoundCushionAt > 0.045 && Math.abs(b.vz) > 0.5) {
                lastSoundCushionAt = t;
                events.push({ t: round3(t), kind: 'cushion', intensity: Math.min(1, Math.abs(b.vz) / 8) });
              }
              b.vz = -b.vz * 0.80;
            }
          } else if (b.z < -halfL + R) {
            b.z = -halfL + R;
            if (b.vz < 0) {
              if (t - lastSoundCushionAt > 0.045 && Math.abs(b.vz) > 0.5) {
                lastSoundCushionAt = t;
                events.push({ t: round3(t), kind: 'cushion', intensity: Math.min(1, Math.abs(b.vz) / 8) });
              }
              b.vz = -b.vz * 0.80;
            }
          }
        }

        // Clamp absolute bounds so a fast mouth bounce never escapes felt
        b.x = Math.max(-halfW + R * 0.65, Math.min(halfW - R * 0.65, b.x));
        b.z = Math.max(-halfL + R * 0.65, Math.min(halfL - R * 0.65, b.z));
      }

      // 4. Pairwise elastic ball collisions
      const minDist = R * 2;
      const minDistSq = minDist * minDist;
      for (let i = 0; i < this.balls.length; i += 1) {
        const a = this.balls[i];
        if (a.pocketed) continue;
        for (let j = i + 1; j < this.balls.length; j += 1) {
          const b = this.balls[j];
          if (b.pocketed) continue;
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const distSq = dx * dx + dz * dz;
          if (distSq >= minDistSq || distSq < 1e-9) continue;

          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = minDist - dist;

          // Positional correction
          a.x -= nx * (overlap * 0.5);
          a.z -= nz * (overlap * 0.5);
          b.x += nx * (overlap * 0.5);
          b.z += nz * (overlap * 0.5);

          // Relative velocity along normal
          const rvx = b.vx - a.vx;
          const rvz = b.vz - a.vz;
          const velAlongNormal = rvx * nx + rvz * nz;

          if (velAlongNormal < 0) {
            if (firstHitBallId === null && (a.id === 0 || b.id === 0)) {
              firstHitBallId = a.id === 0 ? b.id : a.id;
            }
            const restitution = 0.94;
            const impulse = -(1 + restitution) * velAlongNormal * 0.5;
            a.vx -= impulse * nx;
            a.vz -= impulse * nz;
            b.vx += impulse * nx;
            b.vz += impulse * nz;

            const impact = Math.abs(velAlongNormal);
            if (impact > 0.35 && t - lastSoundBallAt > 0.03) {
              lastSoundBallAt = t;
              events.push({ t: round3(t), kind: 'ball', intensity: Math.min(1, impact / 10) });
            }
          }
        }
      }

      // Record keyframe every 5 substeps (~24fps)
      if (step % 5 === 0) {
        snapshotFrame(t);
      }
    }

    // Halt any residual creep cleanly
    for (const b of this.balls) {
      b.vx = 0;
      b.vz = 0;
    }

    const totalT = Math.max(0.25, step * dt);
    snapshotFrame(totalT);

    return {
      durationMs: Math.round(totalT * 1000),
      frames,
      events,
      pocketedThisShot,
      firstHitBallId
    };
  }

  remainingBallsForGroup(group) {
    if (group === 'solids') {
      return this.balls.filter((b) => SOLIDS_SET.has(b.id) && !b.pocketed).length;
    }
    if (group === 'stripes') {
      return this.balls.filter((b) => STRIPES_SET.has(b.id) && !b.pocketed).length;
    }
    return 7;
  }

  applyShotRules(shooterSeat, sim) {
    const otherSeat = this.seats[1 - shooterSeat.seatIndex];
    const scratched = sim.pocketedThisShot.includes(0);
    const eightPocketed = sim.pocketedThisShot.includes(8);
    const objectBallsPocketed = sim.pocketedThisShot.filter((id) => id !== 0 && id !== 8);
    const shooterGroup = shooterSeat.group;
    const shooterHasClearedGroup = shooterGroup ? this.remainingBallsForGroup(shooterGroup) === 0 : false;

    // 1. Handle 8-ball pocketed (Win or Loss immediately)
    if (eightPocketed) {
      const pocketedOwnSameShot = shooterGroup
        ? objectBallsPocketed.some((id) => getBallGroup(id) === shooterGroup)
        : false;
      const legalOnEight =
        shooterHasClearedGroup &&
        !pocketedOwnSameShot &&
        !scratched &&
        (sim.firstHitBallId === 8 || sim.firstHitBallId === null);
      if (legalOnEight && !this.isBreakShot) {
        this.phase = 'gameOver';
        this.winnerSeat = shooterSeat.seatIndex;
        this.wins[shooterSeat.seatIndex] = (this.wins[shooterSeat.seatIndex] || 0) + 1;
        this.winReason = '8 numarayı kurallara uygun cebine gönderdi!';
        this.statusMessage = `${shooterSeat.name} 8 numarayı soktu ve bilardoyu kazandı!`;
      } else {
        this.phase = 'gameOver';
        this.winnerSeat = otherSeat.seatIndex;
        this.wins[otherSeat.seatIndex] = (this.wins[otherSeat.seatIndex] || 0) + 1;
        this.winReason = scratched
          ? 'Rakip beyaz topla birlikte 8 numarayı düşürdü.'
          : 'Rakip 8 numarayı erken soktu.';
        this.statusMessage = `${otherSeat.name} bilardoyu kazandı (${this.winReason})`;
      }
      this.ballInHand = false;
      this.isBreakShot = false;
      return;
    }

    // 2. Check fouls (scratch or wrong first contact)
    let foulReason = '';
    if (scratched) {
      foulReason = 'Beyaz top deliğe düştü (Faul)!';
      const cue = this.balls.find((b) => b.id === 0);
      const spot = findSafeCueSpot(this.balls, 0, 1.75);
      if (cue) {
        cue.x = spot.x;
        cue.z = spot.z;
        cue.vx = 0;
        cue.vz = 0;
        cue.pocketed = false;
      }
    } else if (sim.firstHitBallId === null) {
      foulReason = 'Beyaz top hiçbir topa değmedi (Faul)!';
    } else if (shooterGroup) {
      const firstGroup = getBallGroup(sim.firstHitBallId);
      const needsEight = shooterHasClearedGroup;
      if (needsEight && sim.firstHitBallId !== 8) {
        // Note: if player cleared final ball *on this exact shot*, firstHitBallId was their group ball!
        // Check if they pocketed their last ball on THIS shot:
        const pocketedOwn = objectBallsPocketed.some((id) => getBallGroup(id) === shooterGroup);
        if (!pocketedOwn && firstGroup !== shooterGroup) {
          foulReason = 'Önce 8 numaraya vurulmalıydı (Faul)!';
        }
      } else if (!needsEight && firstGroup !== shooterGroup) {
        foulReason = `Önce kendi grubuna (${shooterGroup === 'solids' ? 'Düz' : 'Çizgili'}) vurulmalıydı (Faul)!`;
      }
    }

    // 3. Assign solids/stripes groups if open table and legal shot after break
    if (!this.isBreakShot && !shooterGroup && !foulReason && objectBallsPocketed.length > 0) {
      const firstMadeGroup = getBallGroup(objectBallsPocketed[0]);
      if (firstMadeGroup === 'solids' || firstMadeGroup === 'stripes') {
        shooterSeat.group = firstMadeGroup;
        otherSeat.group = firstMadeGroup === 'solids' ? 'stripes' : 'solids';
      }
    }

    this.isBreakShot = false;

    if (foulReason) {
      this.currentSeat = otherSeat.seatIndex;
      this.ballInHand = true;
      this.statusMessage = `${foulReason} Sıra ${otherSeat.name}'da (Beyaz top elinde).`;
      return;
    }

    this.ballInHand = false;
    const madeOwnBall = shooterSeat.group
      ? objectBallsPocketed.some((id) => getBallGroup(id) === shooterSeat.group)
      : objectBallsPocketed.length > 0;

    if (madeOwnBall) {
      this.statusMessage = `${shooterSeat.name} top soktu ve devam ediyor!`;
    } else {
      this.currentSeat = otherSeat.seatIndex;
      this.statusMessage = `Sıra ${otherSeat.name}'da.`;
    }
  }

  scheduleBotIfNeeded() {
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
    if (this.phase !== 'playing') return;
    const seat = this.seats[this.currentSeat];
    if (!seat || seat.type !== 'bot') return;

    const waitMs = Math.max(900, (this.shotBusyUntil - Date.now()) + 850);
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      this.executeBotShot();
    }, waitMs);
    this.botTimer.unref?.();
  }

  executeBotShot() {
    if (this.phase !== 'playing') return;
    const seat = this.seats[this.currentSeat];
    if (!seat || seat.type !== 'bot') return;

    if (this.ballInHand) {
      const spot = findSafeCueSpot(this.balls, (Math.random() - 0.5) * 1.4, 1.45);
      const cue = this.balls.find((b) => b.id === 0);
      if (cue) {
        cue.x = spot.x;
        cue.z = spot.z;
        cue.pocketed = false;
      }
    }

    const cue = this.balls.find((b) => b.id === 0);
    if (!cue) return;

    const candidateBalls = this.balls.filter((b) => {
      if (b.id === 0 || b.pocketed) return false;
      if (!seat.group) return b.id !== 8;
      if (this.remainingBallsForGroup(seat.group) === 0) return b.id === 8;
      return getBallGroup(b.id) === seat.group;
    });

    let bestAngle = -Math.PI / 2;
    let bestPower = this.isBreakShot ? 0.92 : 0.62;

    if (this.isBreakShot) {
      bestAngle = -Math.PI / 2 + (Math.random() - 0.5) * 0.06;
      bestPower = 0.94;
    } else if (candidateBalls.length > 0) {
      let bestScore = -Infinity;
      for (const target of candidateBalls) {
        for (const p of BILLIARD_POCKETS) {
          const tx = p.x - target.x;
          const tz = p.z - target.z;
          const tDist = Math.hypot(tx, tz);
          if (tDist < 0.01) continue;
          const nx = tx / tDist;
          const nz = tz / tDist;
          // Ghost ball contact spot
          const ghostX = target.x - nx * (BILLIARD_TABLE.ballRadius * 2);
          const ghostZ = target.z - nz * (BILLIARD_TABLE.ballRadius * 2);
          const gx = ghostX - cue.x;
          const gz = ghostZ - cue.z;
          const gDist = Math.hypot(gx, gz);
          if (gDist < 0.01) continue;

          const dot = (gx / gDist) * nx + (gz / gDist) * nz;
          if (dot < 0.25) continue; // Impossible steep cut
          const score = dot * 3.0 - tDist * 0.25 - gDist * 0.15;
          if (score > bestScore) {
            bestScore = score;
            bestAngle = Math.atan2(gz, gx) + (Math.random() - 0.5) * 0.055;
            bestPower = Math.max(0.42, Math.min(0.86, 0.38 + (gDist + tDist) * 0.08));
          }
        }
      }
      if (bestScore === -Infinity) {
        const pick = candidateBalls[0];
        bestAngle = Math.atan2(pick.z - cue.z, pick.x - cue.x) + (Math.random() - 0.5) * 0.08;
        bestPower = 0.65;
      }
    }

    this.shoot(seat.playerId, { angle: bestAngle, power: bestPower }, { isBotAction: true });
  }

  getClientView() {
    return {
      phase: this.phase,
      currentSeat: this.currentSeat,
      isBreakShot: this.isBreakShot,
      ballInHand: this.ballInHand,
      winnerSeat: this.winnerSeat,
      winReason: this.winReason,
      statusMessage: this.statusMessage,
      wins: [...this.wins],
      aimState: { ...this.aimState },
      shotSeq: this.shotSeq,
      lastShot: this.lastShot,
      seats: this.seats.map((s) => ({
        seatIndex: s.seatIndex,
        type: s.type,
        name: s.name,
        avatar: s.avatar,
        connected: s.connected,
        group: s.group,
        remaining: s.group ? this.remainingBallsForGroup(s.group) : 7
      })),
      balls: this.balls.map((b) => ({
        id: b.id,
        x: b.x,
        z: b.z,
        pocketed: b.pocketed
      }))
    };
  }
}
