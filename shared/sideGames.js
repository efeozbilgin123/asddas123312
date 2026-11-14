import { pickRandomBotAvatar, pickRandomBotName, PRESET_AVATAR_COUNT } from './presets.js';

export const SIDE_TABLE_DEFS = Object.freeze([
  {
    id: 'pisti',
    kind: 'pisti',
    title: 'Pişti Masası',
    subtitle: '2-4 Kişilik Pişti',
    x: -29,
    z: -21,
    rotY: 0.14,
    maxSeats: 4,
    minPlayers: 2,
    shape: 'square',
    props: 'cards'
  },
  {
    id: 'papazkacti',
    kind: 'papazkacti',
    title: 'Papaz Kaçtı',
    subtitle: 'Kimde K♠ Kalacak?',
    x: -29,
    z: 0,
    rotY: 0,
    maxSeats: 4,
    minPlayers: 2,
    shape: 'square',
    props: 'cards'
  },
  {
    id: 'sohbet-1',
    kind: 'chat',
    title: 'Sohbet Masası 1',
    subtitle: 'Çay & Muhabbet Köşesi',
    x: -29,
    z: 21,
    rotY: -0.15,
    maxSeats: 4,
    minPlayers: 0,
    shape: 'round',
    props: 'tea'
  },
  {
    id: 'batak',
    kind: 'batak',
    title: 'Batak Masası',
    subtitle: '4 Kişilik Koz Maça',
    x: -10,
    z: 26,
    rotY: 0.08,
    maxSeats: 4,
    minPlayers: 4,
    shape: 'square',
    props: 'cards'
  },
  {
    id: 'sohbet-2',
    kind: 'chat',
    title: 'Tavla & Çay Köşesi',
    subtitle: 'Serbest Takılma Masası',
    x: 11,
    z: 26,
    rotY: -0.12,
    maxSeats: 4,
    minPlayers: 0,
    shape: 'square',
    props: 'tavla'
  },
  {
    id: 'poker',
    kind: 'poker',
    title: "Texas Hold'em Poker",
    subtitle: '2-4 Kişilik Masa',
    x: 28,
    z: -21,
    rotY: -0.18,
    maxSeats: 4,
    minPlayers: 2,
    shape: 'oval',
    props: 'chips'
  }
]);

export const SIDE_TABLE_MAP = new Map(SIDE_TABLE_DEFS.map((d) => [d.id, d]));

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 11=J, 12=Q, 13=K, 14=A
const SUIT_SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const RANK_LABELS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export function formatCardLabel(card) {
  if (!card) return '';
  const r = RANK_LABELS[card.rank] || String(card.rank);
  const s = SUIT_SYMBOLS[card.suit] || '';
  return `${r}${s}`;
}

export function createStandardDeck() {
  const deck = [];
  let seq = 1;
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `c-${seq++}-${suit[0]}${rank}`,
        suit,
        rank,
        label: formatCardLabel({ suit, rank })
      });
    }
  }
  return shuffleCards(deck);
}

export function createPapazDeck() {
  const deck = [];
  let seq = 1;
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      if (rank === 13 && suit !== 'spades') continue; // Only K♠ stays unpaired (49 cards = 24 pairs + Papaz)
      deck.push({
        id: `pk-${seq++}-${suit[0]}${rank}`,
        suit,
        rank,
        label: formatCardLabel({ suit, rank })
      });
    }
  }
  return shuffleCards(deck);
}

export function shuffleCards(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function stripPairs(hand) {
  const byRank = new Map();
  for (const card of hand) {
    if (!byRank.has(card.rank)) byRank.set(card.rank, []);
    byRank.get(card.rank).push(card);
  }
  const kept = [];
  const discarded = [];
  for (const list of byRank.values()) {
    let i = 0;
    while (i + 1 < list.length) {
      discarded.push(list[i], list[i + 1]);
      i += 2;
    }
    if (i < list.length) {
      kept.push(list[i]);
    }
  }
  return { kept, discarded };
}

function scorePistiCard(card) {
  if (!card) return 0;
  if (card.rank === 14 || card.rank === 11) return 1;
  if (card.suit === 'clubs' && card.rank === 2) return 2;
  if (card.suit === 'diamonds' && card.rank === 10) return 3;
  return 0;
}

// 5-card Texas Hold'em evaluator
function eval5(cards) {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);

  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const groups = Array.from(counts.entries()).sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));

  const uniq = Array.from(new Set(ranks));
  let isStraight = false;
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) {
      isStraight = true;
      straightHigh = uniq[0];
    } else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) {
      isStraight = true;
      straightHigh = 5;
    }
  }

  let cat = 0;
  let tiebreakers = ranks;
  if (isStraight && isFlush) {
    cat = 8;
    tiebreakers = [straightHigh];
  } else if (groups[0][1] === 4) {
    cat = 7;
    tiebreakers = [groups[0][0], groups[1][0]];
  } else if (groups[0][1] === 3 && groups[1]?.[1] === 2) {
    cat = 6;
    tiebreakers = [groups[0][0], groups[1][0]];
  } else if (isFlush) {
    cat = 5;
    tiebreakers = ranks;
  } else if (isStraight) {
    cat = 4;
    tiebreakers = [straightHigh];
  } else if (groups[0][1] === 3) {
    cat = 3;
    tiebreakers = [groups[0][0], ...groups.slice(1).map((g) => g[0])];
  } else if (groups[0][1] === 2 && groups[1]?.[1] === 2) {
    cat = 2;
    tiebreakers = [groups[0][0], groups[1][0], groups[2][0]];
  } else if (groups[0][1] === 2) {
    cat = 1;
    tiebreakers = [groups[0][0], ...groups.slice(1).map((g) => g[0])];
  }

  let score = cat * 1e10;
  for (let i = 0; i < tiebreakers.length; i += 1) {
    score += tiebreakers[i] * Math.pow(16, 4 - i);
  }
  const catNames = [
    'Yüksek Kart',
    'Bir Çift',
    'İki Çift',
    'Üçlü',
    'Kent',
    'Floş',
    'Full House',
    'Kare',
    'Sıralı Floş'
  ];
  return { score, category: cat, name: catNames[cat] };
}

export function evaluatePokerHand(cards7) {
  if (!Array.isArray(cards7) || cards7.length < 5) {
    return { score: 0, category: 0, name: 'Yüksek Kart' };
  }
  let best = null;
  const n = cards7.length;
  for (let a = 0; a < n - 4; a += 1) {
    for (let b = a + 1; b < n - 3; b += 1) {
      for (let c = b + 1; c < n - 2; c += 1) {
        for (let d = c + 1; d < n - 1; d += 1) {
          for (let e = d + 1; e < n; e += 1) {
            const res = eval5([cards7[a], cards7[b], cards7[c], cards7[d], cards7[e]]);
            if (!best || res.score > best.score) {
              best = res;
            }
          }
        }
      }
    }
  }
  return best || { score: 0, category: 0, name: 'Yüksek Kart' };
}

export class SideTableSession {
  constructor(def, { onStateChange } = {}) {
    this.id = def.id;
    this.kind = def.kind;
    this.title = def.title;
    this.subtitle = def.subtitle;
    this.x = def.x;
    this.z = def.z;
    this.rotY = def.rotY || 0;
    this.maxSeats = def.maxSeats || 4;
    this.minPlayers = def.minPlayers ?? 2;
    this.shape = def.shape || 'square';
    this.props = def.props || 'cards';
    this.onStateChange = onStateChange || (() => {});

    this.seats = Array.from({ length: this.maxSeats }, (_, idx) => ({
      seatIndex: idx,
      type: 'empty', // 'empty' | 'human' | 'bot'
      playerId: null,
      name: null,
      avatar: `avatar-${((idx + 2) % PRESET_AVATAR_COUNT) + 1}`,
      connected: false,
      hand: [],
      score: 0,
      chips: this.kind === 'poker' ? 1000 : 0,
      capturedCount: 0,
      pistiPoints: 0,
      tricksWon: 0,
      bid: null,
      bet: 0,
      folded: false,
      acted: false,
      out: false
    }));

    this.phase = this.kind === 'chat' ? 'hangout' : 'waiting';
    this.currentSeat = 0;
    this.dealerSeat = 0;
    this.roundNumber = 0;
    this.deck = [];
    this.centerCards = []; // Pişti pile or Poker community cards
    this.trickCards = []; // Batak current trick: [{ seatIndex, card }]
    this.lastCaptureSeat = null;
    this.trumpSuit = 'spades';
    this.pot = 0;
    this.currentBet = 0;
    this.pokerStage = 'preflop'; // preflop | flop | turn | river | showdown
    this.winnerText = '';
    this.statusMessage = this.kind === 'chat'
      ? 'Oturup çay eşliğinde sohbet edebilirsiniz.'
      : `${this.title} hazır.`;
    this.botTimer = null;
  }

  destroy() {
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
  }

  emitChange() {
    this.onStateChange(this);
  }

  findHumanSeat(playerId) {
    return this.seats.find((s) => s.type === 'human' && s.playerId === playerId) || null;
  }

  getActiveSeats() {
    return this.seats.filter((s) => s.type !== 'empty');
  }

  assignBot(seatIndex) {
    const seat = this.seats[seatIndex];
    if (!seat) return null;
    const usedNames = this.seats.filter((s) => s.name).map((s) => s.name);
    const usedAvatars = this.seats.filter((s) => s.type !== 'empty').map((s) => s.avatar);
    seat.type = 'bot';
    seat.playerId = `side-bot-${this.id}-${seatIndex}`;
    seat.name = pickRandomBotName(usedNames);
    seat.avatar = pickRandomBotAvatar(usedAvatars);
    seat.connected = true;
    return seat;
  }

  sitHuman({ playerId, playerName, playerAvatar, seatIndex = null }) {
    const existing = this.findHumanSeat(playerId);
    if (existing) {
      existing.connected = true;
      if (playerName) existing.name = String(playerName).trim().slice(0, 20) || existing.name;
      if (playerAvatar) existing.avatar = playerAvatar;
      this.emitChange();
      return { ok: true, seatIndex: existing.seatIndex };
    }

    const reqIdx = seatIndex !== null && seatIndex !== undefined ? Number(seatIndex) : null;
    const canTake = (s) =>
      s &&
      (s.type === 'empty' || s.type === 'bot' || (s.type === 'human' && !s.connected));

    let target = null;
    if (reqIdx !== null && Number.isInteger(reqIdx) && canTake(this.seats[reqIdx])) {
      target = this.seats[reqIdx];
    } else {
      target =
        this.seats.find((s) => s.type === 'empty') ||
        this.seats.find((s) => s.type === 'human' && !s.connected) ||
        this.seats.find((s) => s.type === 'bot') ||
        null;
    }

    if (!target) {
      return { ok: false, error: `${this.title} masası şu an tamamen dolu.` };
    }

    const wasBot = target.type === 'bot';
    target.type = 'human';
    target.playerId = playerId;
    target.name = (typeof playerName === 'string' ? playerName.trim().slice(0, 20) : '') || `Oyuncu ${target.seatIndex + 1}`;
    target.avatar = playerAvatar || target.avatar;
    target.connected = true;
    if (!wasBot && this.kind === 'poker' && target.chips <= 0) {
      target.chips = 1000;
    }

    if (wasBot && this.phase === 'playing' && this.currentSeat === target.seatIndex && this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
    this.emitChange();
    return { ok: true, seatIndex: target.seatIndex };
  }

  standHuman(playerId, { convertToBotIfActive = true } = {}) {
    const seat = this.findHumanSeat(playerId);
    if (!seat) return { ok: false, error: 'Bu masada oturmuyorsunuz.' };

    const otherHuman = this.seats.some((s) => s.seatIndex !== seat.seatIndex && s.type === 'human' && s.connected);
    if (this.phase === 'playing' && otherHuman && convertToBotIfActive && this.kind !== 'chat') {
      seat.type = 'bot';
      seat.playerId = `side-bot-${this.id}-${seat.seatIndex}`;
      seat.name = `${seat.name || 'Oyuncu'} (Bot)`;
      seat.connected = true;
      this.statusMessage = `${seat.name} masayı devraldı.`;
      this.scheduleBotIfNeeded();
    } else {
      seat.type = 'empty';
      seat.playerId = null;
      seat.name = null;
      seat.connected = false;
      seat.hand = [];
      seat.folded = true;
      if (this.phase === 'playing' && !otherHuman && this.kind !== 'chat') {
        this.destroy();
        this.phase = 'waiting';
        this.statusMessage = `${this.title} bekliyor.`;
      }
    }
    this.emitChange();
    return { ok: true };
  }

  toggleBotSeat(seatIndex) {
    if (this.kind === 'chat') {
      return { ok: false, error: 'Sohbet masasına bot eklenmez.' };
    }
    if (this.phase === 'playing') {
      return { ok: false, error: 'Oyun devam ederken bot değiştirilemez.' };
    }
    const idx = Number(seatIndex);
    const seat = this.seats[idx];
    if (!seat) return { ok: false, error: 'Geçersiz koltuk.' };
    if (seat.type === 'human') return { ok: false, error: 'Bu koltukta gerçek oyuncu oturuyor.' };

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

  startMatch({ autoFillBot = true } = {}) {
    if (this.kind === 'chat') {
      return { ok: false, error: 'Burası serbest sohbet masasıdır.' };
    }
    this.destroy();

    if (autoFillBot) {
      while (this.getActiveSeats().length < this.minPlayers) {
        const empty = this.seats.find((s) => s.type === 'empty');
        if (!empty) break;
        this.assignBot(empty.seatIndex);
      }
    }
    const active = this.getActiveSeats();
    if (active.length < this.minPlayers) {
      return { ok: false, error: `${this.title} için en az ${this.minPlayers} oyuncu gerekiyor.` };
    }

    this.roundNumber += 1;
    this.phase = 'playing';
    this.winnerText = '';
    this.centerCards = [];
    this.trickCards = [];
    this.lastCaptureSeat = null;
    this.pot = 0;
    this.currentBet = 0;

    for (const s of this.seats) {
      s.hand = [];
      s.capturedCount = 0;
      s.pistiPoints = 0;
      s.tricksWon = 0;
      s.bid = null;
      s.bet = 0;
      s.folded = s.type === 'empty';
      s.acted = false;
      s.out = s.type === 'empty';
    }

    if (this.kind === 'pisti') {
      this.deck = createStandardDeck();
      this.centerCards = this.deck.splice(0, 4);
      for (const s of active) {
        s.hand = this.deck.splice(0, 4);
      }
      this.currentSeat = active[0].seatIndex;
      this.statusMessage = `Pişti başladı! Sıra ${this.seats[this.currentSeat].name}'da.`;
    } else if (this.kind === 'papazkacti') {
      this.deck = createPapazDeck();
      let idx = 0;
      while (this.deck.length > 0) {
        active[idx % active.length].hand.push(this.deck.pop());
        idx += 1;
      }
      for (const s of active) {
        const stripped = stripPairs(s.hand);
        s.hand = stripped.kept;
        s.out = s.hand.length === 0;
      }
      if (this.checkPapazEnd()) {
        this.emitChange();
        return { ok: true };
      }
      const starter = active.find((s) => !s.out) || active[0];
      this.currentSeat = starter.seatIndex;
      this.statusMessage = `Papaz Kaçtı başladı! Sıra ${starter.name}'da.`;
    } else if (this.kind === 'poker') {
      this.deck = createStandardDeck();
      for (const s of active) {
        if (s.chips <= 0) s.chips = 1000;
        s.hand = this.deck.splice(0, 2);
        s.folded = false;
        s.acted = false;
        s.bet = 0;
      }
      this.pokerStage = 'preflop';
      const order = active.map((s) => s.seatIndex);
      const dPos = this.roundNumber % order.length;
      const sbSeat = this.seats[order[(dPos + 1) % order.length]];
      const bbSeat = this.seats[order[(dPos + 2) % order.length]];
      const sbAmt = Math.min(10, sbSeat.chips);
      sbSeat.chips -= sbAmt;
      sbSeat.bet = sbAmt;
      const bbAmt = Math.min(20, bbSeat.chips);
      bbSeat.chips -= bbAmt;
      bbSeat.bet = bbAmt;
      this.pot = sbAmt + bbAmt;
      this.currentBet = bbAmt;
      this.currentSeat = order[(dPos + 3) % order.length];
      this.statusMessage = `Hold'em El #${this.roundNumber} · Pot: ${this.pot} · Sıra ${this.seats[this.currentSeat].name}'da.`;
    } else if (this.kind === 'batak') {
      this.deck = createStandardDeck();
      for (const s of active) {
        s.hand = this.deck.splice(0, 13).sort((a, b) => {
          if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
          return a.rank - b.rank;
        });
      }
      this.trumpSuit = 'spades';
      this.batakSubPhase = 'bidding';
      this.currentSeat = active[0].seatIndex;
      this.statusMessage = `Batak İhale: ${this.seats[this.currentSeat].name} el tahminini seçiyor.`;
    }

    this.emitChange();
    this.scheduleBotIfNeeded();
    return { ok: true };
  }

  nextActiveSeatIndex(fromSeatIdx, predicate = (s) => s.type !== 'empty') {
    for (let offset = 1; offset <= this.maxSeats; offset += 1) {
      const idx = (fromSeatIdx + offset) % this.maxSeats;
      const seat = this.seats[idx];
      if (seat && predicate(seat)) return idx;
    }
    return null;
  }

  performAction(playerId, action, payload = {}, { isBotAction = false } = {}) {
    if (this.phase !== 'playing') {
      return { ok: false, error: 'Aktif oyun yok.' };
    }
    const seat = this.seats[this.currentSeat];
    if (!seat) return { ok: false, error: 'Geçersiz sıra.' };
    if (!isBotAction) {
      if (seat.type !== 'human' || seat.playerId !== playerId) {
        return { ok: false, error: 'Sıra sizde değil.' };
      }
    }

    if (this.kind === 'pisti') return this.handlePistiAction(seat, action, payload);
    if (this.kind === 'papazkacti') return this.handlePapazAction(seat, action, payload);
    if (this.kind === 'poker') return this.handlePokerAction(seat, action, payload);
    if (this.kind === 'batak') return this.handleBatakAction(seat, action, payload);
    return { ok: false, error: 'Desteklenmeyen masa oyunu.' };
  }

  handlePistiAction(seat, action, payload) {
    if (action !== 'playCard') return { ok: false, error: 'Geçersiz Pişti hamlesi.' };
    const cardIdx = seat.hand.findIndex((c) => c.id === payload?.cardId);
    if (cardIdx < 0) return { ok: false, error: 'Bu kart elinizde değil.' };
    const [card] = seat.hand.splice(cardIdx, 1);

    const topCard = this.centerCards[this.centerCards.length - 1] || null;
    const isMatch = topCard && (card.rank === topCard.rank || card.rank === 11);

    this.centerCards.push(card);
    if (isMatch) {
      const wasPisti = this.centerCards.length === 2;
      let pts = 0;
      for (const c of this.centerCards) pts += scorePistiCard(c);
      if (wasPisti) {
        pts += card.rank === 11 && topCard.rank === 11 ? 20 : 10;
      }
      seat.capturedCount += this.centerCards.length;
      seat.pistiPoints += pts;
      this.lastCaptureSeat = seat.seatIndex;
      this.centerCards = [];
      this.statusMessage = wasPisti
        ? `${seat.name} PİŞTİ yaptı! (+${pts} puan)`
        : `${seat.name} ${card.label} ile ortayı topladı!`;
    } else {
      this.statusMessage = `${seat.name} ${card.label} attı.`;
    }

    const active = this.getActiveSeats();
    const allEmpty = active.every((s) => s.hand.length === 0);
    if (allEmpty) {
      if (this.deck.length >= active.length) {
        const perSeat = Math.min(4, Math.floor(this.deck.length / active.length));
        for (const s of active) {
          s.hand = this.deck.splice(0, perSeat);
        }
        const nextSeat = this.nextActiveSeatIndex(seat.seatIndex);
        this.currentSeat = nextSeat ?? active[0].seatIndex;
        this.statusMessage += ` Yeni 4 kart dağıtıldı. Sıra ${this.seats[this.currentSeat].name}'da.`;
      } else {
        // Remainder goes to last capturer
        if (this.centerCards.length > 0 && this.lastCaptureSeat !== null) {
          const capSeat = this.seats[this.lastCaptureSeat];
          if (capSeat) {
            capSeat.capturedCount += this.centerCards.length;
            for (const c of this.centerCards) capSeat.pistiPoints += scorePistiCard(c);
          }
          this.centerCards = [];
        }
        // Majority cards bonus (+3)
        let bestCap = -1;
        let majoritySeat = null;
        let tied = false;
        for (const s of active) {
          if (s.capturedCount > bestCap) {
            bestCap = s.capturedCount;
            majoritySeat = s;
            tied = false;
          } else if (s.capturedCount === bestCap) {
            tied = true;
          }
        }
        if (majoritySeat && !tied) {
          majoritySeat.pistiPoints += 3;
        }
        for (const s of active) {
          s.score += s.pistiPoints;
        }
        const sorted = [...active].sort((a, b) => b.pistiPoints - a.pistiPoints);
        this.phase = 'gameOver';
        this.winnerText = `${sorted[0].name} Pişti'yi kazandı (${sorted[0].pistiPoints} puan)!`;
        this.statusMessage = this.winnerText;
        this.destroy();
        this.emitChange();
        return { ok: true };
      }
    } else {
      const nextSeat = this.nextActiveSeatIndex(seat.seatIndex, (s) => s.type !== 'empty' && s.hand.length > 0);
      this.currentSeat = nextSeat ?? seat.seatIndex;
    }

    this.emitChange();
    this.scheduleBotIfNeeded();
    return { ok: true };
  }

  checkPapazEnd() {
    const remaining = this.seats.filter((s) => s.type !== 'empty' && s.hand.length > 0);
    if (remaining.length <= 1) {
      const loser = remaining[0];
      for (const s of this.getActiveSeats()) {
        if (!loser || s.seatIndex !== loser.seatIndex) s.score += 1;
      }
      this.phase = 'gameOver';
      this.winnerText = loser
        ? `Papaz ${loser.name}'da kaldı! Diğer oyuncular kazandı.`
        : 'Papaz Kaçtı bitti!';
      this.statusMessage = this.winnerText;
      this.destroy();
      return true;
    }
    return false;
  }

  handlePapazAction(seat, action, payload) {
    if (action !== 'drawCard') return { ok: false, error: 'Kart çekmelisiniz.' };
    const targetIdx = this.nextActiveSeatIndex(
      seat.seatIndex,
      (s) => s.type !== 'empty' && s.seatIndex !== seat.seatIndex && s.hand.length > 0
    );
    if (targetIdx === null) {
      this.checkPapazEnd();
      this.emitChange();
      return { ok: true };
    }
    const target = this.seats[targetIdx];
    const pickIdx = Number.isInteger(Number(payload?.pickIndex))
      ? Math.max(0, Math.min(target.hand.length - 1, Number(payload.pickIndex)))
      : Math.floor(Math.random() * target.hand.length);

    const [drawn] = target.hand.splice(pickIdx, 1);
    target.out = target.hand.length === 0;
    seat.hand.push(drawn);
    const stripped = stripPairs(seat.hand);
    seat.hand = stripped.kept;
    seat.out = seat.hand.length === 0;

    this.statusMessage = stripped.discarded.length > 0
      ? `${seat.name} kart çekti ve çift attı!`
      : `${seat.name} ${target.name}'dan kart çekti.`;

    if (!this.checkPapazEnd()) {
      const nextTurn = this.nextActiveSeatIndex(
        seat.seatIndex,
        (s) => s.type !== 'empty' && s.hand.length > 0
      );
      this.currentSeat = nextTurn ?? seat.seatIndex;
      this.scheduleBotIfNeeded();
    }

    this.emitChange();
    return { ok: true };
  }

  handlePokerAction(seat, action, payload) {
    const activeInHand = () => this.seats.filter((s) => s.type !== 'empty' && !s.folded);
    const toCall = Math.max(0, this.currentBet - seat.bet);

    if (action === 'fold') {
      seat.folded = true;
      seat.acted = true;
      this.statusMessage = `${seat.name} çekildi (Fold).`;
    } else if (action === 'check') {
      if (toCall > 0) return { ok: false, error: `Görmek için ${toCall} chip gerekiyor.` };
      seat.acted = true;
      this.statusMessage = `${seat.name} pas geçti (Check).`;
    } else if (action === 'call') {
      const pay = Math.min(toCall, seat.chips);
      seat.chips -= pay;
      seat.bet += pay;
      this.pot += pay;
      seat.acted = true;
      this.statusMessage = toCall === 0 ? `${seat.name} pas geçti.` : `${seat.name} gördü (${pay}).`;
    } else if (action === 'raise') {
      const raiseAdd = Math.max(20, Math.min(200, Number(payload?.amount) || 20));
      const totalNeeded = Math.min(seat.chips, toCall + raiseAdd);
      if (totalNeeded <= 0) return { ok: false, error: 'Yeterli chip yok.' };
      seat.chips -= totalNeeded;
      seat.bet += totalNeeded;
      this.pot += totalNeeded;
      if (seat.bet > this.currentBet) {
        this.currentBet = seat.bet;
        for (const s of activeInHand()) {
          if (s.seatIndex !== seat.seatIndex) s.acted = false;
        }
      }
      seat.acted = true;
      this.statusMessage = `${seat.name} artırdı -> ${this.currentBet} (Pot: ${this.pot}).`;
    } else {
      return { ok: false, error: 'Geçersiz Poker hamlesi.' };
    }

    const contenders = activeInHand();
    if (contenders.length <= 1) {
      const winner = contenders[0];
      if (winner) {
        winner.chips += this.pot;
        winner.score += 1;
        this.winnerText = `Herkes çekildi! ${winner.name} ${this.pot} chip kazandı.`;
      } else {
        this.winnerText = 'El tamamlandı.';
      }
      this.phase = 'gameOver';
      this.pokerStage = 'showdown';
      this.statusMessage = this.winnerText;
      this.destroy();
      this.emitChange();
      return { ok: true };
    }

    const needAction = contenders.filter(
      (s) => s.chips > 0 && (!s.acted || s.bet < this.currentBet)
    );

    if (needAction.length === 0) {
      for (const s of contenders) {
        s.bet = 0;
        s.acted = false;
      }
      this.currentBet = 0;
      if (this.pokerStage === 'preflop') {
        this.pokerStage = 'flop';
        this.centerCards.push(...this.deck.splice(0, 3));
      } else if (this.pokerStage === 'flop') {
        this.pokerStage = 'turn';
        this.centerCards.push(...this.deck.splice(0, 1));
      } else if (this.pokerStage === 'turn') {
        this.pokerStage = 'river';
        this.centerCards.push(...this.deck.splice(0, 1));
      } else {
        // Showdown
        this.pokerStage = 'showdown';
        let bestScore = -1;
        let winners = [];
        let bestHandName = '';
        for (const s of contenders) {
          const evalRes = evaluatePokerHand([...s.hand, ...this.centerCards]);
          s.handEvalName = evalRes.name;
          if (evalRes.score > bestScore) {
            bestScore = evalRes.score;
            winners = [s];
            bestHandName = evalRes.name;
          } else if (evalRes.score === bestScore) {
            winners.push(s);
          }
        }
        const split = Math.floor(this.pot / Math.max(1, winners.length));
        for (const w of winners) {
          w.chips += split;
          w.score += 1;
        }
        this.phase = 'gameOver';
        this.winnerText = winners.length > 1
          ? `Berabere (${bestHandName})! ${winners.map((w) => w.name).join(', ')} potu paylaştı.`
          : `${winners[0].name} ${bestHandName} ile ${this.pot} chip kazandı!`;
        this.statusMessage = this.winnerText;
        this.destroy();
        this.emitChange();
        return { ok: true };
      }

      const nextIdx = this.nextActiveSeatIndex(
        this.dealerSeat,
        (s) => s.type !== 'empty' && !s.folded && s.chips > 0
      );
      if (nextIdx === null) {
        // Everyone all-in -> fast forward to showdown
        while (this.centerCards.length < 5 && this.deck.length > 0) {
          this.centerCards.push(this.deck.shift());
        }
        return this.handlePokerAction(contenders[0], 'check', {}, { isBotAction: true });
      }
      this.currentSeat = nextIdx;
      this.statusMessage = `${this.pokerStage.toUpperCase()} · Pot: ${this.pot} · Sıra ${this.seats[this.currentSeat].name}'da.`;
    } else {
      const nextIdx = this.nextActiveSeatIndex(
        seat.seatIndex,
        (s) => s.type !== 'empty' && !s.folded && s.chips > 0 && (!s.acted || s.bet < this.currentBet)
      );
      this.currentSeat = nextIdx ?? seat.seatIndex;
    }

    this.emitChange();
    this.scheduleBotIfNeeded();
    return { ok: true };
  }

  getLegalBatakCardIds(seat) {
    if (!seat || !Array.isArray(seat.hand)) return [];
    if (this.trickCards.length === 0) {
      return seat.hand.map((c) => c.id);
    }
    const leadSuit = this.trickCards[0].card.suit;
    const followCards = seat.hand.filter((c) => c.suit === leadSuit);
    if (followCards.length > 0) {
      const highestLead = Math.max(
        ...this.trickCards.filter((t) => t.card.suit === leadSuit).map((t) => t.card.rank)
      );
      const trumpedAlready = this.trickCards.some(
        (t) => t.card.suit === this.trumpSuit && leadSuit !== this.trumpSuit
      );
      if (!trumpedAlready) {
        const higher = followCards.filter((c) => c.rank > highestLead);
        if (higher.length > 0) return higher.map((c) => c.id);
      }
      return followCards.map((c) => c.id);
    }
    const trumps = seat.hand.filter((c) => c.suit === this.trumpSuit);
    if (trumps.length > 0) {
      const existingTrumps = this.trickCards.filter((t) => t.card.suit === this.trumpSuit);
      if (existingTrumps.length > 0) {
        const highTrump = Math.max(...existingTrumps.map((t) => t.card.rank));
        const higherTrumps = trumps.filter((c) => c.rank > highTrump);
        if (higherTrumps.length > 0) return higherTrumps.map((c) => c.id);
      }
      return trumps.map((c) => c.id);
    }
    return seat.hand.map((c) => c.id);
  }

  handleBatakAction(seat, action, payload) {
    if (this.batakSubPhase === 'bidding') {
      if (action !== 'bid') return { ok: false, error: 'Önce el tahmininizi seçin.' };
      const bidVal = Math.max(1, Math.min(13, Number(payload?.bid) || 3));
      seat.bid = bidVal;
      const nextBidder = this.nextActiveSeatIndex(seat.seatIndex, (s) => s.type !== 'empty' && s.bid === null);
      if (nextBidder === null) {
        this.batakSubPhase = 'playing';
        let bestSeat = this.seats[0];
        for (const s of this.getActiveSeats()) {
          if ((s.bid || 0) > (bestSeat.bid || 0)) bestSeat = s;
        }
        this.currentSeat = bestSeat.seatIndex;
        this.statusMessage = `Koz ♠ · Başlangıç: ${bestSeat.name} (${bestSeat.bid} el hedefi).`;
      } else {
        this.currentSeat = nextBidder;
        this.statusMessage = `${seat.name} ${bidVal} dedi. Sıra ${this.seats[nextBidder].name}'da.`;
      }
      this.emitChange();
      this.scheduleBotIfNeeded();
      return { ok: true };
    }

    if (action !== 'playCard') return { ok: false, error: 'Geçersiz Batak hamlesi.' };
    const legalIds = new Set(this.getLegalBatakCardIds(seat));
    if (!legalIds.has(payload?.cardId)) {
      return { ok: false, error: 'Batak kurallarına uygun kart oynamalısınız.' };
    }
    const idx = seat.hand.findIndex((c) => c.id === payload.cardId);
    const [card] = seat.hand.splice(idx, 1);
    this.trickCards.push({ seatIndex: seat.seatIndex, card });

    if (this.trickCards.length < 4) {
      const nextIdx = this.nextActiveSeatIndex(seat.seatIndex);
      this.currentSeat = nextIdx ?? seat.seatIndex;
      this.statusMessage = `${seat.name} ${card.label} oynadı.`;
    } else {
      const leadSuit = this.trickCards[0].card.suit;
      let winnerEntry = this.trickCards[0];
      for (const entry of this.trickCards.slice(1)) {
        const curTrump = winnerEntry.card.suit === this.trumpSuit;
        const candTrump = entry.card.suit === this.trumpSuit;
        if (candTrump && !curTrump) {
          winnerEntry = entry;
        } else if (candTrump === curTrump && entry.card.suit === winnerEntry.card.suit && entry.card.rank > winnerEntry.card.rank) {
          winnerEntry = entry;
        } else if (!curTrump && !candTrump && entry.card.suit === leadSuit && winnerEntry.card.suit !== leadSuit) {
          winnerEntry = entry;
        }
      }
      const winSeat = this.seats[winnerEntry.seatIndex];
      winSeat.tricksWon += 1;
      this.trickCards = [];

      const anyCardsLeft = this.getActiveSeats().some((s) => s.hand.length > 0);
      if (!anyCardsLeft) {
        for (const s of this.getActiveSeats()) {
          const targetBid = s.bid || 1;
          const delta = s.tricksWon >= targetBid
            ? targetBid * 10 + (s.tricksWon - targetBid)
            : -targetBid * 10;
          s.score += delta;
        }
        const sorted = [...this.getActiveSeats()].sort((a, b) => b.score - a.score);
        this.phase = 'gameOver';
        this.winnerText = `Batak eli bitti! Lider: ${sorted[0].name} (${sorted[0].score} puan).`;
        this.statusMessage = this.winnerText;
        this.destroy();
      } else {
        this.currentSeat = winSeat.seatIndex;
        this.statusMessage = `Eli ${winSeat.name} aldı (${winSeat.tricksWon} el).`;
      }
    }

    this.emitChange();
    this.scheduleBotIfNeeded();
    return { ok: true };
  }

  scheduleBotIfNeeded() {
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
    if (this.phase !== 'playing') return;
    const seat = this.seats[this.currentSeat];
    if (!seat || seat.type !== 'bot') return;

    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      this.executeBotMove();
    }, 780);
    this.botTimer.unref?.();
  }

  executeBotMove() {
    if (this.phase !== 'playing') return;
    const seat = this.seats[this.currentSeat];
    if (!seat || seat.type !== 'bot') return;

    if (this.kind === 'pisti') {
      const top = this.centerCards[this.centerCards.length - 1] || null;
      let pick = top ? seat.hand.find((c) => c.rank === top.rank) : null;
      if (!pick && top && this.centerCards.length >= 2) {
        pick = seat.hand.find((c) => c.rank === 11);
      }
      if (!pick) {
        pick = seat.hand.find((c) => c.rank !== 11 && scorePistiCard(c) === 0) || seat.hand[0];
      }
      if (pick) this.performAction(seat.playerId, 'playCard', { cardId: pick.id }, { isBotAction: true });
    } else if (this.kind === 'papazkacti') {
      const targetIdx = this.nextActiveSeatIndex(
        seat.seatIndex,
        (s) => s.type !== 'empty' && s.seatIndex !== seat.seatIndex && s.hand.length > 0
      );
      const count = targetIdx !== null ? this.seats[targetIdx].hand.length : 1;
      const pickIndex = Math.floor(Math.random() * Math.max(1, count));
      this.performAction(seat.playerId, 'drawCard', { pickIndex }, { isBotAction: true });
    } else if (this.kind === 'poker') {
      const toCall = Math.max(0, this.currentBet - seat.bet);
      const roll = Math.random();
      if (toCall === 0) {
        if (roll > 0.78 && seat.chips >= 40) {
          this.performAction(seat.playerId, 'raise', { amount: 20 }, { isBotAction: true });
        } else {
          this.performAction(seat.playerId, 'check', {}, { isBotAction: true });
        }
      } else if (toCall <= 60 || roll > 0.35) {
        this.performAction(seat.playerId, 'call', {}, { isBotAction: true });
      } else {
        this.performAction(seat.playerId, 'fold', {}, { isBotAction: true });
      }
    } else if (this.kind === 'batak') {
      if (this.batakSubPhase === 'bidding') {
        const spades = seat.hand.filter((c) => c.suit === 'spades').length;
        const highs = seat.hand.filter((c) => c.rank >= 13).length;
        const bid = Math.max(2, Math.min(7, Math.round((spades + highs) * 0.65)));
        this.performAction(seat.playerId, 'bid', { bid }, { isBotAction: true });
      } else {
        const legalIds = this.getLegalBatakCardIds(seat);
        const pickId = legalIds[Math.floor(Math.random() * legalIds.length)];
        if (pickId) this.performAction(seat.playerId, 'playCard', { cardId: pickId }, { isBotAction: true });
      }
    }
  }

  getClientView(viewerPlayerId = null) {
    const viewerSeat = viewerPlayerId ? this.findHumanSeat(viewerPlayerId) : null;
    const mySeatIndex = viewerSeat ? viewerSeat.seatIndex : null;
    const isMyTurn = Boolean(viewerSeat && this.phase === 'playing' && this.currentSeat === viewerSeat.seatIndex);

    let drawTargetSeatIndex = null;
    let drawTargetCount = 0;
    let drawTargetName = '';
    if (this.kind === 'papazkacti' && this.phase === 'playing' && viewerSeat) {
      const tIdx = this.nextActiveSeatIndex(
        viewerSeat.seatIndex,
        (s) => s.type !== 'empty' && s.seatIndex !== viewerSeat.seatIndex && s.hand.length > 0
      );
      if (tIdx !== null) {
        drawTargetSeatIndex = tIdx;
        drawTargetCount = this.seats[tIdx].hand.length;
        drawTargetName = this.seats[tIdx].name || '';
      }
    }

    return {
      id: this.id,
      kind: this.kind,
      title: this.title,
      subtitle: this.subtitle,
      x: this.x,
      z: this.z,
      rotY: this.rotY,
      shape: this.shape,
      props: this.props,
      phase: this.phase,
      batakSubPhase: this.batakSubPhase || null,
      pokerStage: this.pokerStage,
      currentSeat: this.currentSeat,
      mySeatIndex,
      isMyTurn,
      roundNumber: this.roundNumber,
      deckCount: this.deck.length,
      pot: this.pot,
      currentBet: this.currentBet,
      trumpSuit: this.trumpSuit,
      winnerText: this.winnerText,
      statusMessage: this.statusMessage,
      centerCount: this.centerCards.length,
      centerTopCard: this.centerCards.length > 0 ? this.centerCards[this.centerCards.length - 1] : null,
      communityCards: this.kind === 'poker' ? this.centerCards : [],
      trickCards: this.trickCards.map((t) => ({ seatIndex: t.seatIndex, card: t.card })),
      drawTargetSeatIndex,
      drawTargetCount,
      drawTargetName,
      myHand: viewerSeat ? viewerSeat.hand : [],
      legalCardIds: isMyTurn && this.kind === 'batak' && this.batakSubPhase === 'playing'
        ? this.getLegalBatakCardIds(viewerSeat)
        : (isMyTurn && viewerSeat ? viewerSeat.hand.map((c) => c.id) : []),
      seats: this.seats.map((s) => ({
        seatIndex: s.seatIndex,
        type: s.type,
        name: s.name,
        avatar: s.avatar,
        connected: s.connected,
        handCount: s.hand.length,
        score: s.score,
        chips: s.chips,
        capturedCount: s.capturedCount,
        pistiPoints: s.pistiPoints,
        tricksWon: s.tricksWon,
        bid: s.bid,
        bet: s.bet,
        folded: s.folded,
        handEvalName: this.phase === 'gameOver' ? s.handEvalName || null : null,
        revealedHand: this.kind === 'poker' && this.phase === 'gameOver' && !s.folded ? s.hand : null
      }))
    };
  }
}
