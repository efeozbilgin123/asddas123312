import {
  canLayoffTile,
  validateGroup,
  validatePair
} from '../shared/melds.js';
import {
  computeRoundScores,
  isDiscardPlayableOnTable
} from '../shared/rules.js';
import {
  computeOkeyTarget,
  createDeck,
  isOkeyTile,
  shuffleDeck
} from '../shared/tiles.js';
import { chooseBotDrawSource, computeBotTurnActions } from './botAI.js';

export class GameSession {
  constructor({
    roomCode,
    seatsConfig,
    options,
    onStateChange
  }) {
    this.roomCode = roomCode;
    this.options = {
      katlamali: Boolean(options?.katlamali),
      teamMode: options?.teamMode === 'paired' ? 'paired' : 'solo',
      maxRounds: [0, 3, 5, 7, 9].includes(Number(options?.maxRounds))
        ? Number(options.maxRounds)
        : 5,
      islekPenalty: options?.islekPenalty !== false,
      turnSeconds: [45, 60, 90].includes(Number(options?.turnSeconds))
        ? Number(options.turnSeconds)
        : 60
    };
    this.onStateChange = onStateChange;

    this.roundNumber = 0;
    this.dealerSeat = 0;
    this.phase = 'idle'; // 'playing' | 'roundOver'
    this.turnPhase = 'draw'; // 'draw' | 'play'
    this.currentSeat = 0;
    this.openThreshold = 101;
    this.pairThreshold = 5;
    this.teamOpenThresholds = [101, 101];
    this.teamPairThresholds = [5, 5];
    this.gosterge = null;
    this.okeyTarget = null;
    this.deck = [];
    this.tableMelds = [];
    this.discardPiles = [[], [], [], []];
    this.pickedDiscardTileId = null;
    this.pickedDiscardFromSeat = null;
    this.lastDrawnTileId = null;
    this.committedMeldThisTurn = false;
    this.openedThisTurn = false;
    this.turnEndsAt = null;
    this.roundSummary = null;
    this.roundHistory = [];
    this.eventCounter = 0;
    this.lastEvent = null;
    this.meldCounter = 0;

    this.seats = seatsConfig.map((cfg, idx) => ({
      seatIndex: idx,
      teamIndex: idx % 2,
      playerId: cfg.playerId,
      name: cfg.name,
      avatar: cfg.avatar || `avatar-${(idx % 16) + 1}`,
      isBot: Boolean(cfg.isBot),
      connected: cfg.connected !== false,
      hand: [],
      opened: false,
      openMode: null, // 'series' | 'pairs'
      openedPoints: 0,
      roundPenalties: 0,
      totalScore: 0
    }));

    this.turnTimer = null;
    this.botTimer = null;
  }

  getOpenThreshold(seatIndex) {
    if (this.options.teamMode === 'paired') {
      return this.teamOpenThresholds[seatIndex % 2];
    }
    return this.openThreshold;
  }

  getPairThreshold(seatIndex) {
    if (this.options.teamMode === 'paired') {
      return this.teamPairThresholds[seatIndex % 2];
    }
    return this.pairThreshold;
  }

  destroy() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.botTimer) clearTimeout(this.botTimer);
    this.turnTimer = null;
    this.botTimer = null;
  }

  updateSeatConnection(seatIndex, { playerId, name, avatar, isBot, connected }) {
    const seat = this.seats[seatIndex];
    if (!seat) return;
    if (playerId !== undefined) seat.playerId = playerId;
    if (name !== undefined) seat.name = name;
    if (avatar !== undefined) seat.avatar = avatar;
    if (isBot !== undefined) seat.isBot = isBot;
    if (connected !== undefined) seat.connected = connected;
    if (seat.isBot && this.phase === 'playing' && this.currentSeat === seatIndex) {
      this.scheduleBotMove();
    }
  }

  startRound() {
    this.destroy();
    this.roundNumber += 1;
    this.dealerSeat = (this.roundNumber - 1) % 4;
    const starterSeat = (this.dealerSeat + 1) % 4;

    let fullDeck = shuffleDeck(createDeck());
    // Pick a non-fake-okey tile as Gösterge
    const gostergeIdx = fullDeck.findIndex((t) => !t.isFakeOkey);
    this.gosterge = fullDeck.splice(gostergeIdx, 1)[0];
    this.okeyTarget = computeOkeyTarget(this.gosterge);

    this.tableMelds = [];
    this.discardPiles = [[], [], [], []];
    this.pickedDiscardTileId = null;
    this.pickedDiscardFromSeat = null;
    this.lastDrawnTileId = null;
    this.committedMeldThisTurn = false;
    this.openedThisTurn = false;
    this.roundSummary = null;
    this.openThreshold = 101;
    this.pairThreshold = 5;
    this.teamOpenThresholds = [101, 101];
    this.teamPairThresholds = [5, 5];
    this.phase = 'playing';
    this.currentSeat = starterSeat;
    this.turnPhase = 'play'; // Starter begins with 22 tiles and plays/discards

    for (const seat of this.seats) {
      seat.opened = false;
      seat.openMode = null;
      seat.openedPoints = 0;
      seat.roundPenalties = 0;
      const count = seat.seatIndex === starterSeat ? 22 : 21;
      seat.hand = fullDeck.splice(0, count);
    }

    this.deck = fullDeck;
    this.emitEvent('round_start', starterSeat, null, `${this.roundNumber}. el başladı. İlk hamle ${this.seats[starterSeat].name}.`);
    this.resetTurnTimer();
    this.notify();
    this.scheduleBotMove();
  }

  emitEvent(type, seatIndex, tile = null, message = '', extra = {}) {
    this.eventCounter += 1;
    this.lastEvent = {
      id: this.eventCounter,
      type,
      seatIndex,
      tile: tile ? { ...tile } : null,
      message,
      alertKind: extra.alertKind || null,
      timestamp: Date.now()
    };
  }

  resetTurnTimer() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.phase !== 'playing') {
      this.turnEndsAt = null;
      return;
    }
    const ms = this.options.turnSeconds * 1000;
    this.turnEndsAt = Date.now() + ms;
    this.turnTimer = setTimeout(() => {
      this.handleTurnTimeout();
    }, ms);
  }

  handleTurnTimeout() {
    if (this.phase !== 'playing') return;
    const seat = this.seats[this.currentSeat];
    if (!seat) return;

    // Return picked left-discard if stuck with it without opening
    if (this.pickedDiscardTileId && !this.committedMeldThisTurn) {
      this.returnPickedDiscard(seat.seatIndex, true);
    }

    if (this.turnPhase === 'draw') {
      if (this.deck.length === 0) {
        this.finishRound(null, false, 'Ortadaki deste tükendi.');
        return;
      }
      const drawn = this.deck.pop();
      seat.hand.push(drawn);
      this.lastDrawnTileId = drawn.id;
      this.turnPhase = 'play';
    }

    const isSafeDiscard = (t) =>
      !isOkeyTile(t, this.okeyTarget) &&
      !isDiscardPlayableOnTable(t, this.tableMelds, this.okeyTarget);

    // Prefer discarding the tile drawn this turn so the player's arranged hand stays intact
    const drawnTile = this.lastDrawnTileId
      ? seat.hand.find((t) => t.id === this.lastDrawnTileId)
      : null;

    let candidate = null;
    if (drawnTile && isSafeDiscard(drawnTile)) {
      candidate = drawnTile;
    } else {
      for (let i = seat.hand.length - 1; i >= 0; i -= 1) {
        if (isSafeDiscard(seat.hand[i])) {
          candidate = seat.hand[i];
          break;
        }
      }
      if (!candidate) {
        for (let i = seat.hand.length - 1; i >= 0; i -= 1) {
          if (!isOkeyTile(seat.hand[i], this.okeyTarget)) {
            candidate = seat.hand[i];
            break;
          }
        }
      }
      if (!candidate) {
        candidate = drawnTile || seat.hand[seat.hand.length - 1] || seat.hand[0];
      }
    }

    if (candidate) {
      this.discardTile(seat.seatIndex, candidate.id, { forceTimeout: true });
    }
  }

  scheduleBotMove() {
    if (this.botTimer) clearTimeout(this.botTimer);
    if (this.phase !== 'playing') return;
    const seat = this.seats[this.currentSeat];
    if (!seat || !seat.isBot) return;

    this.botTimer = setTimeout(() => {
      this.executeBotTurn(seat.seatIndex);
    }, 650);
  }

  executeBotTurn(seatIndex) {
    if (this.phase !== 'playing' || this.currentSeat !== seatIndex) return;
    const seat = this.seats[seatIndex];
    if (!seat || !seat.isBot) return;

    // Step 1: Draw if in draw phase
    if (this.turnPhase === 'draw') {
      const leftSeat = (seatIndex + 3) % 4;
      const leftPile = this.discardPiles[leftSeat];
      const leftTop = leftPile.length > 0 ? leftPile[leftPile.length - 1] : null;
      const source = chooseBotDrawSource({
        seat,
        leftDiscardTop: leftTop,
        state: this
      });

      if (source === 'discard' && leftTop) {
        const res = this.drawFromDiscard(seatIndex, true);
        if (!res.ok) {
          this.drawFromDeck(seatIndex, true);
        }
      } else {
        this.drawFromDeck(seatIndex, true);
      }
    }

    if (this.phase !== 'playing' || this.currentSeat !== seatIndex) return;

    // Step 2: If converted from human holding an unusable left discard, return it and draw from deck
    let actions = computeBotTurnActions({ seat, state: this });
    if (this.turnPhase === 'play' && this.pickedDiscardTileId) {
      const pickedId = this.pickedDiscardTileId;
      const usesPicked = actions.some(
        (act) =>
          (act.type === 'openHand' && act.groups?.some((g) => g.includes(pickedId))) ||
          (act.type === 'layMeld' && act.tileIds?.includes(pickedId)) ||
          (act.type === 'layoffTile' && act.tileId === pickedId)
      );
      if (!usesPicked) {
        const ret = this.returnPickedDiscard(seatIndex, true);
        if (ret.ok && this.turnPhase === 'draw') {
          this.drawFromDeck(seatIndex, true);
          if (this.phase !== 'playing' || this.currentSeat !== seatIndex) return;
          actions = computeBotTurnActions({ seat, state: this });
        }
      }
    }

    // Play melds & discard with small natural pacing
    let step = 0;

    const runNext = () => {
      if (this.phase !== 'playing' || this.currentSeat !== seatIndex) return;
      const act = actions[step];
      step += 1;
      if (!act) return;

      if (act.type === 'openHand') {
        this.openHand(seatIndex, act.groups, act.mode, true);
      } else if (act.type === 'layMeld') {
        this.layMeld(seatIndex, act.tileIds, true);
      } else if (act.type === 'layoffTile') {
        this.layoffTile(seatIndex, act.tileId, act.meldId, true);
      } else if (act.type === 'discardTile') {
        const discRes = this.discardTile(seatIndex, act.tileId, { silentNotify: false });
        if (!discRes?.ok) {
          this.handleTurnTimeout();
        }
        return;
      }

      if (step < actions.length) {
        this.botTimer = setTimeout(runNext, 420);
      }
    };

    this.botTimer = setTimeout(runNext, 500);
  }

  drawFromDeck(seatIndex, fromInternal = false) {
    if (this.phase !== 'playing') return { ok: false, error: 'Aktif el yok.' };
    if (this.currentSeat !== seatIndex) return { ok: false, error: 'Sıra sizde değil.' };
    if (this.turnPhase !== 'draw') return { ok: false, error: 'Bu turda zaten taş çektiniz.' };
    if (this.deck.length === 0) {
      this.finishRound(null, false, 'Ortadaki deste bittiği için el sona erdi.');
      return { ok: true };
    }

    const tile = this.deck.pop();
    const seat = this.seats[seatIndex];
    seat.hand.push(tile);
    this.turnPhase = 'play';
    this.pickedDiscardTileId = null;
    this.pickedDiscardFromSeat = null;
    this.lastDrawnTileId = tile.id;
    this.committedMeldThisTurn = false;
    this.openedThisTurn = false;

    this.emitEvent('draw_deck', seatIndex, null, `${seat.name} ortadan taş çekti.`);
    this.notify();
    return { ok: true, tile };
  }

  drawFromDiscard(seatIndex, fromInternal = false) {
    if (this.phase !== 'playing') return { ok: false, error: 'Aktif el yok.' };
    if (this.currentSeat !== seatIndex) return { ok: false, error: 'Sıra sizde değil.' };
    if (this.turnPhase !== 'draw') return { ok: false, error: 'Bu turda zaten taş çektiniz.' };

    const leftSeat = (seatIndex + 3) % 4;
    const pile = this.discardPiles[leftSeat];
    if (!pile || pile.length === 0) {
      return { ok: false, error: 'Sol tarafınızda alınabilecek taş yok.' };
    }

    const top = pile[pile.length - 1];
    if (isOkeyTile(top, this.okeyTarget)) {
      return { ok: false, error: 'Yere atılan Okey taşı yandan alınamaz.' };
    }

    const tile = pile.pop();
    const seat = this.seats[seatIndex];
    seat.hand.push(tile);
    this.turnPhase = 'play';
    this.lastDrawnTileId = tile.id;
    // Once a player has already opened their hand, taking from the left is unrestricted in 101 Okey
    if (seat.opened) {
      this.pickedDiscardTileId = null;
      this.pickedDiscardFromSeat = null;
    } else {
      this.pickedDiscardTileId = tile.id;
      this.pickedDiscardFromSeat = leftSeat;
    }
    this.committedMeldThisTurn = false;
    this.openedThisTurn = false;

    this.emitEvent('draw_discard', seatIndex, tile, `${seat.name} yandan taş aldı.`);
    this.notify();
    return { ok: true, tile };
  }

  returnPickedDiscard(seatIndex, silent = false) {
    if (this.phase !== 'playing') return { ok: false, error: 'Aktif el yok.' };
    if (this.currentSeat !== seatIndex) return { ok: false, error: 'Sıra sizde değil.' };
    if (this.turnPhase !== 'play' || !this.pickedDiscardTileId) {
      return { ok: false, error: 'Geri konacak yan taş yok.' };
    }
    if (this.committedMeldThisTurn) {
      return { ok: false, error: 'Masaya taş açtıktan sonra yan taş geri konamaz.' };
    }

    const seat = this.seats[seatIndex];
    const idx = seat.hand.findIndex((t) => t.id === this.pickedDiscardTileId);
    if (idx === -1) return { ok: false, error: 'Taş elinizde bulunamadı.' };

    const [tile] = seat.hand.splice(idx, 1);
    const fromSeat = this.pickedDiscardFromSeat ?? (seatIndex + 3) % 4;
    this.discardPiles[fromSeat].push(tile);
    this.pickedDiscardTileId = null;
    this.pickedDiscardFromSeat = null;
    this.lastDrawnTileId = null;
    this.turnPhase = 'draw';

    if (!silent) {
      this.emitEvent('return_discard', seatIndex, tile, `${seat.name} aldığı taşı geri koydu.`);
      this.notify();
    }
    return { ok: true };
  }

  openHand(seatIndex, groupsOfIds, mode = 'series', fromInternal = false) {
    if (this.phase !== 'playing') return { ok: false, error: 'Aktif el yok.' };
    if (this.currentSeat !== seatIndex) return { ok: false, error: 'Sıra sizde değil.' };
    if (this.turnPhase !== 'play') return { ok: false, error: 'Önce taş çekmelisiniz.' };

    const seat = this.seats[seatIndex];
    if (seat.opened) return { ok: false, error: 'Eliniz zaten açık.' };
    if (!Array.isArray(groupsOfIds) || groupsOfIds.length === 0) {
      return { ok: false, error: 'Açmak için en az bir grup seçmelisiniz.' };
    }

    if (
      this.options.katlamali &&
      this.pickedDiscardTileId &&
      this.pickedDiscardFromSeat !== null &&
      this.seats[this.pickedDiscardFromSeat]?.openMode === 'pairs' &&
      mode !== 'pairs'
    ) {
      return {
        ok: false,
        error: 'Katlamalı oyunda çift açan oyuncudan alınan taşla yalnızca çifte açabilirsiniz.'
      };
    }

    const handMap = new Map(seat.hand.map((t) => [t.id, t]));
    const usedIds = new Set();
    const validatedGroups = [];
    let totalPoints = 0;

    for (const ids of groupsOfIds) {
      if (!Array.isArray(ids) || ids.length === 0) {
        return { ok: false, error: 'Boş grup açılamaz.' };
      }
      const tiles = [];
      for (const id of ids) {
        if (usedIds.has(id)) {
          return { ok: false, error: 'Aynı taş birden fazla grupta kullanılamaz.' };
        }
        const tile = handMap.get(id);
        if (!tile) {
          return { ok: false, error: 'Seçilen taşlardan biri elinizde değil.' };
        }
        usedIds.add(id);
        tiles.push(tile);
      }

      if (mode === 'pairs') {
        const res = validatePair(tiles, this.okeyTarget, this.gosterge);
        if (!res.valid) return { ok: false, error: res.reason };
        validatedGroups.push(res);
        totalPoints += res.points;
      } else {
        const res = validateGroup(tiles, this.okeyTarget);
        if (!res.valid) return { ok: false, error: res.reason };
        validatedGroups.push(res);
        totalPoints += res.points;
      }
    }

    const reqPairs = this.getPairThreshold(seatIndex);
    const reqOpen = this.getOpenThreshold(seatIndex);

    if (mode === 'pairs') {
      if (validatedGroups.length < reqPairs) {
        return { ok: false, error: `Çift açmak için en az ${reqPairs} çift gerekir.` };
      }
    } else if (totalPoints < reqOpen) {
      return {
        ok: false,
        error: `Açmak için en az ${reqOpen} sayı gerekir (seçilen: ${totalPoints}).`
      };
    }

    if (this.pickedDiscardTileId && !usedIds.has(this.pickedDiscardTileId)) {
      return {
        ok: false,
        error: 'Yandan aldığınız taşı açtığınız perlerde kullanmalısınız.'
      };
    }

    if (seat.hand.length - usedIds.size < 1) {
      return {
        ok: false,
        error: 'Masaya son atacağınız 1 taş ıstakanızda kalmalıdır.'
      };
    }

    seat.hand = seat.hand.filter((t) => !usedIds.has(t.id));
    seat.opened = true;
    seat.openMode = mode === 'pairs' ? 'pairs' : 'series';
    seat.openedPoints = totalPoints;

    for (const g of validatedGroups) {
      this.meldCounter += 1;
      this.tableMelds.push({
        id: `m-${this.meldCounter}`,
        type: g.type,
        ownerSeat: seatIndex,
        points: g.points,
        slots: g.slots
      });
    }

    if (this.options.katlamali) {
      if (this.options.teamMode === 'paired') {
        const oppTeam = 1 - (seatIndex % 2);
        if (mode === 'pairs') {
          this.teamPairThresholds[oppTeam] = Math.max(
            this.teamPairThresholds[oppTeam],
            validatedGroups.length + 1
          );
          this.pairThreshold = Math.max(...this.teamPairThresholds);
        } else if (totalPoints >= reqOpen) {
          this.teamOpenThresholds[oppTeam] = Math.max(
            this.teamOpenThresholds[oppTeam],
            totalPoints + 1
          );
          this.openThreshold = Math.max(...this.teamOpenThresholds);
        }
      } else if (mode === 'pairs') {
        this.pairThreshold = Math.max(this.pairThreshold, validatedGroups.length + 1);
      } else if (totalPoints >= reqOpen) {
        this.openThreshold = totalPoints + 1;
      }
    }

    if (this.pickedDiscardTileId && usedIds.has(this.pickedDiscardTileId)) {
      this.pickedDiscardTileId = null;
      this.pickedDiscardFromSeat = null;
    }
    this.committedMeldThisTurn = true;
    this.openedThisTurn = true;

    if (this.seats.every((s) => s.opened && s.openMode === 'pairs')) {
      this.finishRound(
        null,
        false,
        '4 oyuncu da çift açtığı için bu el iptal edildi! Hiçbir oyuncuya ceza yazılmadı.',
        { roundCancelled: true }
      );
      return { ok: true, totalPoints, roundCancelled: true };
    }

    const label = mode === 'pairs' ? `${validatedGroups.length} çift` : `${totalPoints} sayı`;
    this.emitEvent('open_hand', seatIndex, null, `${seat.name} ${label} ile elini açtı.`);
    this.notify();
    return { ok: true, totalPoints };
  }

  layMeld(seatIndex, tileIds, fromInternal = false) {
    if (this.phase !== 'playing') return { ok: false, error: 'Aktif el yok.' };
    if (this.currentSeat !== seatIndex) return { ok: false, error: 'Sıra sizde değil.' };
    if (this.turnPhase !== 'play') return { ok: false, error: 'Önce taş çekmelisiniz.' };

    const seat = this.seats[seatIndex];
    if (!seat.opened) return { ok: false, error: 'Önce elinizi açmalısınız.' };
    const minTileCount = seat.openMode === 'pairs' ? 1 : 2;
    if (!Array.isArray(tileIds) || tileIds.length < minTileCount) {
      return { ok: false, error: 'Geçerli bir grup seçin.' };
    }

    const handMap = new Map(seat.hand.map((t) => [t.id, t]));
    const tiles = [];
    const usedIds = new Set();

    for (const id of tileIds) {
      if (usedIds.has(id)) return { ok: false, error: 'Tekrarlanan taş var.' };
      const t = handMap.get(id);
      if (!t) return { ok: false, error: 'Taş elinizde bulunamadı.' };
      usedIds.add(id);
      tiles.push(t);
    }

    if (this.pickedDiscardTileId && !usedIds.has(this.pickedDiscardTileId)) {
      return {
        ok: false,
        error: 'Yandan aldığınız taşı bu grupta kullanmalısınız (kullanmayacaksanız önce yan taşı geri koyun).'
      };
    }

    if (
      seat.openMode === 'pairs' &&
      tiles.length !== 2 &&
      !(tiles.length === 1 && validatePair(tiles, this.okeyTarget, this.gosterge).valid)
    ) {
      return {
        ok: false,
        error: 'Çift açan oyuncu normal per açamaz; yalnızca çift (veya gösterge taşı) indirebilir ya da tek taş işleyebilir.'
      };
    }

    if (seat.hand.length - tiles.length < 1) {
      return { ok: false, error: 'Bitirmek için atacağınız son taş ıstakanızda kalmalıdır.' };
    }

    const res =
      seat.openMode === 'pairs'
        ? validatePair(tiles, this.okeyTarget, this.gosterge)
        : validateGroup(tiles, this.okeyTarget);

    if (!res.valid) return { ok: false, error: res.reason };

    seat.hand = seat.hand.filter((t) => !usedIds.has(t.id));
    this.meldCounter += 1;
    this.tableMelds.push({
      id: `m-${this.meldCounter}`,
      type: res.type,
      ownerSeat: seatIndex,
      points: res.points,
      slots: res.slots
    });

    if (this.pickedDiscardTileId && usedIds.has(this.pickedDiscardTileId)) {
      this.pickedDiscardTileId = null;
      this.pickedDiscardFromSeat = null;
    }
    this.committedMeldThisTurn = true;

    this.emitEvent('lay_meld', seatIndex, null, `${seat.name} masaya yeni grup indirdi.`);
    this.notify();
    return { ok: true };
  }

  layoffTile(seatIndex, tileId, meldId, fromInternal = false) {
    if (this.phase !== 'playing') return { ok: false, error: 'Aktif el yok.' };
    if (this.currentSeat !== seatIndex) return { ok: false, error: 'Sıra sizde değil.' };
    if (this.turnPhase !== 'play') return { ok: false, error: 'Önce taş çekmelisiniz.' };

    const seat = this.seats[seatIndex];
    if (!seat.opened) return { ok: false, error: 'Taş işlemek için önce elinizi açmalısınız.' };

    const tileIdx = seat.hand.findIndex((t) => t.id === tileId);
    if (tileIdx === -1) return { ok: false, error: 'Taş elinizde bulunamadı.' };

    const meldIdx = this.tableMelds.findIndex((m) => m.id === meldId);
    if (meldIdx === -1) return { ok: false, error: 'Hedef grup masada bulunamadı.' };

    const tile = seat.hand[tileIdx];
    if (this.pickedDiscardTileId && tile.id !== this.pickedDiscardTileId) {
      return {
        ok: false,
        error: 'Yandan aldığınız taşı masaya işlemelisiniz (kullanmayacaksanız önce yan taşı geri koyun).'
      };
    }

    const targetMeld = this.tableMelds[meldIdx];
    const res = canLayoffTile(tile, targetMeld, this.okeyTarget);

    if (!res.valid) return { ok: false, error: res.reason };

    if (!res.swappedOkey && seat.hand.length <= 1) {
      return { ok: false, error: 'Bitirmek için son taşı kenara atmalısınız.' };
    }

    seat.hand.splice(tileIdx, 1);
    if (res.swappedOkey) {
      seat.hand.push(res.swappedOkey);
    }
    this.tableMelds[meldIdx] = res.updatedMeld;

    if (this.pickedDiscardTileId === tile.id) {
      this.pickedDiscardTileId = null;
      this.pickedDiscardFromSeat = null;
    }
    this.committedMeldThisTurn = true;

    const msg = res.swappedOkey
      ? `${seat.name} yerdeki Okey'i aldı.`
      : `${seat.name} masaya taş işledi.`;
    this.emitEvent('layoff', seatIndex, tile, msg);
    this.notify();
    return { ok: true, swappedOkey: Boolean(res.swappedOkey) };
  }

  discardTile(seatIndex, tileId, { forceTimeout = false, silentNotify = false } = {}) {
    if (this.phase !== 'playing') return { ok: false, error: 'Aktif el yok.' };
    if (this.currentSeat !== seatIndex) return { ok: false, error: 'Sıra sizde değil.' };
    if (this.turnPhase !== 'play') return { ok: false, error: 'Önce taş çekmelisiniz.' };

    const seat = this.seats[seatIndex];
    const tileIdx = seat.hand.findIndex((t) => t.id === tileId);
    if (tileIdx === -1) return { ok: false, error: 'Taş elinizde bulunamadı.' };

    if (this.pickedDiscardTileId && !forceTimeout) {
      return {
        ok: false,
        error: 'Yandan aldığınız taşı kullanmadan taş atamazsınız. Önce el açın veya taşı geri koyun.'
      };
    }

    const [tile] = seat.hand.splice(tileIdx, 1);
    const isFinalWin = seat.hand.length === 0;
    const isOkeyFinish = isFinalWin && isOkeyTile(tile, this.okeyTarget);
    const okeyDiscardPenalty = !isFinalWin && isOkeyTile(tile, this.okeyTarget);

    if (okeyDiscardPenalty) {
      seat.roundPenalties += 101;
    }

    const islekPlayable =
      !isFinalWin &&
      !okeyDiscardPenalty &&
      isDiscardPlayableOnTable(tile, this.tableMelds, this.okeyTarget);
    let islekTriggered = false;
    if (islekPlayable && this.options.islekPenalty) {
      seat.roundPenalties += 101;
      islekTriggered = true;
    }

    this.discardPiles[seatIndex].push(tile);
    this.pickedDiscardTileId = null;
    this.pickedDiscardFromSeat = null;
    this.lastDrawnTileId = null;
    this.committedMeldThisTurn = false;

    if (isFinalWin) {
      const finishedFromPairs = seat.openMode === 'pairs';
      const finishedFromHand = this.openedThisTurn;
      this.openedThisTurn = false;

      const tags = [];
      if (finishedFromPairs) tags.push('çiftten');
      if (finishedFromHand) tags.push('elden (kafa)');
      if (isOkeyFinish) tags.push('Okey atarak');
      const mult = (isOkeyFinish ? 2 : 1) * (finishedFromPairs || finishedFromHand ? 2 : 1);
      const multLabel = mult > 1 ? ` (${mult}×)` : '';
      const tagText = tags.length > 0 ? ` ${tags.join(' ve ')}` : '';
      const msg = `${seat.name}${tagText} eli bitirdi!${multLabel}`;

      this.finishRound(seatIndex, isOkeyFinish, msg, {
        finishedFromPairs,
        finishedFromHand
      });
      return { ok: true, roundEnded: true };
    }

    this.openedThisTurn = false;

    if (this.deck.length === 0) {
      this.finishRound(null, false, 'Ortadaki deste bitti.');
      return { ok: true, roundEnded: true };
    }

    this.currentSeat = (seatIndex + 1) % 4;
    this.turnPhase = 'draw';
    let notice = `${seat.name} taş attı.`;
    let alertKind = null;
    if (okeyDiscardPenalty) {
      notice = `${seat.name} Okeyi yere attı (+101 ceza).`;
      alertKind = 'okey';
    } else if (islekTriggered) {
      notice = `${seat.name} işlek taş attı (+101 ceza).`;
      alertKind = 'islek';
    } else if (islekPlayable) {
      notice = `${seat.name} işlek taş attı.`;
      alertKind = 'islek';
    }
    this.emitEvent('discard', seatIndex, tile, notice, { alertKind });
    this.resetTurnTimer();

    if (!silentNotify) {
      this.notify();
    }
    this.scheduleBotMove();
    return { ok: true, islekTriggered, islekPlayable, okeyDiscardPenalty };
  }

  finishRound(
    winnerSeat,
    finishedWithOkey,
    message,
    { finishedFromPairs = false, finishedFromHand = false, roundCancelled = false } = {}
  ) {
    this.destroy();
    this.phase = 'roundOver';

    const breakdown = computeRoundScores({
      seats: this.seats,
      winnerSeat,
      finishedWithOkey,
      finishedFromPairs,
      finishedFromHand,
      roundCancelled,
      okeyTarget: this.okeyTarget,
      teamMode: this.options.teamMode
    });

    for (const row of breakdown) {
      const seat = this.seats[row.seatIndex];
      seat.totalScore += row.roundDelta;
      row.totalScore = seat.totalScore;
    }

    const teamScores = [
      this.seats[0].totalScore + this.seats[2].totalScore,
      this.seats[1].totalScore + this.seats[3].totalScore
    ];
    const maxRounds = this.options.maxRounds || 0;
    const matchComplete = maxRounds > 0 && this.roundNumber >= maxRounds;

    this.roundSummary = {
      roundNumber: this.roundNumber,
      maxRounds,
      matchComplete,
      teamMode: this.options.teamMode,
      teamScores,
      winnerSeat,
      finishedWithOkey,
      finishedFromPairs,
      finishedFromHand,
      roundCancelled,
      deckExhausted: !roundCancelled && winnerSeat === null,
      message,
      rows: breakdown
    };
    this.roundHistory.push({
      roundNumber: this.roundNumber,
      winnerSeat,
      winnerName: winnerSeat !== null ? (this.seats[winnerSeat]?.name || null) : null,
      finishedWithOkey: Boolean(finishedWithOkey),
      finishedFromPairs: Boolean(finishedFromPairs),
      finishedFromHand: Boolean(finishedFromHand),
      roundCancelled: Boolean(roundCancelled),
      deckExhausted: !roundCancelled && winnerSeat === null,
      teamScores: [...teamScores],
      message,
      rows: breakdown.map((r) => ({ ...r }))
    });

    this.emitEvent('round_over', winnerSeat ?? this.currentSeat, null, message);
    this.notify();
  }

  getClientView(viewerSeatIndex) {
    const teamScores = [
      this.seats[0].totalScore + this.seats[2].totalScore,
      this.seats[1].totalScore + this.seats[3].totalScore
    ];

    return {
      roomCode: this.roomCode,
      options: this.options,
      roundNumber: this.roundNumber,
      maxRounds: this.options.maxRounds || 0,
      teamScores,
      dealerSeat: this.dealerSeat,
      phase: this.phase,
      turnPhase: this.turnPhase,
      currentSeat: this.currentSeat,
      openThreshold: this.getOpenThreshold(viewerSeatIndex),
      pairThreshold: this.getPairThreshold(viewerSeatIndex),
      teamOpenThresholds: [...this.teamOpenThresholds],
      teamPairThresholds: [...this.teamPairThresholds],
      gosterge: this.gosterge,
      okeyTarget: this.okeyTarget,
      deckCount: this.deck.length,
      tableMelds: this.tableMelds,
      discardPiles: this.discardPiles.map((pile) => ({
        count: pile.length,
        topTile: pile.length > 0 ? pile[pile.length - 1] : null
      })),
      pickedDiscardTileId:
        viewerSeatIndex === this.currentSeat ? this.pickedDiscardTileId : null,
      pickedDiscardFromSeat:
        viewerSeatIndex === this.currentSeat ? this.pickedDiscardFromSeat : null,
      committedMeldThisTurn:
        viewerSeatIndex === this.currentSeat ? this.committedMeldThisTurn : false,
      turnEndsAt: this.turnEndsAt,
      roundSummary: this.roundSummary,
      roundHistory: this.roundHistory,
      lastEvent: this.lastEvent,
      viewerSeatIndex,
      seats: this.seats.map((s) => ({
        seatIndex: s.seatIndex,
        teamIndex: s.seatIndex % 2,
        name: s.name,
        avatar: s.avatar,
        isBot: s.isBot,
        connected: s.connected,
        tileCount: s.seatIndex === viewerSeatIndex ? s.hand.length : null,
        opened: s.opened,
        openMode: s.openMode,
        openedPoints: s.openedPoints,
        roundPenalties: s.roundPenalties,
        totalScore: s.totalScore,
        hand: s.seatIndex === viewerSeatIndex ? s.hand : null
      }))
    };
  }

  getAdminSnapshot() {
    return {
      phase: this.phase,
      okeyTarget: this.okeyTarget,
      gosterge: this.gosterge,
      deck: this.deck.map((t) => ({ ...t })),
      seats: this.seats.map((s) => ({
        seatIndex: s.seatIndex,
        name: s.name,
        isBot: s.isBot,
        hand: s.hand.map((t) => ({ ...t }))
      }))
    };
  }

  adminSwapTile({ actorSeatIndex, myTileId, sourceKind, targetSeatIndex, targetTileId }) {
    if (this.phase !== 'playing') {
      return { ok: false, error: 'Aktif el yok.' };
    }
    const actorSeat = this.seats[actorSeatIndex];
    if (!actorSeat || actorSeat.hand.length === 0) {
      return { ok: false, error: 'Elinizde takas edilecek taş yok.' };
    }

    let myIdx = myTileId ? actorSeat.hand.findIndex((t) => t.id === myTileId) : -1;
    if (myIdx === -1) {
      myIdx = actorSeat.hand.findIndex(
        (t) => !isOkeyTile(t, this.okeyTarget) && t.id !== this.pickedDiscardTileId
      );
      if (myIdx === -1) {
        myIdx = actorSeat.hand.findIndex((t) => !isOkeyTile(t, this.okeyTarget));
      }
      if (myIdx === -1) myIdx = 0;
    }

    const myTile = actorSeat.hand[myIdx];

    if (sourceKind === 'deck') {
      const deckIdx = this.deck.findIndex((t) => t.id === targetTileId);
      if (deckIdx === -1) {
        return { ok: false, error: 'Taş destede bulunamadı.' };
      }
      const targetTile = this.deck[deckIdx];
      actorSeat.hand[myIdx] = targetTile;
      this.deck[deckIdx] = myTile;
      if (myTile.id === this.pickedDiscardTileId) {
        this.pickedDiscardTileId = null;
        this.pickedDiscardFromSeat = null;
      }
      this.notify();
      return { ok: true, takenTile: targetTile };
    }

    if (sourceKind === 'seat') {
      const otherSeat = this.seats[Number(targetSeatIndex)];
      if (!otherSeat || otherSeat.seatIndex === actorSeatIndex) {
        return { ok: false, error: 'Geçersiz hedef koltuk.' };
      }
      const otherIdx = otherSeat.hand.findIndex((t) => t.id === targetTileId);
      if (otherIdx === -1) {
        return { ok: false, error: 'Taş rakip elinde bulunamadı.' };
      }
      const targetTile = otherSeat.hand[otherIdx];
      actorSeat.hand[myIdx] = targetTile;
      otherSeat.hand[otherIdx] = myTile;
      if (myTile.id === this.pickedDiscardTileId || targetTile.id === this.pickedDiscardTileId) {
        this.pickedDiscardTileId = null;
        this.pickedDiscardFromSeat = null;
      }
      this.notify();
      return { ok: true, takenTile: targetTile };
    }

    return { ok: false, error: 'Geçersiz kaynak.' };
  }

  adminStealOkey(actorSeatIndex, myTileId) {
    if (this.phase !== 'playing') {
      return { ok: false, error: 'Aktif el yok.' };
    }
    const deckOkey = this.deck.find((t) => isOkeyTile(t, this.okeyTarget));
    if (deckOkey) {
      return this.adminSwapTile({
        actorSeatIndex,
        myTileId,
        sourceKind: 'deck',
        targetTileId: deckOkey.id
      });
    }
    for (const s of this.seats) {
      if (s.seatIndex === actorSeatIndex) continue;
      const oppOkey = s.hand.find((t) => isOkeyTile(t, this.okeyTarget));
      if (oppOkey) {
        return this.adminSwapTile({
          actorSeatIndex,
          myTileId,
          sourceKind: 'seat',
          targetSeatIndex: s.seatIndex,
          targetTileId: oppOkey.id
        });
      }
    }
    return { ok: false, error: 'Masada çalınacak boşta Okey kalmadı.' };
  }

  notify() {
    if (this.onStateChange) {
      this.onStateChange(this);
    }
  }
}
