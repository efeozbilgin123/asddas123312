import { createEmptyOrders, KAHVE_MENU_MAP } from '../shared/menu.js';
import { buildTvEmbedUrl, buildYouTubeEmbedUrl, parseMusicUrl, summarizeMusicQueue } from '../shared/music.js';
import {
  createEmptySocialStats,
  isPresetAvatar,
  KAHVE_CATS,
  KAHVE_QUICK_CHATS,
  normalizeRoomAmbiance,
  normalizeRoomAtmosphere,
  pickRandomBotAvatar,
  pickRandomBotName,
  PRESET_AVATAR_COUNT,
  TV_CHANNELS
} from '../shared/presets.js';
import { findAutoplayTrack, resolveMusicInput, resolveQueuedTrack, resolveTvInput } from './musicResolver.js';
import { GameSession } from './gameSession.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const QUICK_CHAT_MAP = new Map(KAHVE_QUICK_CHATS.map((q) => [q.id, q]));

function generateRoomCode(existing) {
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i += 1) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (existing.has(code));
  return code;
}

function normalizeAvatar(val, fallbackIdx = 0) {
  const s = String(val || '').trim();
  if (isPresetAvatar(s)) return s;
  if (
    s.length <= 180000 &&
    /^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)
  ) {
    return s;
  }
  return `avatar-${(fallbackIdx % PRESET_AVATAR_COUNT) + 1}`;
}

function assignBotIdentity(room, seat) {
  const otherSeats = room.seats.filter((s) => s.seatIndex !== seat.seatIndex);
  const usedNames = otherSeats.filter((s) => s.name).map((s) => s.name);
  const usedAvatars = otherSeats
    .filter((s) => s.type !== 'empty' && s.avatar)
    .map((s) => s.avatar);
  seat.name = pickRandomBotName(usedNames);
  seat.avatar = pickRandomBotAvatar(usedAvatars);
}

export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.playerToRoom = new Map();
  }

  getRoom(code) {
    if (!code) return null;
    return this.rooms.get(String(code).trim().toUpperCase()) || null;
  }

  listPublicRooms() {
    const list = [];
    for (const room of this.rooms.values()) {
      const humanCount = room.seats.filter((s) => s.type === 'human').length;
      const openSeats = room.seats.filter((s) => s.type === 'empty').length;
      list.push({
        code: room.code,
        name: room.name,
        status: room.status,
        humanCount,
        openSeats,
        options: room.options,
        createdAt: room.createdAt
      });
    }
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }

  createRoom({ playerId, playerName, playerAvatar, roomName, options = {}, quickStart = false, seatIndex = 0 }) {
    this.leaveCurrentRoom(playerId);

    const code = generateRoomCode(this.rooms);
    const cleanName = (typeof playerName === 'string' ? playerName.trim().slice(0, 20) : '') || 'Oyuncu 1';
    const cleanRoomName =
      (typeof roomName === 'string' ? roomName.trim().slice(0, 32) : '') || `${cleanName} Masası`;
    const opts = options && typeof options === 'object' ? options : {};
    const preferredSeat = [0, 1, 2, 3].includes(Number(seatIndex)) ? Number(seatIndex) : 0;

    const seats = [0, 1, 2, 3].map((idx) => (
      idx === preferredSeat
        ? { seatIndex: idx, type: 'human', playerId, name: cleanName, avatar: normalizeAvatar(playerAvatar, idx), connected: true }
        : { seatIndex: idx, type: 'empty', playerId: null, name: null, avatar: `avatar-${(idx % PRESET_AVATAR_COUNT) + 1}`, connected: false }
    ));

    const room = {
      code,
      name: cleanRoomName,
      hostPlayerId: playerId,
      status: 'waiting', // 'waiting' | 'playing'
      createdAt: Date.now(),
      cleanupTimer: null,
      music: null,
      musicQueue: [],
      musicQueueIndex: 0,
      musicAutoplay: true,
      musicHistory: [],
      tv: null,
      orders: createEmptyOrders(),
      lastOrder: null,
      orderSeq: 0,
      socialStats: createEmptySocialStats(),
      catPetSeq: 0,
      chatHistory: [],
      chatSeq: 0,
      nudgeSeq: 0,
      nudgeCooldowns: new Map(),
      options: {
        katlamali: Boolean(opts.katlamali),
        teamMode: opts.teamMode === 'paired' ? 'paired' : 'solo',
        maxRounds: [0, 3, 5, 7, 9].includes(Number(opts.maxRounds))
          ? Number(opts.maxRounds)
          : 5,
        islekPenalty: opts.islekPenalty !== false,
        turnSeconds: [45, 60, 90].includes(Number(opts.turnSeconds))
          ? Number(opts.turnSeconds)
          : 60,
        roomAtmosphere: normalizeRoomAtmosphere(opts.roomAtmosphere),
        roomAmbiance: normalizeRoomAmbiance(opts.roomAmbiance)
      },
      seats,
      session: null
    };

    this.rooms.set(code, room);
    this.playerToRoom.set(playerId, code);

    if (quickStart) {
      this.startGame(code, playerId);
    }

    this.broadcastRoomsList();
    return { ok: true, room };
  }

  joinRoom({ roomCode, playerId, playerName, playerAvatar }) {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: 'Bu kodla bir masa bulunamadı.' };
    }

    const cleanName = (typeof playerName === 'string' ? playerName.trim().slice(0, 20) : '') || 'Oyuncu';

    // Check if player is reconnecting to an existing seat in this room
    const existingSeat = room.seats.find(
      (s) => s.type === 'human' && s.playerId === playerId
    );
    if (existingSeat) {
      if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
      }
      existingSeat.connected = true;
      existingSeat.name = cleanName;
      if (playerAvatar) existingSeat.avatar = normalizeAvatar(playerAvatar, existingSeat.seatIndex);
      this.playerToRoom.set(playerId, code);
      if (room.session) {
        room.session.updateSeatConnection(existingSeat.seatIndex, {
          name: cleanName,
          avatar: existingSeat.avatar,
          connected: true
        });
      }
      this.broadcastRoomState(room);
      return { ok: true, room, seatIndex: existingSeat.seatIndex };
    }

    this.leaveCurrentRoom(playerId);

    if (room.status === 'playing') {
      const openSeat = room.seats.find(
        (s) => s.type === 'empty' || (s.type === 'human' && !s.connected)
      );
      if (!openSeat) {
        return { ok: false, error: 'Bu masa dolu ve oyun devam ediyor.' };
      }
      if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
      }
      const prevPlayerId = openSeat.playerId;
      if (prevPlayerId) {
        this.playerToRoom.delete(prevPlayerId);
        if (room.hostPlayerId === prevPlayerId) {
          room.hostPlayerId = playerId;
        }
      }
      openSeat.type = 'human';
      openSeat.playerId = playerId;
      openSeat.name = cleanName;
      openSeat.avatar = normalizeAvatar(playerAvatar, openSeat.seatIndex);
      openSeat.connected = true;
      this.playerToRoom.set(playerId, code);
      if (room.session) {
        room.session.updateSeatConnection(openSeat.seatIndex, {
          playerId,
          name: cleanName,
          avatar: openSeat.avatar,
          isBot: false,
          connected: true
        });
      }
      this.broadcastRoomState(room);
      this.broadcastRoomsList();
      return { ok: true, room, seatIndex: openSeat.seatIndex };
    }

    const emptySeat = room.seats.find((s) => s.type === 'empty');
    const targetSeat = emptySeat || room.seats.find((s) => s.type === 'bot');
    if (!targetSeat) {
      return { ok: false, error: 'Masada boş koltuk kalmadı.' };
    }

    targetSeat.type = 'human';
    targetSeat.playerId = playerId;
    targetSeat.name = cleanName;
    targetSeat.avatar = normalizeAvatar(playerAvatar, targetSeat.seatIndex);
    targetSeat.connected = true;
    this.playerToRoom.set(playerId, code);

    this.broadcastRoomState(room);
    this.broadcastRoomsList();
    return { ok: true, room, seatIndex: targetSeat.seatIndex };
  }

  leaveCurrentRoom(playerId, { disconnectOnly = false } = {}) {
    const code = this.playerToRoom.get(playerId);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (!room) {
      this.playerToRoom.delete(playerId);
      return null;
    }

    const seat = room.seats.find(
      (s) => s.type === 'human' && s.playerId === playerId
    );
    if (!seat) {
      this.playerToRoom.delete(playerId);
      return null;
    }

    if (disconnectOnly && room.status === 'playing') {
      seat.connected = false;
      if (room.session) {
        room.session.updateSeatConnection(seat.seatIndex, { connected: false });
      }
      const anyConnectedHuman = room.seats.some((s) => s.type === 'human' && s.connected);
      if (!anyConnectedHuman && !room.cleanupTimer) {
        room.cleanupTimer = setTimeout(() => {
          room.cleanupTimer = null;
          const stillDisconnected = room.seats.every((s) => s.type !== 'human' || !s.connected);
          if (!stillDisconnected) return;
          if (room.session) room.session.destroy();
          for (const s of room.seats) {
            if (s.type === 'human' && s.playerId) {
              this.playerToRoom.delete(s.playerId);
            }
          }
          this.rooms.delete(code);
          this.broadcastRoomsList();
        }, 120000);
        room.cleanupTimer.unref?.();
      }
      this.broadcastRoomState(room);
      return room;
    }

    this.playerToRoom.delete(playerId);

    if (room.status === 'waiting') {
      seat.type = 'empty';
      seat.playerId = null;
      seat.name = null;
      seat.avatar = `avatar-${(seat.seatIndex % PRESET_AVATAR_COUNT) + 1}`;
      seat.connected = false;
    } else {
      // Convert leaving player's seat to a bot so remaining players can finish
      seat.type = 'bot';
      seat.playerId = `bot-${seat.seatIndex}`;
      seat.name = `${seat.name || 'Oyuncu'} (Bot)`;
      seat.connected = true;
      if (room.session) {
        room.session.updateSeatConnection(seat.seatIndex, {
          playerId: seat.playerId,
          name: seat.name,
          isBot: true,
          connected: true
        });
      }
    }

    const activeHumans = room.seats.filter(
      (s) => s.type === 'human' && s.connected
    );

    if (activeHumans.length === 0) {
      if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
      }
      if (room.session) room.session.destroy();
      for (const s of room.seats) {
        if (s.type === 'human' && s.playerId) {
          this.playerToRoom.delete(s.playerId);
        }
      }
      this.rooms.delete(code);
      this.broadcastRoomsList();
      return null;
    }

    if (room.hostPlayerId === playerId) {
      room.hostPlayerId = activeHumans[0].playerId;
    }

    this.broadcastRoomState(room);
    this.broadcastRoomsList();
    return room;
  }

  toggleBotSeat({ roomCode, hostPlayerId, seatIndex }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    if (room.hostPlayerId !== hostPlayerId) {
      return { ok: false, error: 'Yalnızca masa kurucusu koltuk düzenleyebilir.' };
    }
    if (room.status !== 'waiting') {
      return { ok: false, error: 'Oyun başladıktan sonra koltuk değiştirilemez.' };
    }
    const seat = room.seats[seatIndex];
    if (!seat || seat.type === 'human') {
      return { ok: false, error: 'Bu koltukta gerçek oyuncu oturuyor.' };
    }

    if (seat.type === 'empty') {
      seat.type = 'bot';
      seat.playerId = `bot-${seatIndex}`;
      assignBotIdentity(room, seat);
      seat.connected = true;
    } else {
      seat.type = 'empty';
      seat.playerId = null;
      seat.name = null;
      seat.avatar = `avatar-${(seat.seatIndex % PRESET_AVATAR_COUNT) + 1}`;
      seat.connected = false;
    }

    this.broadcastRoomState(room);
    this.broadcastRoomsList();
    return { ok: true };
  }

  switchSeat({ roomCode, playerId, targetSeatIndex }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    if (room.status !== 'waiting') {
      return { ok: false, error: 'Oyun başladıktan sonra koltuk değiştirilemez.' };
    }

    const mySeat = room.seats.find(
      (s) => s.type === 'human' && s.playerId === playerId
    );
    if (!mySeat) {
      return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };
    }

    const idx = Number(targetSeatIndex);
    const targetSeat = Number.isInteger(idx) ? room.seats[idx] : null;
    if (!targetSeat) {
      return { ok: false, error: 'Geçersiz koltuk seçimi.' };
    }

    if (targetSeat.seatIndex === mySeat.seatIndex) {
      return { ok: true, seatIndex: mySeat.seatIndex };
    }

    const prevMine = {
      type: mySeat.type,
      playerId: mySeat.playerId,
      name: mySeat.name,
      avatar: mySeat.avatar,
      connected: mySeat.connected
    };
    const prevTarget = {
      type: targetSeat.type,
      playerId: targetSeat.playerId,
      name: targetSeat.name,
      avatar: targetSeat.avatar,
      connected: targetSeat.connected
    };

    // Move caller to targetSeat
    targetSeat.type = prevMine.type;
    targetSeat.playerId = prevMine.playerId;
    targetSeat.name = prevMine.name;
    targetSeat.avatar = prevMine.avatar;
    targetSeat.connected = prevMine.connected;

    // Move target occupant (empty, bot, or swapped human) to caller's previous seat
    if (prevTarget.type === 'empty') {
      mySeat.type = 'empty';
      mySeat.playerId = null;
      mySeat.name = null;
      mySeat.avatar = `avatar-${(mySeat.seatIndex % PRESET_AVATAR_COUNT) + 1}`;
      mySeat.connected = false;
    } else if (prevTarget.type === 'bot') {
      mySeat.type = 'bot';
      mySeat.playerId = `bot-${mySeat.seatIndex}`;
      mySeat.name = prevTarget.name;
      mySeat.avatar = prevTarget.avatar;
      mySeat.connected = true;
    } else {
      mySeat.type = prevTarget.type;
      mySeat.playerId = prevTarget.playerId;
      mySeat.name = prevTarget.name;
      mySeat.avatar = prevTarget.avatar;
      mySeat.connected = prevTarget.connected;
    }

    if (Array.isArray(room.orders)) {
      const tmpOrder = room.orders[mySeat.seatIndex];
      room.orders[mySeat.seatIndex] = room.orders[targetSeat.seatIndex];
      room.orders[targetSeat.seatIndex] = tmpOrder;
    }
    if (Array.isArray(room.socialStats)) {
      const tmpStat = room.socialStats[mySeat.seatIndex];
      room.socialStats[mySeat.seatIndex] = room.socialStats[targetSeat.seatIndex];
      room.socialStats[targetSeat.seatIndex] = tmpStat;
    }

    this.broadcastRoomState(room);
    this.broadcastRoomsList();
    return { ok: true, seatIndex: targetSeat.seatIndex };
  }

  updateOptions({ roomCode, hostPlayerId, options }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    if (room.hostPlayerId !== hostPlayerId) {
      return { ok: false, error: 'Yalnızca masa kurucusu ayarları değiştirebilir.' };
    }
    if (!options || typeof options !== 'object') {
      return { ok: false, error: 'Geçersiz ayar verisi.' };
    }

    const ruleChanged =
      (options.katlamali !== undefined && Boolean(options.katlamali) !== room.options.katlamali) ||
      (options.teamMode !== undefined &&
        (options.teamMode === 'paired' ? 'paired' : 'solo') !== room.options.teamMode) ||
      (options.maxRounds !== undefined &&
        [0, 3, 5, 7, 9].includes(Number(options.maxRounds)) &&
        Number(options.maxRounds) !== room.options.maxRounds) ||
      (options.islekPenalty !== undefined && Boolean(options.islekPenalty) !== room.options.islekPenalty) ||
      (options.turnSeconds !== undefined &&
        [45, 60, 90].includes(Number(options.turnSeconds)) &&
        Number(options.turnSeconds) !== room.options.turnSeconds);

    if (room.status !== 'waiting' && ruleChanged) {
      return { ok: false, error: 'Oyun devam ederken kurallar değiştirilemez.' };
    }

    if (room.status === 'waiting') {
      if (options.katlamali !== undefined) {
        room.options.katlamali = Boolean(options.katlamali);
      }
      if (options.teamMode !== undefined) {
        room.options.teamMode = options.teamMode === 'paired' ? 'paired' : 'solo';
      }
      if (options.maxRounds !== undefined && [0, 3, 5, 7, 9].includes(Number(options.maxRounds))) {
        room.options.maxRounds = Number(options.maxRounds);
      }
      if (options.islekPenalty !== undefined) {
        room.options.islekPenalty = Boolean(options.islekPenalty);
      }
      if ([45, 60, 90].includes(Number(options.turnSeconds))) {
        room.options.turnSeconds = Number(options.turnSeconds);
      }
    }

    if (options.roomAtmosphere !== undefined) {
      room.options.roomAtmosphere = normalizeRoomAtmosphere(options.roomAtmosphere);
    }
    if (options.roomAmbiance !== undefined) {
      room.options.roomAmbiance = normalizeRoomAmbiance(options.roomAmbiance);
    }

    this.broadcastRoomState(room);
    this.broadcastRoomsList();
    return { ok: true };
  }

  startGame(roomCode, hostPlayerId) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    if (room.hostPlayerId !== hostPlayerId) {
      return { ok: false, error: 'Oyunu yalnızca masa kurucusu başlatabilir.' };
    }
    if (room.status !== 'waiting') {
      return { ok: false, error: 'Oyun zaten başlamış.' };
    }
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }

    // Fill empty seats with bots
    for (const seat of room.seats) {
      if (seat.type === 'empty') {
        seat.type = 'bot';
        seat.playerId = `bot-${seat.seatIndex}`;
        assignBotIdentity(room, seat);
        seat.connected = true;
      }
    }

    room.status = 'playing';
    room.session = new GameSession({
      roomCode: room.code,
      seatsConfig: room.seats.map((s) => ({
        playerId: s.playerId,
        name: s.name,
        avatar: s.avatar,
        isBot: s.type === 'bot',
        connected: s.connected
      })),
      options: room.options,
      onStateChange: () => {
        this.broadcastRoomState(room);
      }
    });

    room.session.startRound();
    this.broadcastRoomsList();
    return { ok: true };
  }

  applyResolvedMusic(room, seat, resolvedPayload, mode = 'replace') {
    if (!resolvedPayload?.ok || !resolvedPayload.track) {
      return resolvedPayload || { ok: false, error: 'Müzik başlatılamadı.' };
    }

    const incomingQueue = Array.isArray(resolvedPayload.queue) && resolvedPayload.queue.length > 0
      ? resolvedPayload.queue
      : [resolvedPayload.track];
    const actorName = seat.name || 'Oyuncu';

    if (mode === 'queue' && room.music && Array.isArray(room.musicQueue) && room.musicQueue.length > 0) {
      const remainingCap = Math.max(0, 30 - room.musicQueue.length);
      const toAdd = incomingQueue.slice(0, remainingCap).map((t) => ({
        ...t,
        updatedBy: actorName
      }));
      room.musicQueue.push(...toAdd);
      room.music = {
        ...room.music,
        queueIndex: room.musicQueueIndex,
        queueTotal: room.musicQueue.length,
        hasNext: room.musicQueueIndex + 1 < room.musicQueue.length,
        autoplayEnabled: Boolean(room.musicAutoplay),
        queueItems: summarizeMusicQueue(room.musicQueue, room.musicQueueIndex)
      };
      this.broadcastRoomMusic(room);
      return { ok: true, music: room.music, queuedCount: toAdd.length };
    }

    room.musicQueue = incomingQueue.slice(0, 30).map((t) => ({
      ...t,
      updatedBy: actorName
    }));
    room.musicQueueIndex = 0;

    const first = room.musicQueue[0];
    this.recordMusicHistory(room, first);
    room.music = {
      ...first,
      updatedBy: actorName,
      updatedAt: Date.now(),
      queueIndex: 0,
      queueTotal: room.musicQueue.length,
      hasNext: room.musicQueue.length > 1,
      autoplayEnabled: Boolean(room.musicAutoplay),
      queueItems: summarizeMusicQueue(room.musicQueue, 0)
    };

    this.broadcastRoomMusic(room);
    return { ok: true, music: room.music };
  }

  recordMusicHistory(room, track) {
    if (!track?.videoId) return;
    if (!Array.isArray(room.musicHistory)) room.musicHistory = [];
    if (!room.musicHistory.includes(track.videoId)) {
      room.musicHistory.push(track.videoId);
      if (room.musicHistory.length > 40) {
        room.musicHistory.shift();
      }
    }
  }

  setRoomMusic({ roomCode, playerId, url, title, mode = 'replace', resolvedPayload = null }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const seat = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!seat) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    if (resolvedPayload) {
      return this.applyResolvedMusic(room, seat, resolvedPayload, mode);
    }

    const parsed = parseMusicUrl(url, title);
    if (!parsed.ok) return parsed;
    if (parsed.needsResolution) {
      return { ok: false, error: 'Parça sunucuda çözümlenmeyi bekliyor.' };
    }

    return this.applyResolvedMusic(room, seat, { ok: true, track: parsed, queue: [parsed] }, mode);
  }

  async resolveAndSetRoomMusic({ roomCode, playerId, url, title, mode = 'replace', fetchImpl }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const seat = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!seat) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    const resolved = await resolveMusicInput(url, title, { fetchImpl });
    if (!resolved.ok) return resolved;

    return this.applyResolvedMusic(room, seat, resolved, mode);
  }

  setMusicAutoplay({ roomCode, playerId, enabled }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const seat = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!seat) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    room.musicAutoplay = enabled === undefined ? !room.musicAutoplay : Boolean(enabled);
    if (room.music) {
      room.music = {
        ...room.music,
        autoplayEnabled: room.musicAutoplay,
        queueItems: summarizeMusicQueue(room.musicQueue, room.musicQueueIndex)
      };
      this.broadcastRoomMusic(room);
    }
    return { ok: true, autoplayEnabled: room.musicAutoplay, music: room.music };
  }

  async advanceRoomMusic({ roomCode, playerId, currentKey = '', fetchImpl }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const seat = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!seat) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    if (!room.music) return { ok: true, music: null };

    const activeKey = `${room.music.embedUrl}|${room.music.updatedAt || 0}`;
    if (currentKey && currentKey !== activeKey) {
      return { ok: true, music: room.music, skippedDuplicate: true };
    }

    const queue = Array.isArray(room.musicQueue) ? room.musicQueue : [];
    let nextIdx = (room.musicQueueIndex || 0) + 1;

    while (nextIdx < queue.length) {
      const candidate = queue[nextIdx];
      const resolvedTrack = await resolveQueuedTrack(candidate, { fetchImpl });
      if (resolvedTrack) {
        queue[nextIdx] = { ...resolvedTrack, updatedBy: candidate.updatedBy || seat.name || 'Oyuncu' };
        room.musicQueueIndex = nextIdx;
        this.recordMusicHistory(room, resolvedTrack);
        room.music = {
          ...resolvedTrack,
          updatedBy: candidate.updatedBy || seat.name || 'Oyuncu',
          updatedAt: Date.now(),
          queueIndex: nextIdx,
          queueTotal: queue.length,
          hasNext: nextIdx + 1 < queue.length,
          autoplayEnabled: Boolean(room.musicAutoplay),
          queueItems: summarizeMusicQueue(queue, nextIdx)
        };
        this.broadcastRoomMusic(room);
        return { ok: true, music: room.music };
      }
      nextIdx += 1;
    }

    if (room.musicAutoplay) {
      this.recordMusicHistory(room, room.music);
      const autoTrack = await findAutoplayTrack(room.music, {
        excludeVideoIds: room.musicHistory || [],
        fetchImpl
      });
      if (autoTrack) {
        this.recordMusicHistory(room, autoTrack);
        if (queue.length >= 30) {
          queue.shift();
          nextIdx = Math.max(0, queue.length);
        }
        queue.push({ ...autoTrack, updatedBy: 'Serhat Canikli' });
        room.musicQueue = queue;
        room.musicQueueIndex = queue.length - 1;
        room.music = {
          ...autoTrack,
          updatedBy: 'Serhat Canikli',
          updatedAt: Date.now(),
          queueIndex: room.musicQueueIndex,
          queueTotal: queue.length,
          hasNext: false,
          autoplayEnabled: true,
          queueItems: summarizeMusicQueue(queue, room.musicQueueIndex)
        };
        this.broadcastRoomMusic(room);
        return { ok: true, music: room.music };
      }
    }

    room.music = null;
    room.musicQueue = [];
    room.musicQueueIndex = 0;
    this.broadcastRoomMusic(room);
    return { ok: true, music: null };
  }

  async jumpMusicQueue({ roomCode, playerId, index, fetchImpl }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const seat = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!seat) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    const queue = Array.isArray(room.musicQueue) ? room.musicQueue : [];
    const targetIdx = Number(index);
    if (!Number.isInteger(targetIdx) || targetIdx < 0 || targetIdx >= queue.length) {
      return { ok: false, error: 'Geçersiz sıra numarası.' };
    }

    const candidate = queue[targetIdx];
    const resolvedTrack = await resolveQueuedTrack(candidate, { fetchImpl });
    if (!resolvedTrack) {
      return { ok: false, error: 'Seçilen parça şu an başlatılamadı.' };
    }

    queue[targetIdx] = { ...resolvedTrack, updatedBy: candidate.updatedBy || seat.name || 'Oyuncu' };
    room.musicQueueIndex = targetIdx;
    this.recordMusicHistory(room, resolvedTrack);
    room.music = {
      ...resolvedTrack,
      updatedBy: candidate.updatedBy || seat.name || 'Oyuncu',
      updatedAt: Date.now(),
      queueIndex: targetIdx,
      queueTotal: queue.length,
      hasNext: targetIdx + 1 < queue.length,
      autoplayEnabled: Boolean(room.musicAutoplay),
      queueItems: summarizeMusicQueue(queue, targetIdx)
    };
    this.broadcastRoomMusic(room);
    return { ok: true, music: room.music };
  }

  async removeMusicQueueItem({ roomCode, playerId, index, fetchImpl }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const seat = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!seat) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    const queue = Array.isArray(room.musicQueue) ? room.musicQueue : [];
    const targetIdx = Number(index);
    if (!Number.isInteger(targetIdx) || targetIdx < 0 || targetIdx >= queue.length) {
      return { ok: false, error: 'Geçersiz sıra numarası.' };
    }

    const removingCurrent = targetIdx === room.musicQueueIndex;
    queue.splice(targetIdx, 1);

    if (queue.length === 0) {
      room.music = null;
      room.musicQueue = [];
      room.musicQueueIndex = 0;
      this.broadcastRoomMusic(room);
      return { ok: true, music: null };
    }

    if (!removingCurrent) {
      if (targetIdx < room.musicQueueIndex) {
        room.musicQueueIndex = Math.max(0, room.musicQueueIndex - 1);
      }
      if (room.music) {
        room.music = {
          ...room.music,
          queueIndex: room.musicQueueIndex,
          queueTotal: queue.length,
          hasNext: room.musicQueueIndex + 1 < queue.length,
          queueItems: summarizeMusicQueue(queue, room.musicQueueIndex)
        };
      }
      this.broadcastRoomMusic(room);
      return { ok: true, music: room.music };
    }

    let playIdx = Math.min(targetIdx, queue.length - 1);
    while (playIdx < queue.length) {
      const candidate = queue[playIdx];
      const resolvedTrack = await resolveQueuedTrack(candidate, { fetchImpl });
      if (resolvedTrack) {
        queue[playIdx] = { ...resolvedTrack, updatedBy: candidate.updatedBy || seat.name || 'Oyuncu' };
        room.musicQueueIndex = playIdx;
        this.recordMusicHistory(room, resolvedTrack);
        room.music = {
          ...resolvedTrack,
          updatedBy: candidate.updatedBy || seat.name || 'Oyuncu',
          updatedAt: Date.now(),
          queueIndex: playIdx,
          queueTotal: queue.length,
          hasNext: playIdx + 1 < queue.length,
          autoplayEnabled: Boolean(room.musicAutoplay),
          queueItems: summarizeMusicQueue(queue, playIdx)
        };
        this.broadcastRoomMusic(room);
        return { ok: true, music: room.music };
      }
      playIdx += 1;
    }

    room.music = null;
    room.musicQueue = [];
    room.musicQueueIndex = 0;
    this.broadcastRoomMusic(room);
    return { ok: true, music: null };
  }

  clearUpcomingMusicQueue({ roomCode, playerId }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const seat = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!seat) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    const queue = Array.isArray(room.musicQueue) ? room.musicQueue : [];
    if (!room.music || queue.length === 0) {
      return { ok: true, music: room.music };
    }

    const active = queue[room.musicQueueIndex] || { ...room.music };
    room.musicQueue = [active];
    room.musicQueueIndex = 0;
    room.music = {
      ...room.music,
      queueIndex: 0,
      queueTotal: 1,
      hasNext: false,
      queueItems: summarizeMusicQueue(room.musicQueue, 0)
    };
    this.broadcastRoomMusic(room);
    return { ok: true, music: room.music };
  }

  shuffleMusicQueue({ roomCode, playerId }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const seat = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!seat) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    const queue = Array.isArray(room.musicQueue) ? room.musicQueue : [];
    if (!room.music || queue.length === 0) {
      return { ok: true, music: room.music };
    }

    const curIdx = Math.max(0, Math.min(room.musicQueueIndex || 0, queue.length - 1));
    const head = queue.slice(0, curIdx + 1);
    const upcoming = queue.slice(curIdx + 1);
    for (let i = upcoming.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
    }
    room.musicQueue = [...head, ...upcoming];
    room.musicQueueIndex = curIdx;
    room.music = {
      ...room.music,
      queueIndex: curIdx,
      queueTotal: room.musicQueue.length,
      hasNext: curIdx + 1 < room.musicQueue.length,
      queueItems: summarizeMusicQueue(room.musicQueue, curIdx)
    };
    this.broadcastRoomMusic(room);
    return { ok: true, music: room.music };
  }

  moveMusicQueueItem({ roomCode, playerId, fromIndex, toIndex }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const seat = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!seat) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    const queue = Array.isArray(room.musicQueue) ? room.musicQueue : [];
    const fromIdx = Number(fromIndex);
    const toIdx = Number(toIndex);
    if (
      !Number.isInteger(fromIdx) ||
      !Number.isInteger(toIdx) ||
      fromIdx < 0 ||
      fromIdx >= queue.length ||
      toIdx < 0 ||
      toIdx >= queue.length
    ) {
      return { ok: false, error: 'Geçersiz sıra konumu.' };
    }

    if (fromIdx === toIdx) {
      return { ok: true, music: room.music };
    }

    const [moved] = queue.splice(fromIdx, 1);
    queue.splice(toIdx, 0, moved);

    let curIdx = room.musicQueueIndex || 0;
    if (curIdx === fromIdx) {
      curIdx = toIdx;
    } else if (fromIdx < curIdx && toIdx >= curIdx) {
      curIdx -= 1;
    } else if (fromIdx > curIdx && toIdx <= curIdx) {
      curIdx += 1;
    }
    room.musicQueueIndex = curIdx;

    if (room.music) {
      room.music = {
        ...room.music,
        queueIndex: curIdx,
        queueTotal: queue.length,
        hasNext: curIdx + 1 < queue.length,
        queueItems: summarizeMusicQueue(queue, curIdx)
      };
    }
    this.broadcastRoomMusic(room);
    return { ok: true, music: room.music };
  }

  switchMusicFallback({ roomCode, playerId, currentKey = '' }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const seat = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!seat) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    if (!room.music) return { ok: true, music: null };
    const activeKey = `${room.music.embedUrl}|${room.music.updatedAt || 0}`;
    if (currentKey && currentKey !== activeKey) {
      return { ok: true, music: room.music, skippedDuplicate: true };
    }

    const fallbacks = Array.isArray(room.music.fallbackVideoIds) ? [...room.music.fallbackVideoIds] : [];
    const nextVideoId = fallbacks.shift();
    if (!nextVideoId) {
      return { ok: false, noFallback: true };
    }

    room.music = {
      ...room.music,
      videoId: nextVideoId,
      fallbackVideoIds: fallbacks,
      embedUrl: buildYouTubeEmbedUrl(nextVideoId),
      updatedAt: Date.now(),
      queueItems: summarizeMusicQueue(room.musicQueue, room.musicQueueIndex)
    };
    this.recordMusicHistory(room, room.music);
    this.broadcastRoomMusic(room);
    return { ok: true, music: room.music };
  }

  stopRoomMusic({ roomCode, playerId }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const seat = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!seat) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    room.music = null;
    room.musicQueue = [];
    room.musicQueueIndex = 0;
    room.musicHistory = [];
    this.broadcastRoomMusic(room);
    return { ok: true };
  }

  broadcastRoomMusic(room) {
    for (const seat of room.seats) {
      if (seat.type === 'human' && seat.playerId) {
        this.io.to(`player:${seat.playerId}`).emit('room:music', room.music);
      }
    }
  }

  broadcastRoomTv(room) {
    for (const seat of room.seats) {
      if (seat.type === 'human' && seat.playerId) {
        this.io.to(`player:${seat.playerId}`).emit('room:tv', room.tv || null);
      }
    }
  }

  async resolveAndSetRoomTv({ roomCode, playerId, channelId = '', url = '', title = '', fetchImpl = globalThis.fetch }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const sender = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!sender) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    const resolved = await resolveTvInput(url, title, { channelId, fetchImpl });
    if (!resolved?.ok || !resolved.tv) {
      return { ok: false, error: resolved?.error || 'TV yayını çözümlenemedi.' };
    }

    room.tv = {
      ...resolved.tv,
      updatedBy: sender.name || 'Oyuncu',
      updatedAt: Date.now()
    };
    this.broadcastRoomTv(room);
    return { ok: true, tv: room.tv };
  }

  setRoomTv({ roomCode, playerId, tvPayload }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const sender = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!sender) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    if (!tvPayload || typeof tvPayload !== 'object' || !tvPayload.embedUrl) {
      return { ok: false, error: 'Geçersiz TV yayın bilgisi.' };
    }
    room.tv = {
      channelId: tvPayload.channelId || null,
      provider: tvPayload.provider || 'youtube',
      kind: tvPayload.kind || 'iframe',
      title: String(tvPayload.title || 'TV Kanalı').slice(0, 64),
      videoId: tvPayload.videoId || null,
      fallbackVideoIds: Array.isArray(tvPayload.fallbackVideoIds) ? tvPayload.fallbackVideoIds.slice(0, 5) : [],
      originalUrl: tvPayload.originalUrl || '',
      embedUrl: tvPayload.videoId ? buildTvEmbedUrl(tvPayload.videoId) : String(tvPayload.embedUrl),
      isLive: Boolean(tvPayload.isLive),
      updatedBy: sender.name || 'Oyuncu',
      updatedAt: Date.now()
    };
    this.broadcastRoomTv(room);
    return { ok: true, tv: room.tv };
  }

  stopRoomTv({ roomCode, playerId }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const sender = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!sender) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    room.tv = null;
    this.broadcastRoomTv(room);
    return { ok: true, tv: null };
  }

  orderTreat({ roomCode, playerId, itemId, target = 'self' }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const sender = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!sender) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    const item = KAHVE_MENU_MAP.get(String(itemId || ''));
    if (!item) return { ok: false, error: 'Geçersiz kahvehane siparişi.' };

    if (!Array.isArray(room.orders)) room.orders = createEmptyOrders();
    if (!Array.isArray(room.socialStats)) room.socialStats = createEmptySocialStats();

    const targetIndices = [];
    if (target === 'all') {
      room.seats.forEach((s) => {
        if (s.type !== 'empty') targetIndices.push(s.seatIndex);
      });
    } else if (target === 'self') {
      targetIndices.push(sender.seatIndex);
    } else {
      const idx = Number(target);
      const tSeat = Number.isInteger(idx) ? room.seats[idx] : null;
      if (!tSeat || tSeat.type === 'empty') {
        return { ok: false, error: 'Seçilen koltukta kimse oturmuyor.' };
      }
      targetIndices.push(idx);
    }

    const servedAt = Date.now();
    room.orderSeq = (room.orderSeq || 0) + 1;

    for (const seatIdx of targetIndices) {
      const slot = room.orders[seatIdx] || { drink: null, food: null };
      slot[item.category] = {
        id: `ord-${room.orderSeq}-${seatIdx}`,
        itemId: item.id,
        label: item.label,
        shortLabel: item.shortLabel,
        category: item.category,
        sipsRemaining: item.category === 'drink' ? 4 : undefined,
        fromSeat: sender.seatIndex,
        fromName: sender.name || 'Oyuncu',
        servedAt
      };
      room.orders[seatIdx] = slot;
    }

    if (room.socialStats[sender.seatIndex]) {
      room.socialStats[sender.seatIndex].treatsOrdered += targetIndices.length;
    }

    const targetName =
      target === 'all'
        ? 'tüm masaya'
        : targetIndices[0] === sender.seatIndex
          ? 'kendine'
          : room.seats[targetIndices[0]]?.name || 'arkadaşına';

    room.lastOrder = {
      id: room.orderSeq,
      itemId: item.id,
      label: item.label,
      category: item.category,
      fromSeat: sender.seatIndex,
      fromName: sender.name || 'Oyuncu',
      target,
      targetName,
      servedAt
    };

    this.broadcastRoomOrders(room);
    return { ok: true, orders: room.orders, lastOrder: room.lastOrder, socialStats: room.socialStats };
  }

  sipDrink({ roomCode, playerId }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const sender = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!sender) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    if (!Array.isArray(room.orders)) room.orders = createEmptyOrders();
    if (!Array.isArray(room.socialStats)) room.socialStats = createEmptySocialStats();

    const slot = room.orders[sender.seatIndex];
    const drink = slot?.drink;
    if (!drink) {
      return { ok: false, error: 'Masanızda içilecek bir bardak yok.' };
    }

    const curSips = Number.isFinite(Number(drink.sipsRemaining)) ? Number(drink.sipsRemaining) : 4;
    let action = 'sip';
    if (curSips > 0) {
      drink.sipsRemaining = Math.max(0, curSips - 1);
      if (room.socialStats[sender.seatIndex]) {
        room.socialStats[sender.seatIndex].sipsTaken += 1;
      }
    } else {
      drink.sipsRemaining = 4;
      drink.refilledAt = Date.now();
      action = 'refill';
      if (room.socialStats[sender.seatIndex]) {
        room.socialStats[sender.seatIndex].treatsOrdered += 1;
      }
    }

    this.broadcastRoomOrders(room);
    return {
      ok: true,
      action,
      sipsRemaining: drink.sipsRemaining,
      orders: room.orders,
      socialStats: room.socialStats
    };
  }

  petCat({ roomCode, playerId, catIndex }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const sender = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!sender) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    const idx = Number(catIndex);
    const cat = Number.isInteger(idx) ? KAHVE_CATS[idx] : null;
    if (!cat) {
      return { ok: false, error: 'Geçersiz kedi seçimi.' };
    }

    if (!Array.isArray(room.socialStats)) room.socialStats = createEmptySocialStats();
    if (room.socialStats[sender.seatIndex]) {
      room.socialStats[sender.seatIndex].catsPetted += 1;
    }

    room.catPetSeq = (room.catPetSeq || 0) + 1;
    const payload = {
      id: room.catPetSeq,
      catIndex: idx,
      cat,
      seatIndex: sender.seatIndex,
      name: sender.name || 'Oyuncu',
      socialStats: room.socialStats,
      at: Date.now()
    };

    for (const seat of room.seats) {
      if (seat.type === 'human' && seat.playerId) {
        this.io.to(`player:${seat.playerId}`).emit('room:catPetted', payload);
      }
    }
    return { ok: true, payload };
  }

  clearSeatOrder({ roomCode, playerId, target = 'self' }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const sender = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!sender) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    if (!Array.isArray(room.orders)) room.orders = createEmptyOrders();
    if (target === 'all') {
      if (room.hostPlayerId !== playerId) {
        return { ok: false, error: 'Tüm masanın siparişlerini yalnızca kurucu temizleyebilir.' };
      }
      room.orders = createEmptyOrders();
    } else {
      room.orders[sender.seatIndex] = { drink: null, food: null };
    }
    this.broadcastRoomOrders(room);
    return { ok: true, orders: room.orders, socialStats: room.socialStats };
  }

  broadcastRoomOrders(room) {
    const payload = {
      orders: room.orders,
      lastOrder: room.lastOrder,
      socialStats: room.socialStats || createEmptySocialStats()
    };
    for (const seat of room.seats) {
      if (seat.type === 'human' && seat.playerId) {
        this.io.to(`player:${seat.playerId}`).emit('room:orders', payload);
      }
    }
  }

  sendChatMessage({ roomCode, playerId, text = '', quickId = null }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const sender = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!sender) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    const quick = quickId ? QUICK_CHAT_MAP.get(String(quickId)) : null;
    const rawText = quick ? quick.text : String(text || '');
    const cleanText = rawText.trim().replace(/\s+/g, ' ').slice(0, 140);
    if (!cleanText) {
      return { ok: false, error: 'Boş mesaj gönderilemez.' };
    }

    if (!Array.isArray(room.chatHistory)) room.chatHistory = [];
    room.chatSeq = (room.chatSeq || 0) + 1;
    const entry = {
      id: room.chatSeq,
      seatIndex: sender.seatIndex,
      name: sender.name || 'Oyuncu',
      avatar: sender.avatar,
      text: cleanText,
      quickId: quick?.id || null,
      sentAt: Date.now()
    };
    room.chatHistory.push(entry);
    if (room.chatHistory.length > 40) {
      room.chatHistory.shift();
    }

    for (const seat of room.seats) {
      if (seat.type === 'human' && seat.playerId) {
        this.io.to(`player:${seat.playerId}`).emit('room:chat', entry);
      }
    }
    return { ok: true, entry };
  }

  sendTableNudge({ roomCode, playerId, targetSeatIndex = null }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const sender = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!sender) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    if (!(room.nudgeCooldowns instanceof Map)) {
      room.nudgeCooldowns = new Map();
    }
    const now = Date.now();
    const prevAt = room.nudgeCooldowns.get(playerId) || 0;
    if (now - prevAt < 2500) {
      return { ok: false, error: 'Biraz yavaş, masayı kırmayalım!' };
    }
    room.nudgeCooldowns.set(playerId, now);

    let validTarget = null;
    if (targetSeatIndex !== null && targetSeatIndex !== undefined) {
      const idx = Number(targetSeatIndex);
      if (Number.isInteger(idx) && room.seats[idx] && room.seats[idx].type !== 'empty') {
        validTarget = idx;
      }
    }

    room.nudgeSeq = (room.nudgeSeq || 0) + 1;
    const nudge = {
      id: room.nudgeSeq,
      seatIndex: sender.seatIndex,
      name: sender.name || 'Oyuncu',
      targetSeatIndex: validTarget,
      sentAt: now
    };

    for (const seat of room.seats) {
      if (seat.type === 'human' && seat.playerId) {
        this.io.to(`player:${seat.playerId}`).emit('room:nudge', nudge);
      }
    }
    return { ok: true, nudge };
  }

  getRoomPayloadForPlayer(room, playerId) {
    const mySeat = room.seats.find(
      (s) => s.type === 'human' && s.playerId === playerId
    );
    const viewerSeatIndex = mySeat ? mySeat.seatIndex : 0;

    return {
      code: room.code,
      name: room.name,
      status: room.status,
      isHost: room.hostPlayerId === playerId,
      music: room.music || null,
      tv: room.tv || null,
      orders: room.orders || createEmptyOrders(),
      lastOrder: room.lastOrder || null,
      socialStats: room.socialStats || createEmptySocialStats(),
      chatHistory: room.chatHistory || [],
      options: room.options,
      viewerSeatIndex,
      seats: room.seats.map((s) => ({
        seatIndex: s.seatIndex,
        teamIndex: s.seatIndex % 2,
        type: s.type,
        name: s.name,
        avatar: s.avatar,
        connected: s.connected
      })),
      game: room.session ? room.session.getClientView(viewerSeatIndex) : null
    };
  }

  broadcastRoomState(room) {
    for (const seat of room.seats) {
      if (seat.type === 'human' && seat.playerId) {
        const payload = this.getRoomPayloadForPlayer(room, seat.playerId);
        this.io.to(`player:${seat.playerId}`).emit('room:state', payload);
      }
    }
  }

  broadcastRoomsList() {
    this.io.emit('rooms:list', this.listPublicRooms());
  }
}
