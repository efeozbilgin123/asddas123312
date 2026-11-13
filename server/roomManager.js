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

  createRoom({ playerId, playerName, roomName, options = {}, quickStart = false }) {
    this.leaveCurrentRoom(playerId);

    const code = generateRoomCode(this.rooms);
    const cleanName = (playerName || '').trim().slice(0, 20) || 'Oyuncu 1';
    const cleanRoomName =
      (roomName || '').trim().slice(0, 32) || `${cleanName} Masası`;

    const room = {
      code,
      name: cleanRoomName,
      hostPlayerId: playerId,
      status: 'waiting', // 'waiting' | 'playing'
      createdAt: Date.now(),
      options: {
        katlamali: Boolean(options.katlamali),
        islekPenalty: options.islekPenalty !== false,
        turnSeconds: [45, 60, 90].includes(Number(options.turnSeconds))
          ? Number(options.turnSeconds)
          : 60
      },
      seats: [
        { seatIndex: 0, type: 'human', playerId, name: cleanName, connected: true },
        { seatIndex: 1, type: 'empty', playerId: null, name: null, connected: false },
        { seatIndex: 2, type: 'empty', playerId: null, name: null, connected: false },
        { seatIndex: 3, type: 'empty', playerId: null, name: null, connected: false }
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

  joinRoom({ roomCode, playerId, playerName }) {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: 'Bu kodla bir masa bulunamadı.' };
    }

    const cleanName = (playerName || '').trim().slice(0, 20) || 'Oyuncu';

    // Check if player is reconnecting to an existing seat in this room
    const existingSeat = room.seats.find(
      (s) => s.type === 'human' && s.playerId === playerId
    );
    if (existingSeat) {
      existingSeat.connected = true;
      existingSeat.name = cleanName;
      this.playerToRoom.set(playerId, code);
      if (room.session) {
        room.session.updateSeatConnection(existingSeat.seatIndex, {
          name: cleanName,
          connected: true
        });
      }
      return { ok: true, room, seatIndex: existingSeat.seatIndex };
    }

    this.leaveCurrentRoom(playerId);

    if (room.status === 'playing') {
      // Allow taking over a disconnected human or bot seat if available? No, only disconnected human or empty
      const openSeat = room.seats.find(
        (s) => s.type === 'empty' || (s.type === 'human' && !s.connected)
      );
      if (!openSeat) {
        return { ok: false, error: 'Bu masa dolu ve oyun devam ediyor.' };
      }
      openSeat.type = 'human';
      openSeat.playerId = playerId;
      openSeat.name = cleanName;
      openSeat.connected = true;
      this.playerToRoom.set(playerId, code);
      if (room.session) {
        room.session.updateSeatConnection(openSeat.seatIndex, {
          playerId,
          name: cleanName,
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
      this.broadcastRoomState(room);
      return room;
    }

    this.playerToRoom.delete(playerId);

    if (room.status === 'waiting') {
      seat.type = 'empty';
      seat.playerId = null;
      seat.name = null;
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
      if (room.session) room.session.destroy();
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
      seat.connected = false;
    }

    this.broadcastRoomState(room);
    this.broadcastRoomsList();
    return { ok: true };
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

    if (options.katlamali !== undefined) {
      room.options.katlamali = Boolean(options.katlamali);
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

    // Fill empty seats with bots
    for (const seat of room.seats) {
      if (seat.type === 'empty') {
        seat.type = 'bot';
        seat.playerId = `bot-${seat.seatIndex}`;
        seat.name = BOT_NAMES[seat.seatIndex] || `Bot ${seat.seatIndex + 1}`;
        seat.connected = true;
      }
    }

    room.status = 'playing';
    room.session = new GameSession({
      roomCode: room.code,
      seatsConfig: room.seats.map((s) => ({
        playerId: s.playerId,
        name: s.name,
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

  getRoomPayloadForPlayer(room, playerId) {
    const mySeat = room.seats.find(
      (s) => s.type === 'human' && s.playerId === playerId
    );
    const viewerSeatIndex = mySeat ? mySeat.seatIndex : 0;

    return {
      code: room.code,
      name: room.name,
      status: room.status,
      hostPlayerId: room.hostPlayerId,
      isHost: room.hostPlayerId === playerId,
      options: room.options,
      viewerSeatIndex,
      seats: room.seats.map((s) => ({
        seatIndex: s.seatIndex,
        type: s.type,
        name: s.name,
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
