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
