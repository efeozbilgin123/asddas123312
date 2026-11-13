import { createEmptyOrders, KAHVE_MENU_MAP } from '../shared/menu.js';
import { buildYouTubeEmbedUrl, parseMusicUrl } from '../shared/music.js';
import { findAutoplayTrack, resolveMusicInput, resolveQueuedTrack } from './musicResolver.js';
import { GameSession } from './gameSession.js';

const BOT_NAMES = ['Selim (Bot)', 'Zeynep (Bot)', 'Kerem (Bot)', 'Defne (Bot)'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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
  if (/^avatar-[1-6]$/.test(s)) return s;
  if (
    s.length <= 180000 &&
    /^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)
  ) {
    return s;
  }
  return `avatar-${(fallbackIdx % 6) + 1}`;
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

  createRoom({ playerId, playerName, playerAvatar, roomName, options = {}, quickStart = false }) {
    this.leaveCurrentRoom(playerId);

    const code = generateRoomCode(this.rooms);
    const cleanName = (typeof playerName === 'string' ? playerName.trim().slice(0, 20) : '') || 'Oyuncu 1';
    const cleanRoomName =
      (typeof roomName === 'string' ? roomName.trim().slice(0, 32) : '') || `${cleanName} Masası`;
    const opts = options && typeof options === 'object' ? options : {};

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
      orders: createEmptyOrders(),
      lastOrder: null,
      orderSeq: 0,
      options: {
        katlamali: Boolean(opts.katlamali),
        teamMode: opts.teamMode === 'paired' ? 'paired' : 'solo',
        maxRounds: [0, 3, 5, 7, 9].includes(Number(opts.maxRounds))
          ? Number(opts.maxRounds)
          : 5,
        islekPenalty: opts.islekPenalty !== false,
        turnSeconds: [45, 60, 90].includes(Number(opts.turnSeconds))
          ? Number(opts.turnSeconds)
          : 60
      },
      seats: [
        { seatIndex: 0, type: 'human', playerId, name: cleanName, avatar: normalizeAvatar(playerAvatar, 0), connected: true },
        { seatIndex: 1, type: 'empty', playerId: null, name: null, avatar: 'avatar-2', connected: false },
        { seatIndex: 2, type: 'empty', playerId: null, name: null, avatar: 'avatar-3', connected: false },
        { seatIndex: 3, type: 'empty', playerId: null, name: null, avatar: 'avatar-4', connected: false }
      ],
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
      seat.avatar = `avatar-${(seat.seatIndex % 6) + 1}`;
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
      seat.name = BOT_NAMES[seatIndex] || `Bot ${seatIndex + 1}`;
      seat.connected = true;
    } else {
      seat.type = 'empty';
      seat.playerId = null;
      seat.name = null;
      seat.avatar = `avatar-${(seat.seatIndex % 6) + 1}`;
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

    if (targetSeat.type === 'human' && room.hostPlayerId !== playerId) {
      return {
        ok: false,
        error: 'Bu koltukta başka bir oyuncu oturuyor. Boş veya bot koltuğuna geçebilirsiniz.'
      };
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
      mySeat.avatar = `avatar-${(mySeat.seatIndex % 6) + 1}`;
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
    if (room.status !== 'waiting') {
      return { ok: false, error: 'Oyun devam ederken kurallar değiştirilemez.' };
    }
    if (!options || typeof options !== 'object') {
      return { ok: false, error: 'Geçersiz ayar verisi.' };
    }

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
        seat.name = BOT_NAMES[seat.seatIndex] || `Bot ${seat.seatIndex + 1}`;
        seat.avatar = `avatar-${((seat.seatIndex + 1) % 6) + 1}`;
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
        autoplayEnabled: Boolean(room.musicAutoplay)
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
      autoplayEnabled: Boolean(room.musicAutoplay)
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
        autoplayEnabled: room.musicAutoplay
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
        queue[nextIdx] = resolvedTrack;
        room.musicQueueIndex = nextIdx;
        this.recordMusicHistory(room, resolvedTrack);
        room.music = {
          ...resolvedTrack,
          updatedBy: candidate.updatedBy || seat.name || 'Oyuncu',
          updatedAt: Date.now(),
          queueIndex: nextIdx,
          queueTotal: queue.length,
          hasNext: nextIdx + 1 < queue.length,
          autoplayEnabled: Boolean(room.musicAutoplay)
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
          autoplayEnabled: true
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
      updatedAt: Date.now()
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

  orderTreat({ roomCode, playerId, itemId, target = 'self' }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const sender = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (!sender) return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };

    const item = KAHVE_MENU_MAP.get(String(itemId || ''));
    if (!item) return { ok: false, error: 'Geçersiz kahvehane siparişi.' };

    if (!Array.isArray(room.orders)) room.orders = createEmptyOrders();

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
        fromSeat: sender.seatIndex,
        fromName: sender.name || 'Oyuncu',
        servedAt
      };
      room.orders[seatIdx] = slot;
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
    return { ok: true, orders: room.orders, lastOrder: room.lastOrder };
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
    return { ok: true, orders: room.orders };
  }

  broadcastRoomOrders(room) {
    const payload = { orders: room.orders, lastOrder: room.lastOrder };
    for (const seat of room.seats) {
      if (seat.type === 'human' && seat.playerId) {
        this.io.to(`player:${seat.playerId}`).emit('room:orders', payload);
      }
    }
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
      orders: room.orders || createEmptyOrders(),
      lastOrder: room.lastOrder || null,
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
