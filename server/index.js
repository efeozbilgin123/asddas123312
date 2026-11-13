import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { RoomManager } from './roomManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

const roomManager = new RoomManager(io);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rooms: roomManager.listPublicRooms().length });
});

app.get('/api/rooms', (_req, res) => {
  res.json({ rooms: roomManager.listPublicRooms() });
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

io.on('connection', (socket) => {
  const playerId = String(socket.handshake.auth?.playerId || socket.id);
  socket.join(`player:${playerId}`);
  socket.emit('rooms:list', roomManager.listPublicRooms());

  // Re-sync if this playerId was already in a room
  const existingCode = roomManager.playerToRoom.get(playerId);
  if (existingCode) {
    const room = roomManager.getRoom(existingCode);
    if (room) {
      const seat = room.seats.find(
        (s) => s.type === 'human' && s.playerId === playerId
      );
      if (seat) {
        seat.connected = true;
        if (room.session) {
          room.session.updateSeatConnection(seat.seatIndex, { connected: true });
        }
        roomManager.broadcastRoomState(room);
      }
    }
  }

  socket.on('rooms:get', (ack) => {
    if (typeof ack === 'function') {
      ack({ ok: true, rooms: roomManager.listPublicRooms() });
    }
  });

  socket.on('room:create', (data, ack) => {
    const res = roomManager.createRoom({
      playerId,
      playerName: data?.playerName,
      playerAvatar: data?.playerAvatar,
      roomName: data?.roomName,
      options: data?.options,
      quickStart: Boolean(data?.quickStart)
    });
    if (res.ok) {
      const payload = roomManager.getRoomPayloadForPlayer(res.room, playerId);
      socket.emit('room:state', payload);
      if (typeof ack === 'function') ack({ ok: true, state: payload });
    } else if (typeof ack === 'function') {
      ack(res);
    }
  });

  socket.on('room:join', (data, ack) => {
    const res = roomManager.joinRoom({
      roomCode: data?.roomCode,
      playerId,
      playerName: data?.playerName,
      playerAvatar: data?.playerAvatar
    });
    if (res.ok) {
      const payload = roomManager.getRoomPayloadForPlayer(res.room, playerId);
      socket.emit('room:state', payload);
      if (typeof ack === 'function') ack({ ok: true, state: payload });
    } else if (typeof ack === 'function') {
      ack(res);
    }
  });

  socket.on('room:leave', (_data, ack) => {
    roomManager.leaveCurrentRoom(playerId, { disconnectOnly: false });
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('room:toggleBot', (data, ack) => {
    const code = roomManager.playerToRoom.get(playerId);
    const res = roomManager.toggleBotSeat({
      roomCode: code,
      hostPlayerId: playerId,
      seatIndex: Number(data?.seatIndex)
    });
    if (typeof ack === 'function') ack(res);
  });

  socket.on('room:options', (data, ack) => {
    const code = roomManager.playerToRoom.get(playerId);
    const res = roomManager.updateOptions({
      roomCode: code,
      hostPlayerId: playerId,
      options: data || {}
    });
    if (typeof ack === 'function') ack(res);
  });

  socket.on('room:start', (_data, ack) => {
    const code = roomManager.playerToRoom.get(playerId);
    const res = roomManager.startGame(code, playerId);
    if (typeof ack === 'function') ack(res);
  });

  socket.on('room:musicSet', (data, ack) => {
    const code = roomManager.playerToRoom.get(playerId);
    const res = roomManager.setRoomMusic({
      roomCode: code,
      playerId,
      url: data?.url,
      title: data?.title
    });
    if (typeof ack === 'function') ack(res);
  });

  socket.on('room:musicStop', (_data, ack) => {
    const code = roomManager.playerToRoom.get(playerId);
    const res = roomManager.stopRoomMusic({
      roomCode: code,
      playerId
    });
    if (typeof ack === 'function') ack(res);
  });

  socket.on('room:orderTreat', (data, ack) => {
    const code = roomManager.playerToRoom.get(playerId);
    const res = roomManager.orderTreat({
      roomCode: code,
      playerId,
      itemId: data?.itemId,
      target: data?.target || 'self'
    });
    if (typeof ack === 'function') ack(res);
  });

  socket.on('room:orderClear', (data, ack) => {
    const code = roomManager.playerToRoom.get(playerId);
    const res = roomManager.clearSeatOrder({
      roomCode: code,
      playerId,
      target: data?.target || 'self'
    });
    if (typeof ack === 'function') ack(res);
  });

  function withSession(fn) {
    const code = roomManager.playerToRoom.get(playerId);
    const room = roomManager.getRoom(code);
    if (!room || !room.session) {
      return { ok: false, error: 'Aktif oyun oturumu yok.' };
    }
    const seat = room.seats.find(
      (s) => s.type === 'human' && s.playerId === playerId
    );
    if (!seat) {
      return { ok: false, error: 'Bu masada koltuğunuz bulunmuyor.' };
    }
    return fn(room, room.session, seat.seatIndex);
  }

  socket.on('game:drawDeck', (_data, ack) => {
    const res = withSession((_r, s, seatIdx) => s.drawFromDeck(seatIdx));
    if (typeof ack === 'function') ack(res);
  });

  socket.on('game:drawDiscard', (_data, ack) => {
    const res = withSession((_r, s, seatIdx) => s.drawFromDiscard(seatIdx));
    if (typeof ack === 'function') ack(res);
  });

  socket.on('game:returnDiscard', (_data, ack) => {
    const res = withSession((_r, s, seatIdx) => s.returnPickedDiscard(seatIdx));
    if (typeof ack === 'function') ack(res);
  });

  socket.on('game:openHand', (data, ack) => {
    const res = withSession((_r, s, seatIdx) =>
      s.openHand(seatIdx, data?.groups, data?.mode)
    );
    if (typeof ack === 'function') ack(res);
  });

  socket.on('game:layMeld', (data, ack) => {
    const res = withSession((_r, s, seatIdx) =>
      s.layMeld(seatIdx, data?.tileIds)
    );
    if (typeof ack === 'function') ack(res);
  });

  socket.on('game:layoffTile', (data, ack) => {
    const res = withSession((_r, s, seatIdx) =>
      s.layoffTile(seatIdx, data?.tileId, data?.meldId)
    );
    if (typeof ack === 'function') ack(res);
  });

  socket.on('game:discard', (data, ack) => {
    const res = withSession((_r, s, seatIdx) =>
      s.discardTile(seatIdx, data?.tileId)
    );
    if (typeof ack === 'function') ack(res);
  });

  socket.on('game:nextRound', (_data, ack) => {
    const res = withSession((room, s) => {
      if (room.hostPlayerId !== playerId) {
        return { ok: false, error: 'Yeni eli yalnızca masa kurucusu başlatabilir.' };
      }
      if (s.phase !== 'roundOver') {
        return { ok: false, error: 'Mevcut el henüz bitmedi.' };
      }
      s.startRound();
      return { ok: true };
    });
    if (typeof ack === 'function') ack(res);
  });

  const ADMIN_PIN = String(process.env.ADMIN_PIN || '101101').trim();

  socket.on('admin:unlock', (data, ack) => {
    const pin = String(data?.pin || '').trim();
    if (!pin || pin !== ADMIN_PIN) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Gizli anahtar hatalı.' });
      return;
    }
    socket.data.isAdmin = true;
    const res = withSession((_r, s) => ({ ok: true, snapshot: s.getAdminSnapshot() }));
    if (typeof ack === 'function') {
      ack(res.ok ? res : { ok: true, snapshot: null });
    }
  });

  socket.on('admin:snapshot', (_data, ack) => {
    if (!socket.data.isAdmin) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Yetkisiz erişim.' });
      return;
    }
    const res = withSession((_r, s) => ({ ok: true, snapshot: s.getAdminSnapshot() }));
    if (typeof ack === 'function') ack(res);
  });

  socket.on('admin:swapTile', (data, ack) => {
    if (!socket.data.isAdmin) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Yetkisiz erişim.' });
      return;
    }
    const res = withSession((_r, s, seatIdx) => {
      const out = s.adminSwapTile({
        actorSeatIndex: seatIdx,
        myTileId: data?.myTileId,
        sourceKind: data?.sourceKind,
        targetSeatIndex: data?.targetSeatIndex,
        targetTileId: data?.targetTileId
      });
      if (!out.ok) return out;
      return { ok: true, snapshot: s.getAdminSnapshot() };
    });
    if (typeof ack === 'function') ack(res);
  });

  socket.on('admin:stealOkey', (data, ack) => {
    if (!socket.data.isAdmin) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Yetkisiz erişim.' });
      return;
    }
    const res = withSession((_r, s, seatIdx) => {
      const out = s.adminStealOkey(seatIdx, data?.myTileId);
      if (!out.ok) return out;
      return { ok: true, snapshot: s.getAdminSnapshot() };
    });
    if (typeof ack === 'function') ack(res);
  });

  socket.on('disconnect', () => {
    roomManager.leaveCurrentRoom(playerId, { disconnectOnly: true });
  });
});

const PORT = Number(process.env.PORT) || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Yüzbir 3D sunucusu http://localhost:${PORT} üzerinde hazır.`);
});
