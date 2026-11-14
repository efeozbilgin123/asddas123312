import { createEmptyOrders, KAHVE_MENU_MAP } from '../shared/menu.js';
import {
  buildAmbianceEmbedUrl,
  buildTvEmbedUrl,
  buildYouTubeEmbedUrl,
  parseMusicUrl,
  summarizeMusicQueue
} from '../shared/music.js';
import {
  createEmptySocialStats,
  isPresetAvatar,
  KAHVE_CAT_ACTIONS,
  KAHVE_CATS,
  KAHVE_QUICK_CHATS,
  normalizeRoomAmbiance,
  normalizeRoomAtmosphere,
  pickRandomBotAvatar,
  pickRandomBotName,
  PRESET_AVATAR_COUNT,
  ROOM_AMBIANCES,
  TV_CHANNELS
} from '../shared/presets.js';
import {
  findAutoplayTrack,
  resolveAmbianceInput,
  resolveMusicInput,
  resolveQueuedTrack,
  resolveTvInput
} from './musicResolver.js';
import { BilliardSession } from '../shared/billiardSession.js';
import { SIDE_TABLE_DEFS, SideTableSession } from '../shared/sideGames.js';
import { GameSession } from './gameSession.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const QUICK_CHAT_MAP = new Map(KAHVE_QUICK_CHATS.map((q) => [q.id, q]));
const VALID_CAT_ACTIONS = new Set(KAHVE_CAT_ACTIONS.map((a) => a.id));

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

  findHumanSideTable(room, playerId) {
    if (!room || !Array.isArray(room.sideTables) || !playerId) return null;
    for (const table of room.sideTables) {
      const seat = table.findHumanSeat(playerId);
      if (seat) {
        return { table, seat };
      }
    }
    return null;
  }

  findRoomParticipant(room, playerId) {
    if (!room || !playerId) return null;
    const seat = room.seats.find((s) => s.type === 'human' && s.playerId === playerId);
    if (seat) {
      return {
        seat,
        billiardSeat: null,
        sideTable: null,
        sideSeat: null,
        spectator: null,
        activity: 'okey',
        seatIndex: seat.seatIndex,
        billiardSeatIndex: null,
        sideTableId: null,
        sideSeatIndex: null,
        name: seat.name || 'Oyuncu',
        avatar: seat.avatar,
        isSpectator: false
      };
    }
    const bSeat = room.billiard?.findHumanSeat ? room.billiard.findHumanSeat(playerId) : null;
    if (bSeat) {
      return {
        seat: null,
        billiardSeat: bSeat,
        sideTable: null,
        sideSeat: null,
        spectator: null,
        activity: 'billiard',
        seatIndex: null,
        billiardSeatIndex: bSeat.seatIndex,
        sideTableId: null,
        sideSeatIndex: null,
        name: bSeat.name || 'Bilardocu',
        avatar: bSeat.avatar,
        isSpectator: false
      };
    }
    const sideHit = this.findHumanSideTable(room, playerId);
    if (sideHit) {
      return {
        seat: null,
        billiardSeat: null,
        sideTable: sideHit.table,
        sideSeat: sideHit.seat,
        spectator: null,
        activity: 'sideTable',
        seatIndex: null,
        billiardSeatIndex: null,
        sideTableId: sideHit.table.id,
        sideSeatIndex: sideHit.seat.seatIndex,
        name: sideHit.seat.name || 'Oyuncu',
        avatar: sideHit.seat.avatar,
        isSpectator: false
      };
    }
    const spec = room.spectators instanceof Map ? room.spectators.get(playerId) : null;
    if (spec) {
      return {
        seat: null,
        billiardSeat: null,
        sideTable: null,
        sideSeat: null,
        spectator: spec,
        activity: 'spectator',
        seatIndex: null,
        billiardSeatIndex: null,
        sideTableId: null,
        sideSeatIndex: null,
        name: spec.name || 'Yancı',
        avatar: spec.avatar,
        isSpectator: true
      };
    }
    return null;
  }

  getAllHumanRecipients(room) {
    const ids = new Set();
    for (const seat of room.seats) {
      if (seat.type === 'human' && seat.playerId) {
        ids.add(seat.playerId);
      }
    }
    if (room.billiard?.seats) {
      for (const bSeat of room.billiard.seats) {
        if (bSeat.type === 'human' && bSeat.playerId) {
          ids.add(bSeat.playerId);
        }
      }
    }
    if (Array.isArray(room.sideTables)) {
      for (const tbl of room.sideTables) {
        for (const sSeat of tbl.seats) {
          if (sSeat.type === 'human' && sSeat.playerId) {
            ids.add(sSeat.playerId);
          }
        }
      }
    }
    if (room.spectators instanceof Map) {
      for (const spec of room.spectators.values()) {
        if (spec?.playerId) ids.add(spec.playerId);
      }
    }
    return Array.from(ids);
  }

  getConnectedHumanIds(room) {
    const ids = [];
    const seen = new Set();
    for (const seat of room.seats) {
      if (seat.type === 'human' && seat.connected && seat.playerId && !seen.has(seat.playerId)) {
        seen.add(seat.playerId);
        ids.push(seat.playerId);
      }
    }
    if (room.billiard?.seats) {
      for (const bSeat of room.billiard.seats) {
        if (bSeat.type === 'human' && bSeat.connected && bSeat.playerId && !seen.has(bSeat.playerId)) {
          seen.add(bSeat.playerId);
          ids.push(bSeat.playerId);
        }
      }
    }
    if (Array.isArray(room.sideTables)) {
      for (const tbl of room.sideTables) {
        for (const sSeat of tbl.seats) {
          if (sSeat.type === 'human' && sSeat.connected && sSeat.playerId && !seen.has(sSeat.playerId)) {
            seen.add(sSeat.playerId);
            ids.push(sSeat.playerId);
          }
        }
      }
    }
    if (room.spectators instanceof Map) {
      for (const spec of room.spectators.values()) {
        if (spec?.connected !== false && spec?.playerId && !seen.has(spec.playerId)) {
          seen.add(spec.playerId);
          ids.push(spec.playerId);
        }
      }
    }
    return ids;
  }

  ensureRoamerKey(room, playerId) {
    if (!(room.roamerKeys instanceof Map)) {
      room.roamerKeys = new Map();
    }
    let key = room.roamerKeys.get(playerId);
    if (!key) {
      room.roamerSeq = (room.roamerSeq || 0) + 1;
      key = `r-${room.roamerSeq}`;
      room.roamerKeys.set(playerId, key);
    }
    return key;
  }

  getRoamersPayload(room) {
    if (!(room.roamStates instanceof Map)) return [];
    const now = Date.now();
    const list = [];
    for (const [pid, state] of room.roamStates.entries()) {
      if (!state || !state.active) continue;
      if (now - (state.updatedAt || 0) > 45000) {
        room.roamStates.delete(pid);
        continue;
      }
      list.push({
        key: state.key,
        name: state.name,
        avatar: state.avatar,
        activity: state.activity || 'spectator',
        x: state.x,
        z: state.z,
        yaw: state.yaw
      });
    }
    return list;
  }

  broadcastRoomRoamers(room) {
    const roamers = this.getRoamersPayload(room);
    for (const pid of this.getAllHumanRecipients(room)) {
      this.io.to(`player:${pid}`).emit('room:roamers', roamers);
    }
  }

  broadcastRoomBilliard(room) {
    if (!room?.billiard) return;
    const view = room.billiard.getClientView();
    for (const pid of this.getAllHumanRecipients(room)) {
      this.io.to(`player:${pid}`).emit('room:billiard', view);
    }
  }

  getSideTablesPayload(room, viewerPlayerId = null) {
    if (!Array.isArray(room?.sideTables)) return [];
    return room.sideTables.map((t) => t.getClientView(viewerPlayerId));
  }

  broadcastRoomSideTables(room) {
    if (!room?.sideTables) return;
    for (const pid of this.getAllHumanRecipients(room)) {
      this.io.to(`player:${pid}`).emit('room:sideTables', this.getSideTablesPayload(room, pid));
    }
  }

  destroyRoomResources(room) {
    if (!room) return;
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
    if (room.session) {
      room.session.destroy();
      room.session = null;
    }
    if (room.billiard) {
      room.billiard.destroy();
    }
    if (Array.isArray(room.sideTables)) {
      for (const tbl of room.sideTables) {
        tbl.destroy();
        for (const sSeat of tbl.seats) {
          if (sSeat.type === 'human' && sSeat.playerId) {
            this.playerToRoom.delete(sSeat.playerId);
          }
        }
      }
    }
    for (const s of room.seats) {
      if (s.type === 'human' && s.playerId) {
        this.playerToRoom.delete(s.playerId);
      }
    }
    if (room.billiard?.seats) {
      for (const bs of room.billiard.seats) {
        if (bs.type === 'human' && bs.playerId) {
          this.playerToRoom.delete(bs.playerId);
        }
      }
    }
    if (room.spectators instanceof Map) {
      for (const sp of room.spectators.values()) {
        if (sp?.playerId) {
          this.playerToRoom.delete(sp.playerId);
          this.io.to(`player:${sp.playerId}`).emit('room:state', null);
        }
      }
      room.spectators.clear();
    }
    if (room.roamStates instanceof Map) {
      room.roamStates.clear();
    }
    this.rooms.delete(room.code);
  }

  listPublicRooms() {
    const list = [];
    for (const room of this.rooms.values()) {
      const humanCount = room.seats.filter((s) => s.type === 'human').length;
      const openSeats = room.seats.filter((s) => s.type === 'empty').length;
      const spectatorCount = room.spectators instanceof Map ? room.spectators.size : 0;
      const billiardSeats = room.billiard?.seats || [];
      const billiardCount = billiardSeats.filter((s) => s.type !== 'empty').length;
      const billiardHumanCount = billiardSeats.filter((s) => s.type === 'human').length;
      const billiardPhase = room.billiard?.phase || 'waiting';
      const sideHumanCount = Array.isArray(room.sideTables)
        ? room.sideTables.reduce((sum, tbl) => sum + tbl.seats.filter((s) => s.type === 'human').length, 0)
        : 0;
      list.push({
        code: room.code,
        name: room.name,
        status: room.status,
        humanCount,
        openSeats,
        spectatorCount,
        billiardCount,
        billiardHumanCount,
        billiardPhase,
        sideHumanCount,
        seats: room.seats.map((s) => ({
          seatIndex: s.seatIndex,
          type: s.type,
          name: s.name,
          avatar: s.avatar
        })),
        options: room.options,
        createdAt: room.createdAt
      });
    }
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }

  createRoom({ playerId, playerName, playerAvatar, roomName, options = {}, quickStart = false, seatIndex = 0, entryActivity = 'okey' }) {
    this.leaveCurrentRoom(playerId);

    const code = generateRoomCode(this.rooms);
    const cleanName = (typeof playerName === 'string' ? playerName.trim().slice(0, 20) : '') || 'Oyuncu 1';
    const cleanRoomName =
      (typeof roomName === 'string' ? roomName.trim().slice(0, 32) : '') || `${cleanName} Masası`;
    const opts = options && typeof options === 'object' ? options : {};
    const startInHall = entryActivity === 'spectator';
    const preferredSeat = [0, 1, 2, 3].includes(Number(seatIndex)) ? Number(seatIndex) : 0;

    const seats = [0, 1, 2, 3].map((idx) => (
      !startInHall && idx === preferredSeat
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
      spectators: new Map(),
      roamerKeys: new Map(),
      roamStates: new Map(),
      roamerSeq: 0,
      music: null,
      musicQueue: [],
      musicQueueIndex: 0,
      musicAutoplay: true,
      musicHistory: [],
      tv: null,
      ambianceTrack: null,
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
      session: null,
      billiard: null,
      sideTables: []
    };

    room.billiard = new BilliardSession({
      onStateChange: () => {
        this.broadcastRoomBilliard(room);
        this.broadcastRoomsList();
      }
    });

    room.sideTables = SIDE_TABLE_DEFS.map(
      (def) =>
        new SideTableSession(def, {
          onStateChange: () => {
            this.broadcastRoomSideTables(room);
            this.broadcastRoomsList();
          }
        })
    );

    if (startInHall) {
      const hostAvatar = normalizeAvatar(playerAvatar, 0);
      room.spectators.set(playerId, {
        playerId,
        name: cleanName,
        avatar: hostAvatar,
        connected: true,
        watchSeatIndex: null,
        joinedAt: Date.now()
      });
      const rKey = this.ensureRoamerKey(room, playerId);
      room.roamStates.set(playerId, {
        key: rKey,
        name: cleanName,
        avatar: hostAvatar,
        activity: 'spectator',
        active: true,
        x: 0,
        z: 32,
        yaw: 0,
        updatedAt: Date.now()
      });

      if (quickStart) {
        room.billiard.assignBot(0);
        room.billiard.assignBot(1);
        for (const tbl of room.sideTables) {
          if (tbl.kind === 'pisti' || tbl.kind === 'papazkacti') {
            tbl.assignBot(1);
          } else if (tbl.kind === 'poker') {
            tbl.assignBot(1);
            tbl.assignBot(2);
          } else if (tbl.kind === 'batak') {
            tbl.assignBot(1);
            tbl.assignBot(2);
            tbl.assignBot(3);
          }
        }
      }
    }

    this.rooms.set(code, room);
    this.playerToRoom.set(playerId, code);

    if (quickStart) {
      this.startGame(code, playerId);
    }

    this.broadcastRoomsList();
    return { ok: true, room };
  }

  joinRoom({ roomCode, playerId, playerName, playerAvatar, asSpectator = false, activity = 'auto' }) {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: 'Bu kodla bir masa bulunamadı.' };
    }

    const cleanName = (typeof playerName === 'string' ? playerName.trim().slice(0, 20) : '') || 'Oyuncu';
    if (!(room.spectators instanceof Map)) {
      room.spectators = new Map();
    }

    // Check if player is reconnecting to an existing Okey seat in this room
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
      return { ok: true, room, seatIndex: existingSeat.seatIndex, isSpectator: false, activity: 'okey' };
    }

    // Check if player is reconnecting to an existing Billiard seat
    const existingBilliard = room.billiard?.findHumanSeat(playerId);
    if (existingBilliard) {
      if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
      }
      existingBilliard.connected = true;
      existingBilliard.name = cleanName;
      if (playerAvatar) existingBilliard.avatar = normalizeAvatar(playerAvatar, existingBilliard.seatIndex);
      this.playerToRoom.set(playerId, code);
      this.broadcastRoomState(room);
      this.broadcastRoomBilliard(room);
      return { ok: true, room, billiardSeatIndex: existingBilliard.seatIndex, isSpectator: false, activity: 'billiard' };
    }

    // Check if player is reconnecting to an existing Side Table seat
    const existingSide = this.findHumanSideTable(room, playerId);
    if (existingSide) {
      if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
      }
      existingSide.seat.connected = true;
      existingSide.seat.name = cleanName;
      if (playerAvatar) existingSide.seat.avatar = normalizeAvatar(playerAvatar, existingSide.seat.seatIndex);
      this.playerToRoom.set(playerId, code);
      this.broadcastRoomState(room);
      this.broadcastRoomSideTables(room);
      return {
        ok: true,
        room,
        sideTableId: existingSide.table.id,
        sideSeatIndex: existingSide.seat.seatIndex,
        isSpectator: false,
        activity: 'sideTable'
      };
    }

    const existingSpectator = room.spectators.get(playerId);
    if (existingSpectator && (asSpectator || activity === 'spectator')) {
      if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
      }
      existingSpectator.connected = true;
      existingSpectator.name = cleanName;
      if (playerAvatar) existingSpectator.avatar = normalizeAvatar(playerAvatar, 0);
      this.playerToRoom.set(playerId, code);
      this.broadcastRoomState(room);
      this.broadcastRoomsList();
      return { ok: true, room, isSpectator: true, watchSeatIndex: existingSpectator.watchSeatIndex, activity: 'spectator' };
    }

    this.leaveCurrentRoom(playerId);

    const wantSpectator = asSpectator || activity === 'spectator';

    if (!wantSpectator && activity === 'billiard' && room.billiard) {
      const bRes = room.billiard.sitHuman({
        playerId,
        playerName: cleanName,
        playerAvatar: normalizeAvatar(playerAvatar, 0)
      });
      if (bRes.ok) {
        if (room.cleanupTimer) {
          clearTimeout(room.cleanupTimer);
          room.cleanupTimer = null;
        }
        this.playerToRoom.set(playerId, code);
        this.broadcastRoomState(room);
        this.broadcastRoomBilliard(room);
        this.broadcastRoomsList();
        return { ok: true, room, billiardSeatIndex: bRes.seatIndex, isSpectator: false, activity: 'billiard' };
      }
    }

    if (!wantSpectator && typeof activity === 'string' && activity.startsWith('side:')) {
      const targetTableId = activity.slice(5);
      const targetTable = Array.isArray(room.sideTables)
        ? room.sideTables.find((t) => t.id === targetTableId)
        : null;
      if (targetTable) {
        const sRes = targetTable.sitHuman({
          playerId,
          playerName: cleanName,
          playerAvatar: normalizeAvatar(playerAvatar, 0)
        });
        if (sRes.ok) {
          if (room.cleanupTimer) {
            clearTimeout(room.cleanupTimer);
            room.cleanupTimer = null;
          }
          this.playerToRoom.set(playerId, code);
          this.broadcastRoomState(room);
          this.broadcastRoomSideTables(room);
          this.broadcastRoomsList();
          return {
            ok: true,
            room,
            sideTableId: targetTable.id,
            sideSeatIndex: sRes.seatIndex,
            isSpectator: false,
            activity: 'sideTable'
          };
        }
      }
    }

    if (!wantSpectator && activity !== 'billiard') {
      if (room.status === 'playing') {
        const openSeat =
          room.seats.find((s) => s.type === 'empty') ||
          room.seats.find((s) => s.type === 'human' && !s.connected) ||
          room.seats.find((s) => s.type === 'bot');
        if (openSeat) {
          if (room.cleanupTimer) {
            clearTimeout(room.cleanupTimer);
            room.cleanupTimer = null;
          }
          const prevPlayerId = openSeat.playerId;
          if (prevPlayerId && openSeat.type === 'human') {
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
          return { ok: true, room, seatIndex: openSeat.seatIndex, isSpectator: false, activity: 'okey' };
        }
      } else {
        const emptySeat = room.seats.find((s) => s.type === 'empty');
        const targetSeat = emptySeat || room.seats.find((s) => s.type === 'bot');
        if (targetSeat) {
          targetSeat.type = 'human';
          targetSeat.playerId = playerId;
          targetSeat.name = cleanName;
          targetSeat.avatar = normalizeAvatar(playerAvatar, targetSeat.seatIndex);
          targetSeat.connected = true;
          this.playerToRoom.set(playerId, code);

          this.broadcastRoomState(room);
          this.broadcastRoomsList();
          return { ok: true, room, seatIndex: targetSeat.seatIndex, isSpectator: false, activity: 'okey' };
        }
      }
    }

    // Unlimited spectators ("Yancı" / Roamers): join spectator list when requested or when all seats are full
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
    room.spectators.set(playerId, {
      playerId,
      name: cleanName,
      avatar: normalizeAvatar(playerAvatar, room.spectators.size),
      connected: true,
      watchSeatIndex: null,
      joinedAt: Date.now()
    });
    const rKey = this.ensureRoamerKey(room, playerId);
    if (!(room.roamStates instanceof Map)) room.roamStates = new Map();
    room.roamStates.set(playerId, {
      key: rKey,
      name: cleanName,
      avatar: normalizeAvatar(playerAvatar, room.spectators.size),
      activity: 'spectator',
      active: true,
      x: 0,
      z: 32,
      yaw: 0,
      updatedAt: Date.now()
    });
    this.playerToRoom.set(playerId, code);

    this.broadcastRoomState(room);
    this.broadcastRoomsList();
    return { ok: true, room, isSpectator: true, watchSeatIndex: null, activity: 'spectator' };
  }

  watchSeat({ roomCode, playerId, seatIndex = null }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    if (!(room.spectators instanceof Map)) return { ok: false, error: 'İzleyici bulunamadı.' };
    const spec = room.spectators.get(playerId);
    if (!spec) {
      return { ok: false, error: 'Yancı modu yalnızca izleyiciler için geçerlidir.' };
    }

    if (seatIndex === null || seatIndex === undefined || seatIndex === '') {
      spec.watchSeatIndex = null;
    } else {
      const idx = Number(seatIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx > 3) {
        return { ok: false, error: 'Geçersiz koltuk seçimi.' };
      }
      spec.watchSeatIndex = idx;
    }

    this.broadcastRoomState(room);
    return { ok: true, watchSeatIndex: spec.watchSeatIndex };
  }

  vacateOkeySeatForSwitch(room, mySeat, { putBot = true } = {}) {
    if (!mySeat) return;
    if (!putBot && room.status === 'waiting') {
      mySeat.type = 'empty';
      mySeat.playerId = null;
      mySeat.name = null;
      mySeat.avatar = `avatar-${(mySeat.seatIndex % PRESET_AVATAR_COUNT) + 1}`;
      mySeat.connected = false;
      return;
    }

    const baseName = mySeat.name || 'Oyuncu';
    mySeat.type = 'bot';
    mySeat.playerId = `bot-${mySeat.seatIndex}`;
    mySeat.name = baseName.endsWith('(Bot)') ? baseName : `${baseName} (Bot)`;
    mySeat.connected = true;
    if (room.session) {
      room.session.updateSeatConnection(mySeat.seatIndex, {
        playerId: mySeat.playerId,
        name: mySeat.name,
        isBot: true,
        connected: true
      });
    }
  }

  standUp({ roomCode, playerId }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const participant = this.findRoomParticipant(room, playerId);
    if (!participant) return { ok: false, error: 'Bu odada değilsiniz.' };
    if (participant.activity === 'spectator') {
      return { ok: true, activity: 'spectator' };
    }

    if (!(room.spectators instanceof Map)) {
      room.spectators = new Map();
    }

    let startPos = { x: 0, z: 10.5, yaw: 0 };
    if (participant.seat) {
      this.vacateOkeySeatForSwitch(room, participant.seat, { putBot: true });
    }
    if (participant.billiardSeat && room.billiard) {
      room.billiard.standHuman(playerId, { convertToBotIfActive: true });
      startPos = { x: 21.5, z: -2.0, yaw: -Math.PI / 2 };
    }
    if (participant.sideTable) {
      const tbl = participant.sideTable;
      tbl.standHuman(playerId, { convertToBotIfActive: true });
      const offsetZ = tbl.z > 0 ? -7.6 : 7.6;
      startPos = {
        x: Math.round(tbl.x * 100) / 100,
        z: Math.round((tbl.z + offsetZ) * 100) / 100,
        yaw: tbl.z > 0 ? 0 : Math.PI
      };
    }

    room.spectators.set(playerId, {
      playerId,
      name: participant.name || 'Oyuncu',
      avatar: participant.avatar || 'avatar-1',
      connected: true,
      watchSeatIndex: null,
      joinedAt: Date.now()
    });
    const key = this.ensureRoamerKey(room, playerId);
    if (!(room.roamStates instanceof Map)) room.roamStates = new Map();
    room.roamStates.set(playerId, {
      key,
      name: participant.name || 'Oyuncu',
      avatar: participant.avatar || 'avatar-1',
      activity: 'spectator',
      active: true,
      ...startPos,
      updatedAt: Date.now()
    });

    this.broadcastRoomState(room);
    this.broadcastRoomBilliard(room);
    this.broadcastRoomSideTables(room);
    this.broadcastRoomRoamers(room);
    this.broadcastRoomsList();
    return { ok: true, activity: 'spectator' };
  }

  takeSeat({ roomCode, playerId, targetSeatIndex = null }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };

    const spec = room.spectators instanceof Map ? room.spectators.get(playerId) : null;
    const bSeat = room.billiard?.findHumanSeat(playerId) || null;
    const sideHit = this.findHumanSideTable(room, playerId);
    if (!spec && !bSeat && !sideHit) {
      return { ok: false, error: 'Zaten masada koltuktasınız veya izleyici değilsiniz.' };
    }

    let seat = null;
    const requestedIdx = targetSeatIndex !== null && targetSeatIndex !== undefined ? Number(targetSeatIndex) : null;
    const canTake = (candidate) =>
      candidate &&
      (candidate.type === 'empty' ||
        candidate.type === 'bot' ||
        (candidate.type === 'human' && !candidate.connected));

    if (requestedIdx !== null && Number.isInteger(requestedIdx) && room.seats[requestedIdx]) {
      const candidate = room.seats[requestedIdx];
      if (canTake(candidate)) {
        seat = candidate;
      }
    } else {
      seat =
        room.seats.find((s) => s.type === 'empty') ||
        room.seats.find((s) => s.type === 'human' && !s.connected) ||
        room.seats.find((s) => s.type === 'bot') ||
        null;
    }

    if (!seat) {
      return { ok: false, error: 'Masada geçilebilecek boş koltuk veya bot yok.' };
    }

    const prevPlayerId = seat.playerId;
    if (prevPlayerId && seat.type === 'human') {
      this.playerToRoom.delete(prevPlayerId);
      if (room.hostPlayerId === prevPlayerId) {
        room.hostPlayerId = playerId;
      }
    }

    const actorName = spec?.name || bSeat?.name || sideHit?.seat?.name || 'Oyuncu';
    const actorAvatar = spec?.avatar || bSeat?.avatar || sideHit?.seat?.avatar || normalizeAvatar(null, seat.seatIndex);

    if (spec) room.spectators.delete(playerId);
    if (bSeat && room.billiard) room.billiard.standHuman(playerId, { convertToBotIfActive: true });
    if (sideHit) sideHit.table.standHuman(playerId, { convertToBotIfActive: true });
    if (room.roamStates instanceof Map) room.roamStates.delete(playerId);

    seat.type = 'human';
    seat.playerId = playerId;
    seat.name = actorName;
    seat.avatar = actorAvatar;
    seat.connected = true;

    if (room.session) {
      room.session.updateSeatConnection(seat.seatIndex, {
        playerId,
        name: seat.name,
        avatar: seat.avatar,
        isBot: false,
        connected: true
      });
    }

    this.broadcastRoomState(room);
    this.broadcastRoomBilliard(room);
    this.broadcastRoomSideTables(room);
    this.broadcastRoomRoamers(room);
    this.broadcastRoomsList();
    return { ok: true, seatIndex: seat.seatIndex };
  }

  billiardJoin({ roomCode, playerId, seatIndex = null }) {
    const room = this.getRoom(roomCode);
    if (!room || !room.billiard) return { ok: false, error: 'Masa bulunamadı.' };
    const participant = this.findRoomParticipant(room, playerId);
    if (!participant) return { ok: false, error: 'Bu odada değilsiniz.' };

    if (participant.billiardSeat) {
      return { ok: true, seatIndex: participant.billiardSeat.seatIndex };
    }

    // Pre-check if Billiard has a spot before removing from current Okey/side/spectator slot
    const reqIdx = seatIndex !== null && seatIndex !== undefined ? Number(seatIndex) : null;
    const canTake = (c) =>
      c &&
      (c.type === 'empty' ||
        c.type === 'bot' ||
        (c.type === 'human' && !c.connected));
    const available = reqIdx !== null
      ? (canTake(room.billiard.seats[reqIdx]) ? room.billiard.seats[reqIdx] : null)
      : room.billiard.seats.find((s) => s.type === 'empty') ||
        room.billiard.seats.find((s) => s.type === 'human' && !s.connected) ||
        room.billiard.seats.find((s) => s.type === 'bot');

    if (!available) {
      return { ok: false, error: 'Bilardo masasında boş koltuk yok.' };
    }

    if (participant.seat) {
      this.vacateOkeySeatForSwitch(room, participant.seat, { putBot: true });
    }
    if (participant.sideTable) {
      participant.sideTable.standHuman(playerId, { convertToBotIfActive: true });
    }
    if (participant.spectator && room.spectators instanceof Map) {
      room.spectators.delete(playerId);
    }
    if (room.roamStates instanceof Map) {
      room.roamStates.delete(playerId);
    }

    const wasBot = available.type === 'bot';
    if (wasBot && room.billiard.phase === 'playing') {
      const target = available;
      target.type = 'human';
      target.playerId = playerId;
      target.name = participant.name;
      target.avatar = participant.avatar;
      target.connected = true;
      if (room.billiard.currentSeat === target.seatIndex && room.billiard.botTimer) {
        clearTimeout(room.billiard.botTimer);
        room.billiard.botTimer = null;
      }
    } else {
      if (wasBot) {
        available.type = 'empty';
        available.playerId = null;
      }
      const res = room.billiard.sitHuman({
        playerId,
        playerName: participant.name,
        playerAvatar: participant.avatar,
        seatIndex: available.seatIndex
      });
      if (!res.ok) return res;
    }

    this.broadcastRoomState(room);
    this.broadcastRoomBilliard(room);
    this.broadcastRoomSideTables(room);
    this.broadcastRoomRoamers(room);
    this.broadcastRoomsList();
    return { ok: true, seatIndex: available.seatIndex };
  }

  billiardLeave({ roomCode, playerId }) {
    return this.standUp({ roomCode, playerId });
  }

  billiardToggleBot({ roomCode, playerId, seatIndex }) {
    const room = this.getRoom(roomCode);
    if (!room || !room.billiard) return { ok: false, error: 'Masa bulunamadı.' };
    const participant = this.findRoomParticipant(room, playerId);
    if (!participant) return { ok: false, error: 'Bu odada değilsiniz.' };
    if (room.hostPlayerId !== playerId && !participant.billiardSeat) {
      return { ok: false, error: 'Bilardo botunu masa kurucusu veya bilardocu ekleyebilir.' };
    }
    const res = room.billiard.toggleBotSeat(seatIndex);
    if (res.ok) {
      this.broadcastRoomState(room);
      this.broadcastRoomBilliard(room);
      this.broadcastRoomsList();
    }
    return res;
  }

  billiardStart({ roomCode, playerId, autoFillBot = true }) {
    const room = this.getRoom(roomCode);
    if (!room || !room.billiard) return { ok: false, error: 'Masa bulunamadı.' };
    const participant = this.findRoomParticipant(room, playerId);
    if (!participant) return { ok: false, error: 'Bu odada değilsiniz.' };
    if (room.hostPlayerId !== playerId && !participant.billiardSeat) {
      return { ok: false, error: 'Bilardo maçını bilardo oyuncuları veya kurucu başlatabilir.' };
    }
    const res = room.billiard.startMatch({ autoFillBot });
    if (res.ok) {
      this.broadcastRoomState(room);
      this.broadcastRoomBilliard(room);
      this.broadcastRoomsList();
    }
    return res;
  }

  billiardAim({ roomCode, playerId, angle, power }) {
    const room = this.getRoom(roomCode);
    if (!room || !room.billiard) return { ok: false };
    const res = room.billiard.updateAim(playerId, { angle, power });
    if (res.ok) {
      for (const pid of this.getAllHumanRecipients(room)) {
        if (pid === playerId) continue;
        this.io.to(`player:${pid}`).emit('room:billiardAim', res.aimState);
      }
    }
    return res;
  }

  billiardPlaceBall({ roomCode, playerId, x, z }) {
    const room = this.getRoom(roomCode);
    if (!room || !room.billiard) return { ok: false, error: 'Masa bulunamadı.' };
    const res = room.billiard.placeCueBall(playerId, { x, z });
    if (res.ok) {
      this.broadcastRoomBilliard(room);
    }
    return res;
  }

  billiardShoot({ roomCode, playerId, angle, power }) {
    const room = this.getRoom(roomCode);
    if (!room || !room.billiard) return { ok: false, error: 'Masa bulunamadı.' };
    return room.billiard.shoot(playerId, { angle, power });
  }

  sideTableJoin({ roomCode, playerId, tableId, seatIndex = null }) {
    const room = this.getRoom(roomCode);
    if (!room || !Array.isArray(room.sideTables)) return { ok: false, error: 'Masa bulunamadı.' };
    const table = room.sideTables.find((t) => t.id === String(tableId || ''));
    if (!table) return { ok: false, error: 'Seçilen yan masa bulunamadı.' };

    const participant = this.findRoomParticipant(room, playerId);
    if (!participant) return { ok: false, error: 'Bu odada değilsiniz.' };

    if (participant.sideTable && participant.sideTable.id === table.id) {
      return { ok: true, tableId: table.id, seatIndex: participant.sideSeat.seatIndex };
    }

    const reqIdx = seatIndex !== null && seatIndex !== undefined ? Number(seatIndex) : null;
    const canTake = (s) =>
      s && (s.type === 'empty' || s.type === 'bot' || (s.type === 'human' && !s.connected));
    const available = reqIdx !== null && Number.isInteger(reqIdx)
      ? (canTake(table.seats[reqIdx]) ? table.seats[reqIdx] : null)
      : table.seats.find((s) => s.type === 'empty') ||
        table.seats.find((s) => s.type === 'human' && !s.connected) ||
        table.seats.find((s) => s.type === 'bot');

    if (!available) {
      return { ok: false, error: `${table.title} masası şu an tamamen dolu.` };
    }

    if (participant.seat) {
      this.vacateOkeySeatForSwitch(room, participant.seat, { putBot: true });
    }
    if (participant.billiardSeat && room.billiard) {
      room.billiard.standHuman(playerId, { convertToBotIfActive: true });
    }
    if (participant.sideTable) {
      participant.sideTable.standHuman(playerId, { convertToBotIfActive: true });
    }
    if (participant.spectator && room.spectators instanceof Map) {
      room.spectators.delete(playerId);
    }
    if (room.roamStates instanceof Map) {
      room.roamStates.delete(playerId);
    }

    const res = table.sitHuman({
      playerId,
      playerName: participant.name,
      playerAvatar: participant.avatar,
      seatIndex: available.seatIndex
    });
    if (!res.ok) return res;

    this.broadcastRoomState(room);
    this.broadcastRoomBilliard(room);
    this.broadcastRoomSideTables(room);
    this.broadcastRoomRoamers(room);
    this.broadcastRoomsList();
    return { ok: true, tableId: table.id, seatIndex: res.seatIndex };
  }

  sideTableLeave({ roomCode, playerId }) {
    return this.standUp({ roomCode, playerId });
  }

  sideTableToggleBot({ roomCode, playerId, tableId, seatIndex }) {
    const room = this.getRoom(roomCode);
    if (!room || !Array.isArray(room.sideTables)) return { ok: false, error: 'Masa bulunamadı.' };
    const table = room.sideTables.find((t) => t.id === String(tableId || ''));
    if (!table) return { ok: false, error: 'Yan masa bulunamadı.' };
    const participant = this.findRoomParticipant(room, playerId);
    if (!participant) return { ok: false, error: 'Bu odada değilsiniz.' };
    const res = table.toggleBotSeat(seatIndex);
    if (res.ok) {
      this.broadcastRoomSideTables(room);
      this.broadcastRoomState(room);
      this.broadcastRoomsList();
    }
    return res;
  }

  sideTableStart({ roomCode, playerId, tableId, autoFillBot = true }) {
    const room = this.getRoom(roomCode);
    if (!room || !Array.isArray(room.sideTables)) return { ok: false, error: 'Masa bulunamadı.' };
    const table = room.sideTables.find((t) => t.id === String(tableId || ''));
    if (!table) return { ok: false, error: 'Yan masa bulunamadı.' };
    const participant = this.findRoomParticipant(room, playerId);
    if (!participant) return { ok: false, error: 'Bu odada değilsiniz.' };
    const res = table.startMatch({ autoFillBot });
    if (res.ok) {
      this.broadcastRoomSideTables(room);
      this.broadcastRoomState(room);
      this.broadcastRoomsList();
    }
    return res;
  }

  sideTableAction({ roomCode, playerId, tableId, action, payload = {} }) {
    const room = this.getRoom(roomCode);
    if (!room || !Array.isArray(room.sideTables)) return { ok: false, error: 'Masa bulunamadı.' };
    const sideHit = this.findHumanSideTable(room, playerId);
    const table = tableId
      ? room.sideTables.find((t) => t.id === String(tableId))
      : sideHit?.table;
    if (!table) return { ok: false, error: 'Bu masada oturmuyorsunuz.' };
    const res = table.performAction(playerId, action, payload);
    if (res.ok) {
      this.broadcastRoomSideTables(room);
    }
    return res;
  }

  roamMove({ roomCode, playerId, x, z, yaw, active = true }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false };
    const participant = this.findRoomParticipant(room, playerId);
    if (!participant) return { ok: false };

    if (!(room.roamStates instanceof Map)) room.roamStates = new Map();
    if (!active) {
      room.roamStates.delete(playerId);
      this.broadcastRoomRoamers(room);
      return { ok: true };
    }

    const clampedX = Math.max(-45.5, Math.min(45.5, Number(x) || 0));
    const clampedZ = Math.max(-39.5, Math.min(39.5, Number(z) || 0));
    const cleanYaw = Number.isFinite(Number(yaw)) ? Number(yaw) : 0;
    const key = this.ensureRoamerKey(room, playerId);

    room.roamStates.set(playerId, {
      key,
      name: participant.name,
      avatar: participant.avatar,
      activity: participant.activity,
      active: true,
      x: Math.round(clampedX * 100) / 100,
      z: Math.round(clampedZ * 100) / 100,
      yaw: Math.round(cleanYaw * 1000) / 1000,
      updatedAt: Date.now()
    });
    this.broadcastRoomRoamers(room);
    return { ok: true };
  }

  leaveCurrentRoom(playerId, { disconnectOnly = false } = {}) {
    const code = this.playerToRoom.get(playerId);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (!room) {
      this.playerToRoom.delete(playerId);
      return null;
    }

    const okeyHasPlay = room.status === 'playing';
    const billiardHasPlay = room.billiard?.phase === 'playing';
    const sideHasPlay = Array.isArray(room.sideTables) && room.sideTables.some((t) => t.phase === 'playing');
    const keepForDisconnect = disconnectOnly && (okeyHasPlay || billiardHasPlay || sideHasPlay);

    if (!keepForDisconnect && room.roamStates instanceof Map) {
      room.roamStates.delete(playerId);
    }

    if (room.spectators instanceof Map && room.spectators.has(playerId)) {
      const spec = room.spectators.get(playerId);
      if (keepForDisconnect) {
        spec.connected = false;
      } else {
        this.playerToRoom.delete(playerId);
        room.spectators.delete(playerId);
      }
      const connectedAfterSpec = this.getConnectedHumanIds(room);
      if (connectedAfterSpec.length === 0) {
        if (keepForDisconnect) {
          this.scheduleRoomDisconnectCleanup(room);
        } else {
          this.destroyRoomResources(room);
          this.broadcastRoomsList();
          return null;
        }
      } else if (!disconnectOnly && room.hostPlayerId === playerId) {
        room.hostPlayerId = connectedAfterSpec[0];
      }
      this.broadcastRoomState(room);
      this.broadcastRoomRoamers(room);
      this.broadcastRoomsList();
      return room;
    }

    const bSeat = room.billiard?.findHumanSeat(playerId) || null;
    if (bSeat) {
      if (keepForDisconnect) {
        bSeat.connected = false;
      } else {
        this.playerToRoom.delete(playerId);
        room.billiard.standHuman(playerId, { convertToBotIfActive: true });
      }
      const connectedAfterB = this.getConnectedHumanIds(room);
      if (connectedAfterB.length === 0) {
        if (keepForDisconnect) {
          this.scheduleRoomDisconnectCleanup(room);
        } else {
          this.destroyRoomResources(room);
          this.broadcastRoomsList();
          return null;
        }
      } else if (!disconnectOnly && room.hostPlayerId === playerId) {
        room.hostPlayerId = connectedAfterB[0];
      }
      this.broadcastRoomState(room);
      this.broadcastRoomBilliard(room);
      this.broadcastRoomsList();
      return room;
    }

    const sideHit = this.findHumanSideTable(room, playerId);
    if (sideHit) {
      if (disconnectOnly && sideHit.table.phase === 'playing') {
        sideHit.seat.connected = false;
      } else {
        this.playerToRoom.delete(playerId);
        sideHit.table.standHuman(playerId, { convertToBotIfActive: true });
      }
      const connectedAfterSide = this.getConnectedHumanIds(room);
      if (connectedAfterSide.length === 0) {
        if (keepForDisconnect) {
          this.scheduleRoomDisconnectCleanup(room);
        } else {
          this.destroyRoomResources(room);
          this.broadcastRoomsList();
          return null;
        }
      } else if (!disconnectOnly && room.hostPlayerId === playerId) {
        room.hostPlayerId = connectedAfterSide[0];
      }
      this.broadcastRoomState(room);
      this.broadcastRoomSideTables(room);
      this.broadcastRoomsList();
      return room;
    }

    const seat = room.seats.find(
      (s) => s.type === 'human' && s.playerId === playerId
    );
    if (!seat) {
      this.playerToRoom.delete(playerId);
      return null;
    }

    if (disconnectOnly && okeyHasPlay) {
      seat.connected = false;
      if (room.session) {
        room.session.updateSeatConnection(seat.seatIndex, { connected: false });
      }
      const connectedHumans = this.getConnectedHumanIds(room);
      if (connectedHumans.length === 0) {
        this.scheduleRoomDisconnectCleanup(room);
      }
      this.broadcastRoomState(room);
      return room;
    }

    this.playerToRoom.delete(playerId);
    this.vacateOkeySeatForSwitch(room, seat, { putBot: false });

    const activeHumans = this.getConnectedHumanIds(room);
    if (activeHumans.length === 0) {
      this.destroyRoomResources(room);
      this.broadcastRoomsList();
      return null;
    }

    if (room.hostPlayerId === playerId) {
      room.hostPlayerId = activeHumans[0];
    }

    this.broadcastRoomState(room);
    this.broadcastRoomsList();
    return room;
  }

  scheduleRoomDisconnectCleanup(room) {
    if (!room || room.cleanupTimer) return;
    room.cleanupTimer = setTimeout(() => {
      room.cleanupTimer = null;
      if (this.getConnectedHumanIds(room).length > 0) return;
      this.destroyRoomResources(room);
      this.broadcastRoomsList();
    }, 120000);
    room.cleanupTimer.unref?.();
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

    const prevAmbiance = room.options.roomAmbiance;
    if (options.roomAtmosphere !== undefined) {
      room.options.roomAtmosphere = normalizeRoomAtmosphere(options.roomAtmosphere);
    }
    if (options.roomAmbiance !== undefined) {
      room.options.roomAmbiance = normalizeRoomAmbiance(options.roomAmbiance);
      if (room.options.roomAmbiance === 'none') {
        room.ambianceTrack = null;
        this.broadcastRoomAmbiance(room);
      } else if (room.options.roomAmbiance !== prevAmbiance) {
        room.ambianceTrack = null;
      }
    }

    this.broadcastRoomState(room);
    this.broadcastRoomsList();
    return { ok: true };
  }

  startGame(roomCode, hostPlayerId) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const isHost = room.hostPlayerId === hostPlayerId;
    const isSeatedOkey = room.seats.some((s) => s.type === 'human' && s.playerId === hostPlayerId);
    const hostAtOkey = room.seats.some((s) => s.type === 'human' && s.playerId === room.hostPlayerId);
    if (!isHost && (!isSeatedOkey || hostAtOkey)) {
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
    const actor = this.findRoomParticipant(room, playerId);
    if (!actor) return { ok: false, error: 'Bu odada bulunmuyorsunuz.' };

    if (resolvedPayload) {
      return this.applyResolvedMusic(room, actor, resolvedPayload, mode);
    }

    const parsed = parseMusicUrl(url, title);
    if (!parsed.ok) return parsed;
    if (parsed.needsResolution) {
      return { ok: false, error: 'Parça sunucuda çözümlenmeyi bekliyor.' };
    }

    return this.applyResolvedMusic(room, actor, { ok: true, track: parsed, queue: [parsed] }, mode);
  }

  async resolveAndSetRoomMusic({ roomCode, playerId, url, title, mode = 'replace', fetchImpl }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const actor = this.findRoomParticipant(room, playerId);
    if (!actor) return { ok: false, error: 'Bu odada bulunmuyorsunuz.' };

    const resolved = await resolveMusicInput(url, title, { fetchImpl });
    if (!resolved.ok) return resolved;

    return this.applyResolvedMusic(room, actor, resolved, mode);
  }

  setMusicAutoplay({ roomCode, playerId, enabled }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const actor = this.findRoomParticipant(room, playerId);
    if (!actor) return { ok: false, error: 'Bu odada bulunmuyorsunuz.' };

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
    const actor = this.findRoomParticipant(room, playerId);
    if (!actor) return { ok: false, error: 'Bu odada bulunmuyorsunuz.' };

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
        queue[nextIdx] = { ...resolvedTrack, updatedBy: candidate.updatedBy || actor.name || 'Oyuncu' };
        room.musicQueueIndex = nextIdx;
        this.recordMusicHistory(room, resolvedTrack);
        room.music = {
          ...resolvedTrack,
          updatedBy: candidate.updatedBy || actor.name || 'Oyuncu',
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
    const actor = this.findRoomParticipant(room, playerId);
    if (!actor) return { ok: false, error: 'Bu odada bulunmuyorsunuz.' };

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

    queue[targetIdx] = { ...resolvedTrack, updatedBy: candidate.updatedBy || actor.name || 'Oyuncu' };
    room.musicQueueIndex = targetIdx;
    this.recordMusicHistory(room, resolvedTrack);
    room.music = {
      ...resolvedTrack,
      updatedBy: candidate.updatedBy || actor.name || 'Oyuncu',
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
    const actor = this.findRoomParticipant(room, playerId);
    if (!actor) return { ok: false, error: 'Bu odada bulunmuyorsunuz.' };

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
        queue[playIdx] = { ...resolvedTrack, updatedBy: candidate.updatedBy || actor.name || 'Oyuncu' };
        room.musicQueueIndex = playIdx;
        this.recordMusicHistory(room, resolvedTrack);
        room.music = {
          ...resolvedTrack,
          updatedBy: candidate.updatedBy || actor.name || 'Oyuncu',
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
    const actor = this.findRoomParticipant(room, playerId);
    if (!actor) return { ok: false, error: 'Bu odada bulunmuyorsunuz.' };

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
    const actor = this.findRoomParticipant(room, playerId);
    if (!actor) return { ok: false, error: 'Bu odada bulunmuyorsunuz.' };

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
    const actor = this.findRoomParticipant(room, playerId);
    if (!actor) return { ok: false, error: 'Bu odada bulunmuyorsunuz.' };

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
    const actor = this.findRoomParticipant(room, playerId);
    if (!actor) return { ok: false, error: 'Bu odada bulunmuyorsunuz.' };

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
    const actor = this.findRoomParticipant(room, playerId);
    if (!actor) return { ok: false, error: 'Bu odada bulunmuyorsunuz.' };

    room.music = null;
    room.musicQueue = [];
    room.musicQueueIndex = 0;
    room.musicHistory = [];
    this.broadcastRoomMusic(room);
    return { ok: true };
  }

  broadcastRoomMusic(room) {
    for (const pid of this.getAllHumanRecipients(room)) {
      this.io.to(`player:${pid}`).emit('room:music', room.music);
    }
  }

  broadcastRoomTv(room) {
    for (const pid of this.getAllHumanRecipients(room)) {
      this.io.to(`player:${pid}`).emit('room:tv', room.tv || null);
    }
  }

  async resolveAndSetRoomTv({ roomCode, playerId, channelId = '', url = '', title = '', fetchImpl = globalThis.fetch }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const sender = this.findRoomParticipant(room, playerId);
    if (!sender) return { ok: false, error: 'Bu odada bulunmuyorsunuz.' };

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
    const sender = this.findRoomParticipant(room, playerId);
    if (!sender) return { ok: false, error: 'Bu odada bulunmuyorsunuz.' };

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
    const sender = this.findRoomParticipant(room, playerId);
    if (!sender) return { ok: false, error: 'Bu odada bulunmuyorsunuz.' };

    room.tv = null;
    this.broadcastRoomTv(room);
    return { ok: true, tv: null };
  }

  broadcastRoomAmbiance(room) {
    for (const pid of this.getAllHumanRecipients(room)) {
      this.io.to(`player:${pid}`).emit('room:ambiance', room.ambianceTrack || null);
    }
  }

  async ensureRoomAmbianceResolved(roomCode, { fetchImpl = globalThis.fetch } = {}) {
    const room = this.getRoom(roomCode);
    if (!room) return null;
    const ambId = room.options?.roomAmbiance || 'none';
    if (ambId === 'none') {
      room.ambianceTrack = null;
      this.broadcastRoomAmbiance(room);
      return null;
    }

    const res = await resolveAmbianceInput('', { ambianceId: ambId, fetchImpl });
    const latestRoom = this.getRoom(roomCode);
    if (!latestRoom || latestRoom.options?.roomAmbiance !== ambId) {
      return null;
    }
    if (res?.ok && res.ambiance) {
      latestRoom.ambianceTrack = {
        ...res.ambiance,
        updatedAt: Date.now()
      };
      this.broadcastRoomAmbiance(latestRoom);
      return latestRoom.ambianceTrack;
    }
    return null;
  }

  async resolveAndSetRoomAmbiance({
    roomCode,
    hostPlayerId,
    ambianceId = '',
    url = '',
    title = '',
    ambiancePayload = null,
    fetchImpl = globalThis.fetch
  }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    if (room.hostPlayerId !== hostPlayerId) {
      return { ok: false, error: 'Ortam sesini yalnızca masa kurucusu değiştirebilir.' };
    }

    const cleanId = String(ambianceId || '').trim();
    const cleanUrl = String(url || '').trim();
    if (cleanId === 'none' || cleanUrl.toLowerCase() === 'none') {
      room.options.roomAmbiance = 'none';
      room.ambianceTrack = null;
      this.broadcastRoomAmbiance(room);
      this.broadcastRoomState(room);
      this.broadcastRoomsList();
      return { ok: true, ambiance: null, options: room.options };
    }

    let resolved;
    if (ambiancePayload && typeof ambiancePayload === 'object' && ambiancePayload.embedUrl) {
      const videoId = ambiancePayload.videoId || null;
      resolved = {
        ok: true,
        ambiance: {
          ambianceId: cleanId || ambiancePayload.ambianceId || 'custom',
          provider: 'youtube',
          title: String(ambiancePayload.title || 'Ortam Sesi').slice(0, 64),
          videoId,
          fallbackVideoIds: Array.isArray(ambiancePayload.fallbackVideoIds)
            ? ambiancePayload.fallbackVideoIds.slice(0, 5)
            : [],
          originalUrl: ambiancePayload.originalUrl || '',
          embedUrl: videoId ? buildAmbianceEmbedUrl(videoId) : String(ambiancePayload.embedUrl)
        }
      };
    } else {
      resolved = await resolveAmbianceInput(cleanUrl, { ambianceId: cleanId, title, fetchImpl });
    }

    if (!resolved?.ok) {
      return resolved || { ok: false, error: 'Ortam sesi çözümlenemedi.' };
    }

    if (ROOM_AMBIANCES.some((a) => a.id === cleanId)) {
      room.options.roomAmbiance = cleanId;
    } else if (room.options.roomAmbiance === 'none') {
      room.options.roomAmbiance = 'rain';
    }

    room.ambianceTrack = resolved.ambiance
      ? {
          ...resolved.ambiance,
          updatedAt: Date.now()
        }
      : null;

    this.broadcastRoomAmbiance(room);
    this.broadcastRoomState(room);
    this.broadcastRoomsList();
    return { ok: true, ambiance: room.ambianceTrack, options: room.options };
  }

  orderTreat({ roomCode, playerId, itemId, target = 'self' }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const sender = this.findRoomParticipant(room, playerId);
    if (!sender) return { ok: false, error: 'Bu odada bulunmuyorsunuz.' };

    const item = KAHVE_MENU_MAP.get(String(itemId || ''));
    if (!item) return { ok: false, error: 'Geçersiz kahvehane siparişi.' };

    if (!Array.isArray(room.orders)) room.orders = createEmptyOrders();
    if (!Array.isArray(room.socialStats)) room.socialStats = createEmptySocialStats();

    const targetIndices = [];
    if (target === 'all') {
      room.seats.forEach((s) => {
        if (s.type !== 'empty') targetIndices.push(s.seatIndex);
      });
      if (targetIndices.length === 0) {
        return { ok: false, error: 'Okey masasında sipariş gönderilecek kimse yok.' };
      }
    } else if (target === 'self') {
      if (sender.seatIndex === null) {
        return { ok: false, error: 'Kendinize ikram koymak için Okey masasında oturmalısınız veya masaya ısmarlayabilirsiniz.' };
      }
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

    if (sender.seatIndex !== null && room.socialStats[sender.seatIndex]) {
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

  petCat({ roomCode, playerId, catIndex, action = 'pet' }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const sender = this.findRoomParticipant(room, playerId);
    if (!sender) return { ok: false, error: 'Bu masada değilsiniz.' };

    const idx = Number(catIndex);
    const cat = Number.isInteger(idx) ? KAHVE_CATS[idx] : null;
    if (!cat) {
      return { ok: false, error: 'Geçersiz kedi seçimi.' };
    }

    const cleanAction = VALID_CAT_ACTIONS.has(String(action || 'pet')) ? String(action || 'pet') : 'pet';

    if (!Array.isArray(room.socialStats)) room.socialStats = createEmptySocialStats();
    if (sender.seatIndex !== null && room.socialStats[sender.seatIndex]) {
      room.socialStats[sender.seatIndex].catsPetted += 1;
    }

    room.catPetSeq = (room.catPetSeq || 0) + 1;
    const payload = {
      id: room.catPetSeq,
      catIndex: idx,
      cat,
      action: cleanAction,
      seatIndex: sender.seatIndex,
      isSpectator: sender.isSpectator,
      name: sender.name || 'Oyuncu',
      socialStats: room.socialStats,
      at: Date.now()
    };

    for (const pid of this.getAllHumanRecipients(room)) {
      this.io.to(`player:${pid}`).emit('room:catPetted', payload);
    }
    return { ok: true, payload };
  }

  clearSeatOrder({ roomCode, playerId, target = 'self' }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const sender = this.findRoomParticipant(room, playerId);
    if (!sender) return { ok: false, error: 'Bu odada bulunmuyorsunuz.' };

    if (!Array.isArray(room.orders)) room.orders = createEmptyOrders();
    if (target === 'all') {
      if (room.hostPlayerId !== playerId) {
        return { ok: false, error: 'Tüm masanın siparişlerini yalnızca kurucu temizleyebilir.' };
      }
      room.orders = createEmptyOrders();
    } else if (sender.seatIndex !== null) {
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
    for (const pid of this.getAllHumanRecipients(room)) {
      this.io.to(`player:${pid}`).emit('room:orders', payload);
    }
  }

  sendChatMessage({ roomCode, playerId, text = '', quickId = null }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const sender = this.findRoomParticipant(room, playerId);
    if (!sender) return { ok: false, error: 'Bu masada değilsiniz.' };

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
      isSpectator: sender.isSpectator,
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

    for (const pid of this.getAllHumanRecipients(room)) {
      this.io.to(`player:${pid}`).emit('room:chat', entry);
    }
    return { ok: true, entry };
  }

  sendTableNudge({ roomCode, playerId, targetSeatIndex = null }) {
    const room = this.getRoom(roomCode);
    if (!room) return { ok: false, error: 'Masa bulunamadı.' };
    const sender = this.findRoomParticipant(room, playerId);
    if (!sender) return { ok: false, error: 'Bu masada değilsiniz.' };

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
      isSpectator: sender.isSpectator,
      name: sender.name || 'Oyuncu',
      targetSeatIndex: validTarget,
      sentAt: now
    };

    for (const pid of this.getAllHumanRecipients(room)) {
      this.io.to(`player:${pid}`).emit('room:nudge', nudge);
    }
    return { ok: true, nudge };
  }

  getRoomPayloadForPlayer(room, playerId) {
    const mySeat = room.seats.find(
      (s) => s.type === 'human' && s.playerId === playerId
    );
    const myBilliardSeat = !mySeat && room.billiard?.findHumanSeat
      ? room.billiard.findHumanSeat(playerId)
      : null;
    const mySideHit = !mySeat && !myBilliardSeat
      ? this.findHumanSideTable(room, playerId)
      : null;
    const mySpectator = !mySeat && !myBilliardSeat && !mySideHit && room.spectators instanceof Map
      ? room.spectators.get(playerId) || null
      : null;
    const myActivity = mySeat
      ? 'okey'
      : myBilliardSeat
        ? 'billiard'
        : mySideHit
          ? 'sideTable'
          : 'spectator';
    const isSpectator = myActivity === 'spectator';
    const watchSeatIndex = mySpectator ? mySpectator.watchSeatIndex : null;
    const viewerSeatIndex = mySeat ? mySeat.seatIndex : (watchSeatIndex ?? 0);
    const spectatorsList = room.spectators instanceof Map
      ? Array.from(room.spectators.values()).map((sp) => ({
          name: sp.name,
          avatar: sp.avatar,
          connected: sp.connected,
          watchSeatIndex: sp.watchSeatIndex
        }))
      : [];

    return {
      code: room.code,
      name: room.name,
      status: room.status,
      isHost: room.hostPlayerId === playerId,
      myActivity,
      billiardSeatIndex: myBilliardSeat ? myBilliardSeat.seatIndex : null,
      mySideTableId: mySideHit ? mySideHit.table.id : null,
      mySideSeatIndex: mySideHit ? mySideHit.seat.seatIndex : null,
      myRoamerKey: this.ensureRoamerKey(room, playerId),
      isSpectator,
      watchSeatIndex,
      spectators: spectatorsList,
      spectatorCount: spectatorsList.length,
      roamers: this.getRoamersPayload(room),
      billiard: room.billiard ? room.billiard.getClientView() : null,
      sideTables: this.getSideTablesPayload(room, playerId),
      music: room.music || null,
      tv: room.tv || null,
      ambianceTrack: room.ambianceTrack || null,
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
      game: room.session
        ? room.session.getClientView(mySeat ? mySeat.seatIndex : 0, {
            isSpectator: !mySeat,
            watchSeatIndex
          })
        : null
    };
  }

  broadcastRoomState(room) {
    for (const pid of this.getAllHumanRecipients(room)) {
      const payload = this.getRoomPayloadForPlayer(room, pid);
      this.io.to(`player:${pid}`).emit('room:state', payload);
    }
  }

  broadcastRoomsList() {
    this.io.emit('rooms:list', this.listPublicRooms());
  }
}
