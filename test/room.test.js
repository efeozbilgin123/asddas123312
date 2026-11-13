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

test('RoomManager.switchSeat allows moving to empty/bot/human seats in waiting room and preserves hostPlayerId', () => {
  const io = createMockIo();
  const rm = new RoomManager(io);

  const created = rm.createRoom({
    playerId: 'host-1',
    playerName: 'Efe',
    roomName: 'Koltuk Testi',
    seatIndex: 1,
    options: { teamMode: 'paired' }
  });
  const code = created.room.code;
  assert.equal(created.room.seats[1].playerId, 'host-1');
  assert.equal(created.room.seats[0].type, 'empty');

  // Host moves to seat 0 so remaining flow checks seat 0..3
  const hostToZero = rm.switchSeat({ roomCode: code, playerId: 'host-1', targetSeatIndex: 0 });
  assert.equal(hostToZero.ok, true);
  assert.equal(created.room.seats[0].playerId, 'host-1');

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

  // Non-host p2 can also swap with host's human seat 0 in waiting room, while hostPlayerId stays host-1
  const p2SwapHost = rm.switchSeat({ roomCode: code, playerId: 'p2', targetSeatIndex: 0 });
  assert.equal(p2SwapHost.ok, true);
  assert.equal(created.room.seats[0].playerId, 'p2');
  assert.equal(created.room.seats[3].playerId, 'host-1');
  assert.equal(created.room.hostPlayerId, 'host-1');

  // Host can swap back with p2
  const hostSwap = rm.switchSeat({ roomCode: code, playerId: 'host-1', targetSeatIndex: 0 });
  assert.equal(hostSwap.ok, true);
  assert.equal(created.room.seats[0].playerId, 'host-1');
  assert.equal(created.room.seats[3].playerId, 'p2');
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

test('RoomManager accepts all 16 preset avatars and selects unique bot names from custom pool', async (ctx) => {
  const { BOT_NAME_POOL, isPresetAvatar } = await import('../shared/presets.js');
  const io = createMockIo();
  const rm = new RoomManager(io);
  let created = null;
  ctx.after(() => {
    created?.room?.session?.destroy();
  });

  created = rm.createRoom({
    playerId: 'p1',
    playerName: 'Serhat',
    playerAvatar: 'avatar-16',
    roomName: 'Arkadaş Masası'
  });
  assert.equal(created.ok, true);
  assert.equal(created.room.seats[0].avatar, 'avatar-16');

  const startRes = rm.startGame(created.room.code, 'p1');
  assert.equal(startRes.ok, true);

  const botSeats = created.room.seats.filter((s) => s.type === 'bot');
  assert.equal(botSeats.length, 3);
  const names = botSeats.map((s) => s.name);
  assert.equal(new Set(names).size, 3);
  for (const s of botSeats) {
    assert.ok(BOT_NAME_POOL.includes(s.name), `Unexpected bot name: ${s.name}`);
    assert.notEqual(s.name, 'Serhat');
    assert.ok(isPresetAvatar(s.avatar), `Unexpected bot avatar: ${s.avatar}`);
  }
});

test('RoomManager exposes music queueItems and supports jump, remove, and clear upcoming tracks', async () => {
  const io = createMockIo();
  const rm = new RoomManager(io);
  const created = rm.createRoom({
    playerId: 'h1',
    playerName: 'Efe',
    roomName: 'Müzik Odası'
  });
  const code = created.room.code;

  const first = rm.setRoomMusic({
    roomCode: code,
    playerId: 'h1',
    url: 'https://youtu.be/dQw4w9WgXcQ',
    title: 'İlk Şarkı'
  });
  assert.equal(first.ok, true);
  assert.equal(first.music.queueItems.length, 1);
  assert.equal(first.music.queueItems[0].isCurrent, true);

  const second = rm.setRoomMusic({
    roomCode: code,
    playerId: 'h1',
    url: 'https://youtu.be/9bZkp7q19f0',
    title: 'İkinci Şarkı',
    mode: 'queue'
  });
  assert.equal(second.ok, true);
  assert.equal(second.music.queueTotal, 2);

  const third = rm.setRoomMusic({
    roomCode: code,
    playerId: 'h1',
    url: 'https://youtu.be/kJQP7kiw5Fk',
    title: 'Üçüncü Şarkı',
    mode: 'queue'
  });
  assert.equal(third.ok, true);
  assert.equal(third.music.queueItems.length, 3);
  assert.deepEqual(
    third.music.queueItems.map((x) => [x.title, x.isCurrent]),
    [['İlk Şarkı', true], ['İkinci Şarkı', false], ['Üçüncü Şarkı', false]]
  );

  // Jump directly to index 2
  const jumped = await rm.jumpMusicQueue({ roomCode: code, playerId: 'h1', index: 2 });
  assert.equal(jumped.ok, true);
  assert.equal(jumped.music.title, 'Üçüncü Şarkı');
  assert.equal(jumped.music.queueIndex, 2);
  assert.equal(jumped.music.queueItems[2].isCurrent, true);

  // Remove index 0 (non-current) shifts queueIndex to 1 without interrupting track 3
  const removedFirst = await rm.removeMusicQueueItem({ roomCode: code, playerId: 'h1', index: 0 });
  assert.equal(removedFirst.ok, true);
  assert.equal(removedFirst.music.title, 'Üçüncü Şarkı');
  assert.equal(removedFirst.music.queueIndex, 1);
  assert.equal(removedFirst.music.queueTotal, 2);

  // Remove index 1 (current) switches cleanly to remaining index 0 ('İkinci Şarkı')
  const removedCur = await rm.removeMusicQueueItem({ roomCode: code, playerId: 'h1', index: 1 });
  assert.equal(removedCur.ok, true);
  assert.equal(removedCur.music.title, 'İkinci Şarkı');
  assert.equal(removedCur.music.queueTotal, 1);

  // Add another track then clear upcoming queue
  rm.setRoomMusic({
    roomCode: code,
    playerId: 'h1',
    url: 'https://youtu.be/dQw4w9WgXcQ',
    title: 'Ekstra Şarkı',
    mode: 'queue'
  });
  const cleared = rm.clearUpcomingMusicQueue({ roomCode: code, playerId: 'h1' });
  assert.equal(cleared.ok, true);
  assert.equal(cleared.music.queueTotal, 1);
  assert.equal(cleared.music.title, 'İkinci Şarkı');
  assert.equal(cleared.music.hasNext, false);
});

test('RoomManager supports musicQueueMove, musicQueueShuffle, room chat, and nudge cooldown', async () => {
  const io = createMockIo();
  const rm = new RoomManager(io);
  const created = rm.createRoom({
    playerId: 'h1',
    playerName: 'Efe',
    roomName: 'Sohbet ve Sıra'
  });
  const code = created.room.code;

  rm.joinRoom({ roomCode: code, playerId: 'p2', playerName: 'Arhan' });

  rm.setRoomMusic({ roomCode: code, playerId: 'h1', url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Bir' });
  rm.setRoomMusic({ roomCode: code, playerId: 'h1', url: 'https://youtu.be/9bZkp7q19f0', title: 'İki', mode: 'queue' });
  rm.setRoomMusic({ roomCode: code, playerId: 'h1', url: 'https://youtu.be/kJQP7kiw5Fk', title: 'Üç', mode: 'queue' });
  rm.setRoomMusic({ roomCode: code, playerId: 'h1', url: 'https://youtu.be/3JZ_D3ELwOQ', title: 'Dört', mode: 'queue' });

  // Jump to index 1 ('İki')
  await rm.jumpMusicQueue({ roomCode: code, playerId: 'h1', index: 1 });
  assert.equal(created.room.music.queueIndex, 1);

  // Move index 3 ('Dört') up to index 0 -> current track ('İki') shifts from 1 to 2
  const moved = rm.moveMusicQueueItem({ roomCode: code, playerId: 'h1', fromIndex: 3, toIndex: 0 });
  assert.equal(moved.ok, true);
  assert.equal(moved.music.title, 'İki');
  assert.equal(moved.music.queueIndex, 2);
  assert.deepEqual(moved.music.queueItems.map((q) => q.title), ['Dört', 'Bir', 'İki', 'Üç']);

  // Jump back to 0 and shuffle upcoming [1,2,3] -> index 0 remains 'Dört'
  await rm.jumpMusicQueue({ roomCode: code, playerId: 'h1', index: 0 });
  const shuffled = rm.shuffleMusicQueue({ roomCode: code, playerId: 'h1' });
  assert.equal(shuffled.ok, true);
  assert.equal(shuffled.music.queueItems[0].title, 'Dört');
  assert.equal(shuffled.music.queueItems.length, 4);
  assert.deepEqual(
    shuffled.music.queueItems.map((q) => q.title).sort(),
    ['Bir', 'Dört', 'İki', 'Üç'].sort()
  );

  // Chat send: quickId + free text + cap at 40
  const quickRes = rm.sendChatMessage({ roomCode: code, playerId: 'h1', quickId: 'tea' });
  assert.equal(quickRes.ok, true);
  assert.equal(quickRes.entry.text, 'Çaylar benden!');
  assert.equal(io.emitted.some((e) => e.event === 'room:chat' && e.target === 'player:p2'), true);

  const emptyChat = rm.sendChatMessage({ roomCode: code, playerId: 'h1', text: '   ' });
  assert.equal(emptyChat.ok, false);

  for (let i = 0; i < 45; i += 1) {
    rm.sendChatMessage({ roomCode: code, playerId: 'p2', text: `Mesaj ${i}` });
  }
  const payload = rm.getRoomPayloadForPlayer(created.room, 'h1');
  assert.equal(payload.chatHistory.length, 40);
  assert.equal(payload.chatHistory[39].text, 'Mesaj 44');

  // Nudge emits room:nudge and enforces 2500ms cooldown per player
  const nudge1 = rm.sendTableNudge({ roomCode: code, playerId: 'h1' });
  assert.equal(nudge1.ok, true);
  assert.equal(io.emitted.some((e) => e.event === 'room:nudge' && e.target === 'player:p2'), true);

  const nudgeFast = rm.sendTableNudge({ roomCode: code, playerId: 'h1' });
  assert.equal(nudgeFast.ok, false);

  // Different player can still nudge immediately
  const nudgeP2 = rm.sendTableNudge({ roomCode: code, playerId: 'p2', targetSeatIndex: 0 });
  assert.equal(nudgeP2.ok, true);
  assert.equal(nudgeP2.nudge.targetSeatIndex, 0);
});

test('RoomManager allows host-only live roomAtmosphere/roomAmbiance updates during playing while blocking rule changes', (ctx) => {
  const io = createMockIo();
  const rm = new RoomManager(io);
  const created = rm.createRoom({
    playerId: 'h1',
    playerName: 'Efe',
    roomName: 'Ortam Odası',
    options: { roomAtmosphere: 'rainy', roomAmbiance: 'rain' }
  });
  ctx.after(() => created?.room?.session?.destroy());

  const code = created.room.code;
  rm.joinRoom({ roomCode: code, playerId: 'p2', playerName: 'Arhan' });
  assert.equal(created.room.options.roomAtmosphere, 'rainy');
  assert.equal(created.room.options.roomAmbiance, 'rain');

  assert.equal(rm.startGame(code, 'h1').ok, true);

  // Non-host cannot change atmosphere/ambiance
  const guestTry = rm.updateOptions({
    roomCode: code,
    hostPlayerId: 'p2',
    options: { roomAtmosphere: 'midnight', roomAmbiance: 'fireplace' }
  });
  assert.equal(guestTry.ok, false);

  // Host cannot change rules mid-game
  const ruleTry = rm.updateOptions({
    roomCode: code,
    hostPlayerId: 'h1',
    options: { katlamali: true }
  });
  assert.equal(ruleTry.ok, false);

  // Host CAN change atmosphere & ambiance live during active game
  const liveCozy = rm.updateOptions({
    roomCode: code,
    hostPlayerId: 'h1',
    options: { roomAtmosphere: 'midnight', roomAmbiance: 'fireplace' }
  });
  assert.equal(liveCozy.ok, true);
  assert.equal(created.room.options.roomAtmosphere, 'midnight');
  assert.equal(created.room.options.roomAmbiance, 'fireplace');

  const p2View = rm.getRoomPayloadForPlayer(created.room, 'p2');
  assert.equal(p2View.options.roomAtmosphere, 'midnight');
  assert.equal(p2View.options.roomAmbiance, 'fireplace');
});

test('resolveTvInput and RoomManager TV/sip/catPet track state, socialStats, and emit room events', async () => {
  const { resolveTvInput } = await import('../server/musicResolver.js');
  const io = createMockIo();
  const rm = new RoomManager(io);
  const created = rm.createRoom({
    playerId: 'h1',
    playerName: 'Efe',
    roomName: 'Kahve Keyfi'
  });
  const code = created.room.code;
  rm.joinRoom({ roomCode: code, playerId: 'p2', playerName: 'Hasan' });

  // Direct YouTube TV resolve + setRoomTv + stopRoomTv
  const directTv = await resolveTvInput('https://youtu.be/dQw4w9WgXcQ', 'Akşam Yayını');
  assert.equal(directTv.ok, true);
  assert.equal(directTv.tv.videoId, 'dQw4w9WgXcQ');
  assert.equal(directTv.tv.isLive, false);

  // Mock YouTube search HTML for preset channelId
  const fakeYtSearchHtml = `var ytInitialData = {"contents":{"twoColumnSearchResultsRenderer":{"primaryContents":{"sectionListRenderer":{"contents":[{"itemSectionRenderer":{"contents":[{"videoRenderer":{"videoId":"trt1LiveVid01","title":{"runs":[{"text":"TRT 1 Canlı Yayın"}]},"ownerText":{"runs":[{"text":"TRT 1"}]}}}]}}]}}}}};`;
  const presetTv = await resolveTvInput('', '', {
    channelId: 'trt1',
    fetchImpl: async () => ({ ok: true, text: async () => fakeYtSearchHtml })
  });
  assert.equal(presetTv.ok, true);
  assert.equal(presetTv.tv.channelId, 'trt1');
  assert.equal(presetTv.tv.videoId, 'trt1LiveVid01');
  assert.equal(presetTv.tv.isLive, true);

  const setRes = rm.setRoomTv({ roomCode: code, playerId: 'h1', tvPayload: presetTv.tv });
  assert.equal(setRes.ok, true);
  assert.equal(setRes.tv.updatedBy, 'Efe');
  assert.equal(io.emitted.some((e) => e.event === 'room:tv' && e.target === 'player:p2' && e.payload?.videoId === 'trt1LiveVid01'), true);

  const stopRes = rm.stopRoomTv({ roomCode: code, playerId: 'p2' });
  assert.equal(stopRes.ok, true);
  assert.equal(created.room.tv, null);
  assert.equal(io.emitted.some((e) => e.event === 'room:tv' && e.target === 'player:h1' && e.payload === null), true);

  // Sip drink without order fails
  assert.equal(rm.sipDrink({ roomCode: code, playerId: 'h1' }).ok, false);

  // Order tea -> sipsRemaining = 4, sip 4 times -> 0 -> refill
  const ordRes = rm.orderTreat({ roomCode: code, playerId: 'h1', itemId: 'cay', target: 'self' });
  assert.equal(ordRes.ok, true);
  assert.equal(ordRes.orders[0].drink.sipsRemaining, 4);
  assert.equal(ordRes.socialStats[0].treatsOrdered, 1);

  for (let expected = 3; expected >= 0; expected -= 1) {
    const sRes = rm.sipDrink({ roomCode: code, playerId: 'h1' });
    assert.equal(sRes.ok, true);
    assert.equal(sRes.action, 'sip');
    assert.equal(sRes.sipsRemaining, expected);
  }
  assert.equal(created.room.socialStats[0].sipsTaken, 4);

  const refillRes = rm.sipDrink({ roomCode: code, playerId: 'h1' });
  assert.equal(refillRes.ok, true);
  assert.equal(refillRes.action, 'refill');
  assert.equal(refillRes.sipsRemaining, 4);
  assert.equal(created.room.socialStats[0].treatsOrdered, 2);

  // Petting cats increments catsPetted and broadcasts room:catPetted
  assert.equal(rm.petCat({ roomCode: code, playerId: 'p2', catIndex: 99 }).ok, false);
  const petRes = rm.petCat({ roomCode: code, playerId: 'p2', catIndex: 2 });
  assert.equal(petRes.ok, true);
  assert.equal(petRes.payload.cat.name, 'Kömür');
  assert.equal(petRes.payload.socialStats[1].catsPetted, 1);
  assert.equal(io.emitted.some((e) => e.event === 'room:catPetted' && e.target === 'player:h1' && e.payload.catIndex === 2), true);
});
