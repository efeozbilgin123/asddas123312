import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { findAutoplayTrack, resolveMusicInput } from './musicResolver.js';
import { RoomManager } from './roomManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const app = express();
app.use(express.json({ limit: '32kb' }));
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

app.post('/api/music/resolve', async (req, res) => {
  try {
    const query = req.body?.url || req.body?.query || '';
    const title = req.body?.title || '';
    const resolved = await resolveMusicInput(query, title);
    res.json(resolved);
  } catch (err) {
    console.error('[/api/music/resolve] error:', err);
    res.status(500).json({ ok: false, error: 'Parça çözümlenirken sunucu hatası oluştu.' });
  }
});

app.post('/api/music/autoplay', async (req, res) => {
  try {
    const seedTrack = req.body?.track;
    const excludeVideoIds = Array.isArray(req.body?.excludeVideoIds) ? req.body.excludeVideoIds : [];
    if (!seedTrack || typeof seedTrack !== 'object') {
      res.status(400).json({ ok: false, error: 'Geçersiz parça bilgisi.' });
      return;
    }
    const track = await findAutoplayTrack(seedTrack, { excludeVideoIds });
    if (!track) {
      res.json({ ok: false });
      return;
    }
    res.json({ ok: true, track });
  } catch (err) {
    console.error('[/api/music/autoplay] error:', err);
    res.status(500).json({ ok: false, error: 'Otomatik oynatma parçası bulunamadı.' });
  }
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

io.on('connection', (socket) => {
  const rawPid = typeof socket.handshake.auth?.playerId === 'string'
    ? socket.handshake.auth.playerId.trim().slice(0, 64)
    : '';
  const playerId = rawPid || socket.id;
  socket.join(`player:${playerId}`);
  socket.emit('rooms:list', roomManager.listPublicRooms());

  // Re-sync if this playerId was already in a room, otherwise clear stale client state
  let syncedSeat = false;
  const existingCode = roomManager.playerToRoom.get(playerId);
  if (existingCode) {
    const room = roomManager.getRoom(existingCode);
    if (room) {
      const seat = room.seats.find(
        (s) => s.type === 'human' && s.playerId === playerId
      );
      if (seat) {
        if (room.cleanupTimer) {
          clearTimeout(room.cleanupTimer);
          room.cleanupTimer = null;
        }
        seat.connected = true;
        if (room.session) {
          room.session.updateSeatConnection(seat.seatIndex, { connected: true });
        }
        roomManager.broadcastRoomState(room);
        syncedSeat = true;
      }
    }
  }
  if (!syncedSeat) {
    roomManager.playerToRoom.delete(playerId);
    socket.emit('room:state', null);
  }

  function safeOn(eventName, handler) {
    socket.on(eventName, (data, ack) => {
      try {
        Promise.resolve(handler(data, ack)).catch((err) => {
          console.error(`[socket:${eventName}] async error:`, err);
          if (typeof ack === 'function') {
            ack({ ok: false, error: 'Geçersiz istek.' });
          }
        });
      } catch (err) {
        console.error(`[socket:${eventName}] error:`, err);
        if (typeof ack === 'function') {
          ack({ ok: false, error: 'Geçersiz istek.' });
        }
      }
    });
  }

  socket.on('rooms:get', (ack) => {
    if (typeof ack === 'function') {
      ack({ ok: true, rooms: roomManager.listPublicRooms() });
    }
  });

  safeOn('room:create', (data, ack) => {
    socket.data.isAdmin = false;
    const res = roomManager.createRoom({
      playerId,
      playerName: data?.playerName,
      playerAvatar: data?.playerAvatar,
      roomName: data?.roomName,
      options: data?.options,
      quickStart: Boolean(data?.quickStart),
      seatIndex: data?.seatIndex
    });
    if (res.ok) {
      const payload = roomManager.getRoomPayloadForPlayer(res.room, playerId);
      socket.emit('room:state', payload);
      if (typeof ack === 'function') ack({ ok: true, state: payload });
    } else if (typeof ack === 'function') {
      ack(res);
    }
  });

  safeOn('room:join', (data, ack) => {
    socket.data.isAdmin = false;
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

  safeOn('room:leave', (_data, ack) => {
    socket.data.isAdmin = false;
    roomManager.leaveCurrentRoom(playerId, { disconnectOnly: false });
    if (typeof ack === 'function') ack({ ok: true });
  });

  safeOn('room:toggleBot', (data, ack) => {
    const code = roomManager.playerToRoom.get(playerId);
    const res = roomManager.toggleBotSeat({
      roomCode: code,
      hostPlayerId: playerId,
      seatIndex: Number(data?.seatIndex)
    });
    if (typeof ack === 'function') ack(res);
  });

  safeOn('room:switchSeat', (data, ack) => {
    const code = roomManager.playerToRoom.get(playerId);
    const res = roomManager.switchSeat({
      roomCode: code,
      playerId,
      targetSeatIndex: Number(data?.seatIndex)
    });
    if (typeof ack === 'function') ack(res);
  });

  safeOn('room:options', (data, ack) => {
    const code = roomManager.playerToRoom.get(playerId);
    const res = roomManager.updateOptions({
      roomCode: code,
      hostPlayerId: playerId,
      options: data || {}
    });
    if (typeof ack === 'function') ack(res);
  });

  safeOn('room:start', (_data, ack) => {
    const code = roomManager.playerToRoom.get(playerId);
    const res = roomManager.startGame(code, playerId);
    if (typeof ack === 'function') ack(res);
  });

  safeOn('room:musicSet', async (data, ack) => {
    const code = roomManager.playerToRoom.get(playerId);
    const res = await roomManager.resolveAndSetRoomMusic({
      roomCode: code,
      playerId,
      url: data?.url,
      title: data?.title,
      mode: data?.mode === 'queue' ? 'queue' : 'replace'
    });
    if (typeof ack === 'function') ack(res);
  });

  safeOn('room:musicNext', async (data, ack) => {
    const code = roomManager.playerToRoom.get(playerId);
    const res = await roomManager.advanceRoomMusic({
      roomCode: code,
      playerId,
      currentKey: typeof data?.currentKey === 'string' ? data.currentKey : ''
    });
    if (typeof ack === 'function') ack(res);
  });

  safeOn('room:musicFallback', (data, ack) => {
    const code = roomManager.playerToRoom.get(playerId);
    const res = roomManager.switchMusicFallback({
      roomCode: code,
      playerId,
      currentKey: typeof data?.currentKey === 'string' ? data.currentKey : ''
    });
    if (typeof ack === 'function') ack(res);
  });

  safeOn('room:musicStop', (_data, ack) => {
    const code = roomManager.playerToRoom.get(playerId);
    const res = roomManager.stopRoomMusic({
      roomCode: code,
      playerId
    });
    if (typeof ack === 'function') ack(res);
  });

  safeOn('room:musicAutoplay', (data, ack) => {
    const code = roomManager.playerToRoom.get(playerId);
    const res = roomManager.setMusicAutoplay({
      roomCode: code,
      playerId,
      enabled: data?.enabled
    });
    if (typeof ack === 'function') ack(res);
  });

  safeOn('room:orderTreat', (data, ack) => {
    const code = roomManager.playerToRoom.get(playerId);
    const res = roomManager.orderTreat({
      roomCode: code,
      playerId,
      itemId: data?.itemId,
      target: data?.target || 'self'
    });
    if (typeof ack === 'function') ack(res);
  });

  safeOn('room:orderClear', (data, ack) => {
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

  safeOn('game:drawDeck', (_data, ack) => {
    const res = withSession((_r, s, seatIdx) => s.drawFromDeck(seatIdx));
    if (typeof ack === 'function') ack(res);
  });

  safeOn('game:drawDiscard', (_data, ack) => {
    const res = withSession((_r, s, seatIdx) => s.drawFromDiscard(seatIdx));
    if (typeof ack === 'function') ack(res);
  });

  safeOn('game:returnDiscard', (_data, ack) => {
    const res = withSession((_r, s, seatIdx) => s.returnPickedDiscard(seatIdx));
    if (typeof ack === 'function') ack(res);
  });

  safeOn('game:openHand', (data, ack) => {
    const res = withSession((_r, s, seatIdx) =>
      s.openHand(seatIdx, data?.groups, data?.mode)
    );
    if (typeof ack === 'function') ack(res);
  });

  safeOn('game:layMeld', (data, ack) => {
    const res = withSession((_r, s, seatIdx) =>
      s.layMeld(seatIdx, data?.tileIds)
    );
    if (typeof ack === 'function') ack(res);
  });

  safeOn('game:layoffTile', (data, ack) => {
    const res = withSession((_r, s, seatIdx) =>
      s.layoffTile(seatIdx, data?.tileId, data?.meldId)
    );
    if (typeof ack === 'function') ack(res);
  });

  safeOn('game:discard', (data, ack) => {
    const res = withSession((_r, s, seatIdx) =>
      s.discardTile(seatIdx, data?.tileId)
    );
    if (typeof ack === 'function') ack(res);
  });

  safeOn('game:nextRound', (_data, ack) => {
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
  const adminAttempts = [];

  safeOn('admin:unlock', (data, ack) => {
    const now = Date.now();
    while (adminAttempts.length > 0 && now - adminAttempts[0] > 60000) {
      adminAttempts.shift();
    }
    if (adminAttempts.length >= 8) {
      if (typeof ack === 'function') {
        ack({ ok: false, error: 'Çok fazla deneme yapıldı. Lütfen 1 dakika bekleyin.' });
      }
      return;
    }
    const pin = String(data?.pin || '').trim();
    if (!pin || pin !== ADMIN_PIN) {
      adminAttempts.push(now);
      if (typeof ack === 'function') ack({ ok: false, error: 'Gizli anahtar hatalı.' });
      return;
    }
    socket.data.isAdmin = true;
    const res = withSession((_r, s) => ({ ok: true, snapshot: s.getAdminSnapshot() }));
    if (typeof ack === 'function') {
      ack(res.ok ? res : { ok: true, snapshot: null });
    }
  });

  safeOn('admin:snapshot', (_data, ack) => {
    if (!socket.data.isAdmin) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Yetkisiz erişim.' });
      return;
    }
    const res = withSession((_r, s) => ({ ok: true, snapshot: s.getAdminSnapshot() }));
    if (typeof ack === 'function') ack(res);
  });

  safeOn('admin:swapTile', (data, ack) => {
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

  safeOn('admin:stealOkey', (data, ack) => {
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
    const remaining = io.sockets.adapter.rooms.get(`player:${playerId}`)?.size || 0;
    if (remaining === 0) {
      roomManager.leaveCurrentRoom(playerId, { disconnectOnly: true });
    }
  });
});

const PORT = Number(process.env.PORT) || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Yüzbir 3D sunucusu http://localhost:${PORT} üzerinde hazır.`);
});
