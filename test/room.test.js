import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../server/roomManager.js';

function createMockIo() {
  const emitted = [];
  return {
    emitted,
    emit(event, payload) {
      emitted.push({ target: 'all', event, payload });
    },
    to(room) {
      return {
        emit(event, payload) {
          emitted.push({ target: room, event, payload });
        }
      };
    }
  };
}

test('RoomManager creates, joins, starts with bots, and converts leaving human to bot', () => {
  const io = createMockIo();
  const rm = new RoomManager(io);

  const created = rm.createRoom({
    playerId: 'p1',
    playerName: 'Emre',
    roomName: 'Test Masası'
  });
  assert.equal(created.ok, true);
  const code = created.room.code;

  const joined = rm.joinRoom({
    roomCode: code,
    playerId: 'p2',
    playerName: 'Ayşe'
  });
  assert.equal(joined.ok, true);
  assert.equal(joined.seatIndex, 1);

  const started = rm.startGame(code, 'p1');
  assert.equal(started.ok, true);
  assert.equal(created.room.status, 'playing');
  assert.equal(created.room.seats[2].type, 'bot');
  assert.equal(created.room.seats[3].type, 'bot');

  // p2 leaves mid-game -> seat 1 becomes bot, host p1 still active
  rm.leaveCurrentRoom('p2');
  assert.equal(created.room.seats[1].type, 'bot');
  assert.ok(rm.getRoom(code));

  // p1 leaves -> room cleans up
  rm.leaveCurrentRoom('p1');
  assert.equal(rm.getRoom(code), null);
});

test('RoomManager preserves playerAvatar, teamMode, and maxRounds options', () => {
  const io = createMockIo();
  const rm = new RoomManager(io);

  const created = rm.createRoom({
    playerId: 'p1',
    playerName: 'Efe',
    playerAvatar: 'avatar-5',
    roomName: 'Kahve Masası',
    options: { teamMode: 'paired', katlamali: true, maxRounds: 7, turnSeconds: 90 }
  });
  assert.equal(created.ok, true);
  assert.equal(created.room.seats[0].avatar, 'avatar-5');
  assert.equal(created.room.options.teamMode, 'paired');
  assert.equal(created.room.options.katlamali, true);
  assert.equal(created.room.options.maxRounds, 7);

  const upd = rm.updateOptions({
    roomCode: created.room.code,
    hostPlayerId: 'p1',
    options: { teamMode: 'solo', maxRounds: 0 }
  });
  assert.equal(upd.ok, true);
  assert.equal(created.room.options.teamMode, 'solo');
  assert.equal(created.room.options.maxRounds, 0);
});

test('RoomManager.switchSeat allows moving to empty/bot seats and host human swaps', () => {
  const io = createMockIo();
  const rm = new RoomManager(io);

  const created = rm.createRoom({
    playerId: 'host-1',
    playerName: 'Efe',
    roomName: 'Koltuk Testi',
    options: { teamMode: 'paired' }
  });
  const code = created.room.code;

  // Join p2 into seat 1
  const j2 = rm.joinRoom({ roomCode: code, playerId: 'p2', playerName: 'Ali' });
  assert.equal(j2.seatIndex, 1);

  // Non-host p2 moves to empty seat 2
  const moveEmpty = rm.switchSeat({ roomCode: code, playerId: 'p2', targetSeatIndex: 2 });
  assert.equal(moveEmpty.ok, true);
  assert.equal(created.room.seats[2].playerId, 'p2');
  assert.equal(created.room.seats[1].type, 'empty');

  // Add a bot to seat 3 and move p2 into bot seat 3 (bot swaps to seat 2)
  rm.toggleBotSeat({ roomCode: code, hostPlayerId: 'host-1', seatIndex: 3 });
  assert.equal(created.room.seats[3].type, 'bot');
  const moveBot = rm.switchSeat({ roomCode: code, playerId: 'p2', targetSeatIndex: 3 });
  assert.equal(moveBot.ok, true);
  assert.equal(created.room.seats[3].playerId, 'p2');
  assert.equal(created.room.seats[2].type, 'bot');

  // Non-host p2 cannot steal host's human seat 0
  const badSteal = rm.switchSeat({ roomCode: code, playerId: 'p2', targetSeatIndex: 0 });
  assert.equal(badSteal.ok, false);

  // Host can swap with p2
  const hostSwap = rm.switchSeat({ roomCode: code, playerId: 'host-1', targetSeatIndex: 3 });
  assert.equal(hostSwap.ok, true);
  assert.equal(created.room.seats[3].playerId, 'host-1');
  assert.equal(created.room.seats[0].playerId, 'p2');
});

test('RoomManager handles malformed inputs, double startGame, disconnected takeover, and hides hostPlayerId', (ctx) => {
  const io = createMockIo();
  const rm = new RoomManager(io);
  let created = null;
  ctx.after(() => {
    created?.room?.session?.destroy();
  });

  // Non-string playerName / null options must not throw TypeError
  created = rm.createRoom({
    playerId: 'host-1',
    playerName: 12345,
    roomName: { bad: true },
    options: null
  });
  assert.equal(created.ok, true);
  assert.equal(created.room.seats[0].name, 'Oyuncu 1');

  const code = created.room.code;

  // Non-string join playerName must not throw
  const joined = rm.joinRoom({
    roomCode: code,
    playerId: 'p2',
    playerName: ['array']
  });
  assert.equal(joined.ok, true);
  assert.equal(joined.room.seats[1].name, 'Oyuncu');

  // getRoomPayloadForPlayer must not expose hostPlayerId to clients
  const p2Payload = rm.getRoomPayloadForPlayer(created.room, 'p2');
  assert.equal('hostPlayerId' in p2Payload, false);
  assert.equal(p2Payload.isHost, false);

  // Double startGame while playing must fail cleanly without replacing active session
  const start1 = rm.startGame(code, 'host-1');
  assert.equal(start1.ok, true);
  const firstSession = created.room.session;
  const start2 = rm.startGame(code, 'host-1');
  assert.equal(start2.ok, false);
  assert.equal(created.room.session, firstSession);

  // Disconnected host seat replaced by p3 cleans up host-1 from playerToRoom & transfers host
  rm.leaveCurrentRoom('host-1', { disconnectOnly: true });
  assert.equal(created.room.seats[0].connected, false);
  const joinP3 = rm.joinRoom({ roomCode: code, playerId: 'p3', playerName: 'Yeni' });
  assert.equal(joinP3.ok, true);
  assert.equal(rm.playerToRoom.has('host-1'), false);
  assert.equal(created.room.hostPlayerId, 'p3');

  // If p2 disconnects and p3 leaves, room closes and clears p2's stale playerToRoom entry
  rm.leaveCurrentRoom('p2', { disconnectOnly: true });
  rm.leaveCurrentRoom('p3', { disconnectOnly: false });
  assert.equal(rm.getRoom(code), null);
  assert.equal(rm.playerToRoom.has('p2'), false);
  assert.equal(rm.playerToRoom.has('p3'), false);
});

