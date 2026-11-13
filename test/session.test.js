import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../server/gameSession.js';
import { LocalSingleplayerClient } from '../src/client/localSession.js';
import { isOkeyTile } from '../shared/tiles.js';

test('GameSession deals 22 to starter and 21 to others, and supports draw/discard', () => {
  const session = new GameSession({
    roomCode: 'TEST',
    seatsConfig: [
      { playerId: 'p0', name: 'Oyuncu 0', isBot: false },
      { playerId: 'p1', name: 'Oyuncu 1', isBot: false },
      { playerId: 'p2', name: 'Oyuncu 2', isBot: false },
      { playerId: 'p3', name: 'Oyuncu 3', isBot: false }
    ],
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onStateChange: () => {}
  });

  session.startRound();
  assert.equal(session.phase, 'playing');
  assert.equal(session.currentSeat, 1);
  assert.equal(session.turnPhase, 'play');
  assert.equal(session.seats[1].hand.length, 22);
  assert.equal(session.seats[0].hand.length, 21);
  assert.equal(session.seats[2].hand.length, 21);
  assert.equal(session.seats[3].hand.length, 21);
  assert.equal(session.deck.length, 106 - 1 - 22 - 21 * 3);

  // Starter discards one tile
  const discardId = session.seats[1].hand[0].id;
  const res = session.discardTile(1, discardId);
  assert.equal(res.ok, true);
  assert.equal(session.currentSeat, 2);
  assert.equal(session.turnPhase, 'draw');
  assert.equal(session.discardPiles[1].length, 1);

  // Seat 2 draws from deck
  const drawRes = session.drawFromDeck(2);
  assert.equal(drawRes.ok, true);
  assert.equal(session.turnPhase, 'play');
  assert.equal(session.seats[2].hand.length, 22);

  session.destroy();
});

test('GameSession enforces picked discard usage or return', () => {
  const session = new GameSession({
    roomCode: 'TEST',
    seatsConfig: [
      { playerId: 'p0', name: 'A', isBot: false },
      { playerId: 'p1', name: 'B', isBot: false },
      { playerId: 'p2', name: 'C', isBot: false },
      { playerId: 'p3', name: 'D', isBot: false }
    ],
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onStateChange: () => {}
  });

  session.startRound();
  const starterDiscard = session.seats[1].hand.find((t) => !isOkeyTile(t, session.okeyTarget));
  session.discardTile(1, starterDiscard.id);

  // Seat 2 picks left discard
  const pickRes = session.drawFromDiscard(2);
  assert.equal(pickRes.ok, true);
  assert.equal(session.pickedDiscardTileId, starterDiscard.id);

  // Seat 2 cannot discard without opening/using it
  const badDiscard = session.discardTile(2, session.seats[2].hand[0].id);
  assert.equal(badDiscard.ok, false);

  // Seat 2 can return the picked discard
  const retRes = session.returnPickedDiscard(2);
  assert.equal(retRes.ok, true);
  assert.equal(session.turnPhase, 'draw');
  assert.equal(session.discardPiles[1].length, 1);

  session.destroy();
});

test('GameSession silent adminSwapTile and adminStealOkey preserve counts and lastEvent', () => {
  const session = new GameSession({
    roomCode: 'VAULT',
    seatsConfig: [
      { playerId: 'p0', name: 'Sahip', isBot: false },
      { playerId: 'p1', name: 'Rakip 1', isBot: false },
      { playerId: 'p2', name: 'Rakip 2', isBot: false },
      { playerId: 'p3', name: 'Rakip 3', isBot: false }
    ],
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onStateChange: () => {}
  });

  session.startRound();
  const initialEventId = session.lastEvent?.id;
  const initialDeckLen = session.deck.length;
  const snap = session.getAdminSnapshot();
  assert.equal(snap.phase, 'playing');
  assert.equal(snap.deck.length, initialDeckLen);
  assert.equal(snap.seats[0].hand.length, 21);

  // Swap seat 0 tile with a deck tile
  const myTile = session.seats[0].hand[0];
  const deckTile = session.deck[0];
  const deckSwap = session.adminSwapTile({
    actorSeatIndex: 0,
    myTileId: myTile.id,
    sourceKind: 'deck',
    targetTileId: deckTile.id
  });
  assert.equal(deckSwap.ok, true);
  assert.equal(session.seats[0].hand.length, 21);
  assert.equal(session.deck.length, initialDeckLen);
  assert.equal(session.seats[0].hand[0].id, deckTile.id);
  assert.equal(session.deck[0].id, myTile.id);
  assert.equal(session.lastEvent?.id, initialEventId);

  // Swap seat 0 tile with opponent seat 2 tile
  const oppTile = session.seats[2].hand[3];
  const seatSwap = session.adminSwapTile({
    actorSeatIndex: 0,
    myTileId: deckTile.id,
    sourceKind: 'seat',
    targetSeatIndex: 2,
    targetTileId: oppTile.id
  });
  assert.equal(seatSwap.ok, true);
  assert.equal(session.seats[0].hand.length, 21);
  assert.equal(session.seats[2].hand.length, 21);
  assert.equal(session.seats[0].hand[0].id, oppTile.id);
  assert.equal(session.seats[2].hand[3].id, deckTile.id);
  assert.equal(session.lastEvent?.id, initialEventId);

  // Steal Okey if one is in deck or opponents' hands
  const availableOkey =
    session.deck.find((t) => isOkeyTile(t, session.okeyTarget)) ||
    session.seats.slice(1).flatMap((s) => s.hand).find((t) => isOkeyTile(t, session.okeyTarget));

  if (availableOkey) {
    const stealRes = session.adminStealOkey(0, session.seats[0].hand[1].id);
    assert.equal(stealRes.ok, true);
    assert.equal(session.seats[0].hand.some((t) => t.id === availableOkey.id), true);
    assert.equal(session.lastEvent?.id, initialEventId);
  }

  session.destroy();
});

test('LocalSingleplayerClient starts offline session and supports secret actions', () => {
  const states = [];
  const client = new LocalSingleplayerClient({
    playerName: 'Test Oyuncu',
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onState: (room) => states.push(room)
  });

  client.emitRoomState();
  assert.equal(states.length >= 1, true);
  const latest = states[states.length - 1];
  assert.equal(latest.isLocal, true);
  assert.equal(latest.status, 'playing');
  assert.equal(latest.game.seats[0].hand.length, 21);

  let snapRes = null;
  client.action('admin:snapshot', {}, (res) => {
    snapRes = res;
  });
  assert.equal(snapRes.ok, true);
  assert.equal(snapRes.snapshot.seats.length, 4);

  const myTileId = snapRes.snapshot.seats[0].hand[0].id;
  const deckTileId = snapRes.snapshot.deck[0].id;
  let swapRes = null;
  client.action(
    'admin:swapTile',
    { myTileId, sourceKind: 'deck', targetTileId: deckTileId },
    (res) => {
      swapRes = res;
    }
  );
  assert.equal(swapRes.ok, true);
  assert.equal(swapRes.snapshot.seats[0].hand[0].id, deckTileId);

  client.destroy();
});

test('GameSession paired team mode exempts winner partner from 202 penalty and supports continuing after maxRounds or deck empty', () => {
  const session = new GameSession({
    roomCode: 'PAIR',
    seatsConfig: [
      { playerId: 'p0', name: 'Oyuncu 0', avatar: 'avatar-1', isBot: false },
      { playerId: 'p1', name: 'Oyuncu 1', avatar: 'avatar-2', isBot: false },
      { playerId: 'p2', name: 'Oyuncu 2', avatar: 'avatar-3', isBot: false },
      { playerId: 'p3', name: 'Oyuncu 3', avatar: 'avatar-4', isBot: false }
    ],
    options: { katlamali: false, teamMode: 'paired', maxRounds: 3, islekPenalty: true, turnSeconds: 60 },
    onStateChange: () => {}
  });

  session.roundNumber = 2; // Next startRound -> round 3 (reaches maxRounds = 3)
  session.startRound();
  assert.equal(session.roundNumber, 3);
  assert.equal(session.seats[0].avatar, 'avatar-1');
  assert.equal(session.seats[2].teamIndex, 0);

  // Make seat 0 finish immediately with a single non-okey discard
  const safeTile = session.seats[0].hand.find((t) => !isOkeyTile(t, session.okeyTarget));
  session.seats[0].hand = [safeTile];
  session.seats[0].opened = true;
  session.currentSeat = 0;
  session.turnPhase = 'play';
  const fin = session.discardTile(0, safeTile.id);
  assert.equal(fin.ok, true);
  assert.equal(fin.roundEnded, true);
  assert.equal(session.phase, 'roundOver');

  // Seat 2 (partner of seat 0) did not open, yet gets 0 penalty in paired mode
  const row0 = session.roundSummary.rows.find((r) => r.seatIndex === 0);
  const row2 = session.roundSummary.rows.find((r) => r.seatIndex === 2);
  const row1 = session.roundSummary.rows.find((r) => r.seatIndex === 1);
  assert.equal(row0.roundDelta, -101);
  assert.equal(row2.roundDelta, 0);
  assert.equal(row1.roundDelta, 202);
  assert.equal(session.roundSummary.matchComplete, true);
  assert.equal(session.roundSummary.teamMode, 'paired');
  assert.deepEqual(session.roundSummary.teamScores, [-101, 404]);

  // Continue into extra round 4 even after maxRounds was reached
  session.startRound();
  assert.equal(session.roundNumber, 4);
  assert.equal(session.phase, 'playing');

  // Exhaust deck and discard -> deckExhausted roundOver, still allows startRound
  session.deck = [];
  const dTile = session.seats[session.currentSeat].hand[0];
  session.discardTile(session.currentSeat, dTile.id);
  assert.equal(session.phase, 'roundOver');
  assert.equal(session.roundSummary.deckExhausted, true);

  session.startRound();
  assert.equal(session.roundNumber, 5);
  assert.equal(session.phase, 'playing');

  session.destroy();
});

function tile(id, color, number, copy = 0) {
  return { id, color, number, copy, isFakeOkey: false };
}

test('GameSession penalizes discarding Okey mid-game (+101) and blocks picking up discarded Okey', () => {
  const session = new GameSession({
    roomCode: 'OKEY',
    seatsConfig: [
      { playerId: 'p0', name: 'A', isBot: false },
      { playerId: 'p1', name: 'B', isBot: false },
      { playerId: 'p2', name: 'C', isBot: false },
      { playerId: 'p3', name: 'D', isBot: false }
    ],
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onStateChange: () => {}
  });

  session.startRound();
  session.okeyTarget = { color: 'red', number: 5 };
  session.currentSeat = 1;
  session.turnPhase = 'play';
  const okeyTile = tile('ok-1', 'red', 5);
  const keepTile = tile('k-1', 'blue', 7);
  session.seats[1].hand = [okeyTile, keepTile];

  const discRes = session.discardTile(1, okeyTile.id);
  assert.equal(discRes.ok, true);
  assert.equal(discRes.okeyDiscardPenalty, true);
  assert.equal(session.seats[1].roundPenalties, 101);

  // Next player (seat 2) cannot draw the discarded Okey from left discard
  assert.equal(session.currentSeat, 2);
  const pickRes = session.drawFromDiscard(2);
  assert.equal(pickRes.ok, false);

  session.destroy();
});

test('GameSession enforces pair-opener restrictions, katlamali pairThreshold, and 4-player pairs cancellation', () => {
  const session = new GameSession({
    roomCode: 'PAIRS',
    seatsConfig: [
      { playerId: 'p0', name: 'A', isBot: false },
      { playerId: 'p1', name: 'B', isBot: false },
      { playerId: 'p2', name: 'C', isBot: false },
      { playerId: 'p3', name: 'D', isBot: false }
    ],
    options: { katlamali: true, islekPenalty: true, turnSeconds: 60 },
    onStateChange: () => {}
  });

  session.startRound();
  session.okeyTarget = { color: 'yellow', number: 1 };
  assert.equal(session.pairThreshold, 5);

  const makePairs = (prefix, count) => {
    const groups = [];
    const hand = [];
    const colors = ['red', 'blue', 'black'];
    for (let i = 0; i < count; i += 1) {
      const num = (i % 10) + 2;
      const color = colors[Math.floor(i / 10) % colors.length];
      const t1 = tile(`${prefix}-a-${i}`, color, num, 0);
      const t2 = tile(`${prefix}-b-${i}`, color, num, 1);
      hand.push(t1, t2);
      groups.push([t1.id, t2.id]);
    }
    return { groups, hand };
  };

  // Seat 0 opens with 5 pairs -> raises katlamali pairThreshold to 6
  const p0 = makePairs('s0', 5);
  const s0Extra = [
    tile('s0-r1', 'red', 10),
    tile('s0-r2', 'red', 11),
    tile('s0-r3', 'red', 12),
    tile('s0-p1', 'black', 9, 0),
    tile('s0-p2', 'black', 9, 1),
    tile('s0-k', 'blue', 13)
  ];
  session.seats[0].hand = [...p0.hand, ...s0Extra];
  session.currentSeat = 0;
  session.turnPhase = 'play';
  const open0 = session.openHand(0, p0.groups, 'pairs');
  assert.equal(open0.ok, true);
  assert.equal(session.pairThreshold, 6);

  // Pair-opener cannot lay a 3-tile series, but can lay an extra pair
  const badSeries = session.layMeld(0, ['s0-r1', 's0-r2', 's0-r3']);
  assert.equal(badSeries.ok, false);
  const goodPair = session.layMeld(0, ['s0-p1', 's0-p2']);
  assert.equal(goodPair.ok, true);

  // Seat 0 discards -> Seat 1 picks discard from pair-opener and cannot open series
  session.discardTile(0, 's0-k');
  assert.equal(session.currentSeat, 1);
  const p1 = makePairs('s1', 6);
  const s1Series = [
    tile('s1-r1', 'blue', 11),
    tile('s1-r2', 'blue', 12),
    tile('s1-r3', 'blue', 13),
    tile('s1-r4', 'black', 11),
    tile('s1-r5', 'black', 12),
    tile('s1-r6', 'black', 13),
    tile('s1-r7', 'red', 11),
    tile('s1-r8', 'red', 12),
    tile('s1-r9', 'red', 13)
  ];
  session.seats[1].hand = [...p1.hand, ...s1Series];
  const pick1 = session.drawFromDiscard(1);
  assert.equal(pick1.ok, true);
  // Trying series with picked tile from pair-opener in katlamali is blocked
  const badOpenSeries = session.openHand(
    1,
    [['s1-r1', 's1-r2', 's1-r3'], ['s1-r4', 's1-r5', 's1-r6'], ['s1-r7', 's1-r8', 's1-r9']],
    'series'
  );
  assert.equal(badOpenSeries.ok, false);
  session.returnPickedDiscard(1);

  // Seat 1 draws and tries opening only 5 pairs (must fail because pairThreshold is 6)
  session.drawFromDeck(1);
  const tooFewPairs = session.openHand(1, p1.groups.slice(0, 5), 'pairs');
  assert.equal(tooFewPairs.ok, false);

  // Seat 1 opens 6 pairs -> pairThreshold becomes 7
  const open1 = session.openHand(1, p1.groups, 'pairs');
  assert.equal(open1.ok, true);
  assert.equal(session.pairThreshold, 7);

  // Seats 2 & 3 also open with pairs -> 4 players all opened pairs -> round cancelled!
  const p2 = makePairs('s2', 7);
  session.seats[2].hand = [...p2.hand, tile('s2-k', 'black', 3)];
  session.currentSeat = 2;
  session.turnPhase = 'play';
  assert.equal(session.openHand(2, p2.groups, 'pairs').ok, true);

  const p3 = makePairs('s3', 8);
  session.seats[3].hand = [...p3.hand, tile('s3-k', 'black', 4)];
  session.currentSeat = 3;
  session.turnPhase = 'play';
  const open3 = session.openHand(3, p3.groups, 'pairs');
  assert.equal(open3.ok, true);
  assert.equal(open3.roundCancelled, true);
  assert.equal(session.phase, 'roundOver');
  assert.equal(session.roundSummary.roundCancelled, true);
  assert.deepEqual(
    session.roundSummary.rows.map((r) => r.roundDelta),
    [0, 0, 0, 0]
  );

  session.destroy();
});

test('GameSession detects elden bitme (opening and finishing on the same turn) for 2x score', () => {
  const session = new GameSession({
    roomCode: 'KAFA',
    seatsConfig: [
      { playerId: 'p0', name: 'A', isBot: false },
      { playerId: 'p1', name: 'B', isBot: false },
      { playerId: 'p2', name: 'C', isBot: false },
      { playerId: 'p3', name: 'D', isBot: false }
    ],
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onStateChange: () => {}
  });

  session.startRound();
  session.okeyTarget = { color: 'yellow', number: 1 };
  session.currentSeat = 0;
  session.turnPhase = 'play';
  const finishTile = tile('fin', 'blue', 4);
  session.seats[0].hand = [
    tile('g1-1', 'red', 11),
    tile('g1-2', 'red', 12),
    tile('g1-3', 'red', 13), // 36
    tile('g2-1', 'blue', 11),
    tile('g2-2', 'blue', 12),
    tile('g2-3', 'blue', 13), // 36
    tile('g3-1', 'black', 10),
    tile('g3-2', 'black', 11),
    tile('g3-3', 'black', 12), // 33 -> total 105
    finishTile
  ];

  const openRes = session.openHand(
    0,
    [
      ['g1-1', 'g1-2', 'g1-3'],
      ['g2-1', 'g2-2', 'g2-3'],
      ['g3-1', 'g3-2', 'g3-3']
    ],
    'series'
  );
  assert.equal(openRes.ok, true);
  const finRes = session.discardTile(0, finishTile.id);
  assert.equal(finRes.ok, true);
  assert.equal(session.roundSummary.finishedFromHand, true);
  assert.equal(session.roundSummary.rows[0].roundDelta, -202);
  assert.equal(session.roundSummary.rows[1].roundDelta, 404);

  session.destroy();
});

test('Paired katlamali isolates opening & pair thresholds to opponent team only (partner never raises partner)', async () => {
  const session = new GameSession({
    roomCode: 'PKAT',
    seatsConfig: [
      { playerId: 'p0', name: 'A', isBot: false },
      { playerId: 'p1', name: 'B', isBot: false },
      { playerId: 'p2', name: 'C', isBot: false },
      { playerId: 'p3', name: 'D', isBot: false }
    ],
    options: { katlamali: true, teamMode: 'paired', islekPenalty: true, turnSeconds: 60 },
    onStateChange: () => {}
  });

  session.startRound();
  session.okeyTarget = { color: 'yellow', number: 1 };
  assert.equal(session.getOpenThreshold(0), 101);
  assert.equal(session.getOpenThreshold(2), 101);
  assert.equal(session.getOpenThreshold(1), 101);

  // Seat 0 (Team 0) opens with 114 points -> Team 1 threshold rises to 115, Team 0 stays 101!
  session.currentSeat = 0;
  session.turnPhase = 'play';
  session.seats[0].hand = [
    tile('t0-1', 'red', 12),
    tile('t0-2', 'red', 13),
    tile('t0-3', 'red', 13, 1), // invalid wait, let's make valid runs:
  ];
  session.seats[0].hand = [
    tile('t0-1', 'red', 11),
    tile('t0-2', 'red', 12),
    tile('t0-3', 'red', 13), // 36
    tile('t0-4', 'blue', 11),
    tile('t0-5', 'blue', 12),
    tile('t0-6', 'blue', 13), // 36
    tile('t0-7', 'black', 13),
    tile('t0-8', 'black', 13, 1) // wait need valid 3-4 tile group:
  ];
  session.seats[0].hand = [
    tile('t0-1', 'red', 11),
    tile('t0-2', 'red', 12),
    tile('t0-3', 'red', 13), // 36
    tile('t0-4', 'blue', 11),
    tile('t0-5', 'blue', 12),
    tile('t0-6', 'blue', 13), // 36
    tile('t0-7', 'black', 10),
    tile('t0-8', 'black', 11),
    tile('t0-9', 'black', 12),
    tile('t0-10', 'black', 13), // 46 -> total 118
    tile('t0-k', 'red', 2)
  ];

  const o0 = session.openHand(
    0,
    [
      ['t0-1', 't0-2', 't0-3'],
      ['t0-4', 't0-5', 't0-6'],
      ['t0-7', 't0-8', 't0-9', 't0-10']
    ],
    'series'
  );
  assert.equal(o0.ok, true);
  assert.equal(session.getOpenThreshold(1), 119);
  assert.equal(session.getOpenThreshold(3), 119);
  assert.equal(session.getOpenThreshold(2), 101); // Partner unaffected!

  // Seat 2 (Partner on Team 0) can still open with 105 (less than Team 1's 119)
  session.currentSeat = 2;
  session.turnPhase = 'play';
  session.seats[2].hand = [
    tile('t2-1', 'red', 11, 1),
    tile('t2-2', 'red', 12, 1),
    tile('t2-3', 'red', 13, 1), // 36
    tile('t2-4', 'blue', 11, 1),
    tile('t2-5', 'blue', 12, 1),
    tile('t2-6', 'blue', 13, 1), // 36
    tile('t2-7', 'black', 10, 1),
    tile('t2-8', 'black', 11, 1),
    tile('t2-9', 'black', 12, 1), // 33 -> total 105
    tile('t2-k', 'blue', 2)
  ];
  const o2 = session.openHand(
    2,
    [
      ['t2-1', 't2-2', 't2-3'],
      ['t2-4', 't2-5', 't2-6'],
      ['t2-7', 't2-8', 't2-9']
    ],
    'series'
  );
  assert.equal(o2.ok, true);
  assert.equal(session.getOpenThreshold(1), 119); // Team 1 stays max(119, 106) = 119

  // Pair opening by Seat 1 (Team 1) with 6 pairs raises ONLY Team 0 pairThreshold to 7
  session.currentSeat = 1;
  session.turnPhase = 'play';
  const make6Pairs = [];
  const p6Groups = [];
  for (let i = 0; i < 6; i += 1) {
    const a = tile(`p1-a-${i}`, 'red', i + 2, 0);
    const b = tile(`p1-b-${i}`, 'red', i + 2, 1);
    make6Pairs.push(a, b);
    p6Groups.push([a.id, b.id]);
  }
  session.seats[1].hand = [...make6Pairs, tile('p1-k', 'black', 2)];
  const o1 = session.openHand(1, p6Groups, 'pairs');
  assert.equal(o1.ok, true);
  assert.equal(session.getPairThreshold(0), 7);
  assert.equal(session.getPairThreshold(2), 7);
  assert.equal(session.getPairThreshold(3), 5); // Partner on Team 1 stays at 5!

  session.destroy();
});

test('parseMusicUrl handles YouTube, Spotify bot links, song searches, SoundCloud, MP3 audio, web players and rejects unsafe URLs', async () => {
  const { parseMusicUrl } = await import('../shared/music.js');

  const yt = parseMusicUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Test Track');
  assert.equal(yt.ok, true);
  assert.equal(yt.provider, 'youtube');
  assert.equal(yt.kind, 'iframe');
  assert.match(yt.embedUrl, /youtube\.com\/embed\/dQw4w9WgXcQ/);

  const sp = parseMusicUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=123');
  assert.equal(sp.ok, true);
  assert.equal(sp.provider, 'spotify');
  assert.equal(sp.kind, 'bot');
  assert.equal(sp.needsResolution, true);
  assert.equal(sp.spotifyType, 'track');
  assert.equal(sp.spotifyId, '4cOdK2wGLETKBW3PvgPWqT');
  assert.equal(sp.embedUrl, null);

  const spUri = parseMusicUrl('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M');
  assert.equal(spUri.ok, true);
  assert.equal(spUri.provider, 'spotify');
  assert.equal(spUri.spotifyType, 'playlist');
  assert.equal(spUri.spotifyId, '37i9dQZF1DXcBWIGoYBM5M');

  const search = parseMusicUrl('Tarkan Kuzu Kuzu');
  assert.equal(search.ok, true);
  assert.equal(search.provider, 'search');
  assert.equal(search.kind, 'bot');
  assert.equal(search.needsResolution, true);
  assert.equal(search.query, 'Tarkan Kuzu Kuzu');

  const sc = parseMusicUrl('https://soundcloud.com/lofi_girl/lofi-hip-hop');
  assert.equal(sc.ok, true);
  assert.equal(sc.provider, 'soundcloud');
  assert.match(sc.embedUrl, /w\.soundcloud\.com\/player/);

  const mp3 = parseMusicUrl('https://example.com/music/kahve.mp3');
  assert.equal(mp3.ok, true);
  assert.equal(mp3.provider, 'audio');
  assert.equal(mp3.kind, 'audio');

  const web = parseMusicUrl('https://radio.garden/listen/istanbul');
  assert.equal(web.ok, true);
  assert.equal(web.provider, 'web');

  assert.equal(parseMusicUrl('').ok, false);
  assert.equal(parseMusicUrl('javascript:alert(1)').ok, false);
  assert.equal(parseMusicUrl('ftp://files.example.com/song.mp3').ok, false);
});

test('RoomManager validates custom base64 avatars and broadcasts room music', async () => {
  const { RoomManager } = await import('../server/roomManager.js');
  const emitted = [];
  const fakeIo = {
    to: () => ({ emit: (ev, payload) => emitted.push({ ev, payload }) }),
    emit: (ev, payload) => emitted.push({ ev, payload })
  };
  const rm = new RoomManager(fakeIo);
  const sampleDataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAA==';

  const created = rm.createRoom({
    playerId: 'host-1',
    playerName: 'Efe',
    playerAvatar: sampleDataUri,
    roomName: 'Müzikli Masa'
  });
  assert.equal(created.ok, true);
  assert.equal(created.room.seats[0].avatar, sampleDataUri);

  const musicRes = rm.setRoomMusic({
    roomCode: created.room.code,
    playerId: 'host-1',
    url: 'https://youtu.be/dQw4w9WgXcQ',
    title: 'Kahvehane Chill'
  });
  assert.equal(musicRes.ok, true);
  assert.equal(created.room.music.provider, 'youtube');
  assert.equal(created.room.music.title, 'Kahvehane Chill');

  const stopRes = rm.stopRoomMusic({ roomCode: created.room.code, playerId: 'host-1' });
  assert.equal(stopRes.ok, true);
  assert.equal(created.room.music, null);
});

test('RoomManager orderTreat & clearSeatOrder handle self, specific seat, all, and validation errors', async () => {
  const { RoomManager } = await import('../server/roomManager.js');
  const emitted = [];
  const fakeIo = {
    to: (room) => ({ emit: (ev, payload) => emitted.push({ room, ev, payload }) }),
    emit: (ev, payload) => emitted.push({ ev, payload })
  };
  const rm = new RoomManager(fakeIo);

  const created = rm.createRoom({
    playerId: 'host-1',
    playerName: 'Efe',
    roomName: 'Çay Ocağı'
  });
  assert.equal(created.ok, true);
  const code = created.room.code;

  const joined = rm.joinRoom({
    roomCode: code,
    playerId: 'p-2',
    playerName: 'Can',
    playerAvatar: 'avatar-2'
  });
  assert.equal(joined.ok, true);

  // Order tea for self (seat 0)
  const teaRes = rm.orderTreat({ roomCode: code, playerId: 'host-1', itemId: 'cay', target: 'self' });
  assert.equal(teaRes.ok, true);
  assert.equal(teaRes.orders[0].drink.itemId, 'cay');
  assert.equal(teaRes.orders[1].drink, null);
  assert.equal(teaRes.lastOrder.targetName, 'kendine');
  assert.equal(emitted.some((e) => e.ev === 'room:orders'), true);

  // Order tost for specific seat 1
  const tostRes = rm.orderTreat({ roomCode: code, playerId: 'host-1', itemId: 'tost', target: 1 });
  assert.equal(tostRes.ok, true);
  assert.equal(tostRes.orders[1].food.itemId, 'tost');
  assert.equal(tostRes.lastOrder.targetName, 'Can');

  // Order oralet for all non-empty seats
  const allRes = rm.orderTreat({ roomCode: code, playerId: 'p-2', itemId: 'oralet', target: 'all' });
  assert.equal(allRes.ok, true);
  assert.equal(allRes.orders[0].drink.itemId, 'oralet');
  assert.equal(allRes.orders[1].drink.itemId, 'oralet');
  assert.equal(allRes.orders[2].drink, null); // seat 2 is empty
  assert.equal(allRes.lastOrder.targetName, 'tüm masaya');

  // Validation failures
  const badItem = rm.orderTreat({ roomCode: code, playerId: 'host-1', itemId: 'nonexistent', target: 'self' });
  assert.equal(badItem.ok, false);
  const emptySeat = rm.orderTreat({ roomCode: code, playerId: 'host-1', itemId: 'kahve', target: 2 });
  assert.equal(emptySeat.ok, false);

  // Clear seat order
  const clearSelf = rm.clearSeatOrder({ roomCode: code, playerId: 'host-1', target: 'self' });
  assert.equal(clearSelf.ok, true);
  assert.equal(clearSelf.orders[0].drink, null);
  assert.equal(clearSelf.orders[0].food, null);
  assert.equal(clearSelf.orders[1].drink.itemId, 'oralet');
});

test('LocalSingleplayerClient handles room:orderTreat and room:orderClear', () => {
  const states = [];
  const client = new LocalSingleplayerClient({
    playerName: 'Efe',
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onState: (room) => states.push(room)
  });

  let orderRes = null;
  client.action('room:orderTreat', { itemId: 'oralet', target: 'all' }, (res) => {
    orderRes = res;
  });
  assert.equal(orderRes.ok, true);
  assert.equal(orderRes.orders[0].drink.itemId, 'oralet');
  assert.equal(orderRes.orders[3].drink.itemId, 'oralet');
  assert.equal(orderRes.lastOrder.label, 'Portakallı Oralet');

  let foodRes = null;
  client.action('room:orderTreat', { itemId: 'baklava', target: 2 }, (res) => {
    foodRes = res;
  });
  assert.equal(foodRes.ok, true);
  assert.equal(foodRes.orders[2].food.itemId, 'baklava');

  let clearRes = null;
  client.action('room:orderClear', { target: 'self' }, (res) => {
    clearRes = res;
  });
  assert.equal(clearRes.ok, true);
  assert.equal(clearRes.orders[0].drink, null);
  assert.equal(clearRes.orders[2].food.itemId, 'baklava');

  const latest = states[states.length - 1];
  assert.equal(Array.isArray(latest.orders), true);
  assert.equal(latest.lastOrder.itemId, 'baklava');

  client.destroy();
});

test('GameSession.getClientView hides opponent tileCount while preserving viewer tileCount', () => {
  const session = new GameSession({
    roomCode: 'PRIV',
    seatsConfig: [
      { playerId: 'p0', name: 'Efe', isBot: false },
      { playerId: 'p1', name: 'Bot 1', isBot: true },
      { playerId: 'p2', name: 'Bot 2', isBot: true },
      { playerId: 'p3', name: 'Bot 3', isBot: true }
    ],
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onStateChange: () => {}
  });

  session.startRound();
  const view = session.getClientView(0);
  assert.equal(view.seats[0].tileCount, session.seats[0].hand.length);
  assert.equal(view.seats[1].tileCount, null);
  assert.equal(view.seats[2].tileCount, null);
  assert.equal(view.seats[3].tileCount, null);
  assert.equal(view.seats[1].hand, null);

  session.destroy();
});

test('GameSession allows opened players to draw from left freely and emits islek/okey alertKind', () => {
  const session = new GameSession({
    roomCode: 'OPENL',
    seatsConfig: [
      { playerId: 'p0', name: 'Efe', isBot: false },
      { playerId: 'p1', name: 'Bot 1', isBot: true },
      { playerId: 'p2', name: 'Bot 2', isBot: true },
      { playerId: 'p3', name: 'Bot 3', isBot: true }
    ],
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onStateChange: () => {}
  });

  session.startRound();
  session.okeyTarget = { color: 'yellow', number: 1 };
  session.currentSeat = 0;
  session.turnPhase = 'draw';
  session.seats[0].opened = true;
  session.seats[0].openMode = 'series';
  session.tableMelds = [
    {
      id: 'm-1',
      type: 'run',
      ownerSeat: 1,
      points: 30,
      slots: [
        { tile: { id: 'tm-1', color: 'blue', number: 9, copy: 0, isFakeOkey: false }, effectiveColor: 'blue', effectiveNumber: 9, isOkeyWild: false },
        { tile: { id: 'tm-2', color: 'blue', number: 10, copy: 0, isFakeOkey: false }, effectiveColor: 'blue', effectiveNumber: 10, isOkeyWild: false },
        { tile: { id: 'tm-3', color: 'blue', number: 11, copy: 0, isFakeOkey: false }, effectiveColor: 'blue', effectiveNumber: 11, isOkeyWild: false }
      ]
    }
  ];

  const pickedTile = { id: 'pick-r6', color: 'red', number: 6, copy: 0, isFakeOkey: false };
  const meldTiles = [
    { id: 'h1', color: 'red', number: 1, copy: 0, isFakeOkey: false },
    { id: 'h2', color: 'red', number: 2, copy: 0, isFakeOkey: false },
    { id: 'h3', color: 'red', number: 3, copy: 0, isFakeOkey: false }
  ];
  const islekTile = { id: 'h-b12', color: 'blue', number: 12, copy: 0, isFakeOkey: false };
  const okeyTile = { id: 'h-y1', color: 'yellow', number: 1, copy: 0, isFakeOkey: false };

  session.seats[0].hand = [...meldTiles, islekTile, okeyTile];
  session.discardPiles[3] = [pickedTile];

  // Opened player takes from left without pickedDiscardTileId lock
  const pickRes = session.drawFromDiscard(0);
  assert.equal(pickRes.ok, true);
  assert.equal(session.pickedDiscardTileId, null);

  // Can lay a meld WITHOUT using pickedTile and keep pickedTile in hand!
  const meldRes = session.layMeld(0, meldTiles.map((x) => x.id));
  assert.equal(meldRes.ok, true);
  assert.ok(session.seats[0].hand.some((t) => t.id === pickedTile.id));

  // Can discard an islek tile -> emits alertKind: 'islek' while keeping pickedTile
  const discIslek = session.discardTile(0, islekTile.id);
  assert.equal(discIslek.ok, true);
  assert.equal(discIslek.islekTriggered, true);
  assert.equal(session.lastEvent.alertKind, 'islek');
  assert.ok(session.seats[0].hand.some((t) => t.id === pickedTile.id));

  // Next turn for seat 0 discarding Okey mid-game -> emits alertKind: 'okey'
  session.currentSeat = 0;
  session.turnPhase = 'play';
  const discOkey = session.discardTile(0, okeyTile.id);
  assert.equal(discOkey.ok, true);
  assert.equal(discOkey.okeyDiscardPenalty, true);
  assert.equal(session.lastEvent.alertKind, 'okey');

  session.destroy();
});

test('GameSession timeout returns left discard for unopened player and discards newly drawn deck tile instead of rack tile', () => {
  const session = new GameSession({
    roomCode: 'TMO',
    seatsConfig: [
      { playerId: 'p0', name: 'Efe', isBot: false },
      { playerId: 'p1', name: 'Bot 1', isBot: true },
      { playerId: 'p2', name: 'Bot 2', isBot: true },
      { playerId: 'p3', name: 'Bot 3', isBot: true }
    ],
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onStateChange: () => {}
  });

  session.startRound();
  session.okeyTarget = { color: 'yellow', number: 1 };
  session.currentSeat = 0;
  session.turnPhase = 'draw';
  session.seats[0].opened = false;

  const rackTile0 = { id: 'rack-0', color: 'black', number: 10, copy: 0, isFakeOkey: false };
  const rackTile1 = { id: 'rack-1', color: 'black', number: 11, copy: 0, isFakeOkey: false };
  const leftTile = { id: 'left-r5', color: 'red', number: 5, copy: 0, isFakeOkey: false };
  const deckTopTile = { id: 'deck-b7', color: 'blue', number: 7, copy: 0, isFakeOkey: false };

  session.seats[0].hand = [rackTile0, rackTile1];
  session.discardPiles[3] = [leftTile];
  session.deck.push(deckTopTile);

  // Unopened player picks from left
  const pickRes = session.drawFromDiscard(0);
  assert.equal(pickRes.ok, true);
  assert.equal(session.pickedDiscardTileId, leftTile.id);

  // Guard still prevents discarding without opening/returning
  const badDisc = session.discardTile(0, rackTile0.id);
  assert.equal(badDisc.ok, false);

  // Timer expires without opening:
  // 1) leftTile must be returned to left pile
  // 2) deckTopTile is drawn and discarded (since it's safe)
  // 3) player's original rack tiles remain intact!
  session.handleTurnTimeout();
  assert.equal(session.discardPiles[3][session.discardPiles[3].length - 1].id, leftTile.id);
  assert.equal(session.discardPiles[0][session.discardPiles[0].length - 1].id, deckTopTile.id);
  assert.deepEqual(
    session.seats[0].hand.map((t) => t.id),
    [rackTile0.id, rackTile1.id]
  );

  session.destroy();
});

test('GameSession.executeBotTurn recovers cleanly if converted from human holding unusable pickedDiscardTileId', (ctx) => {
  const session = new GameSession({
    roomCode: 'BOTREC',
    seatsConfig: [
      { playerId: 'p0', name: 'Efe', isBot: false },
      { playerId: 'p1', name: 'Bot 1', isBot: true },
      { playerId: 'p2', name: 'Bot 2', isBot: true },
      { playerId: 'p3', name: 'Bot 3', isBot: true }
    ],
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onStateChange: () => {}
  });
  ctx.after(() => session.destroy());

  session.startRound();
  session.okeyTarget = { color: 'yellow', number: 1 };
  session.currentSeat = 0;
  session.turnPhase = 'draw';
  session.seats[0].opened = false;

  const leftTile = tile('left-r2', 'red', 2);
  session.seats[0].hand = [tile('h1', 'black', 5), tile('h2', 'blue', 9)];
  session.discardPiles[3] = [leftTile];

  // Human draws unusable left discard, then disconnects/leaves -> converted to bot
  const pickRes = session.drawFromDiscard(0);
  assert.equal(pickRes.ok, true);
  assert.equal(session.pickedDiscardTileId, leftTile.id);

  session.seats[0].isBot = true;
  session.executeBotTurn(0);

  // Immediately, unusable picked discard should be returned to seat 3 and replaced with deck draw
  assert.equal(session.pickedDiscardTileId, null);
  assert.equal(session.discardPiles[3][session.discardPiles[3].length - 1].id, leftTile.id);
  assert.equal(session.seats[0].hand.length, 3);
});

test('LocalSingleplayerClient blocks game:nextRound during playing phase and validates orderTreat target', (ctx) => {
  const client = new LocalSingleplayerClient({
    playerName: '  Efe  ',
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onState: () => {}
  });
  ctx.after(() => client.destroy());

  let nextRes = null;
  client.action('game:nextRound', {}, (res) => {
    nextRes = res;
  });
  assert.equal(nextRes.ok, false);

  let badTargetRes = null;
  client.action('room:orderTreat', { itemId: 'cay', target: 'abc' }, (res) => {
    badTargetRes = res;
  });
  assert.equal(badTargetRes.ok, false);

  let badFloatRes = null;
  client.action('room:orderTreat', { itemId: 'cay', target: 1.5 }, (res) => {
    badFloatRes = res;
  });
  assert.equal(badFloatRes.ok, false);
});

test('musicResolver extracts Spotify tracks/playlists and resolves YouTube Topic audio cleanly without Spotify player', async () => {
  const {
    extractSpotifyTracksFromHtml,
    extractYouTubeCandidatesFromHtml,
    resolveMusicInput
  } = await import('../server/musicResolver.js');

  const playlistHtml = `<!doctype html><html><head></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        state: {
          data: {
            entity: {
              trackList: [
                { title: 'Kuzu Kuzu', subtitle: 'Tarkan' },
                { title: 'Tükeneceğiz', subtitle: 'Sezen Aksu' }
              ]
            }
          }
        }
      }
    }
  })}</script></body></html>`;

  const extracted = extractSpotifyTracksFromHtml(playlistHtml, 'playlist');
  assert.equal(extracted.length, 2);
  assert.equal(extracted[0].query, 'Tarkan - Kuzu Kuzu');
  assert.equal(extracted[1].query, 'Sezen Aksu - Tükeneceğiz');

  const ytSearchHtml = `<script>var ytInitialData = ${JSON.stringify({
    contents: {
      twoColumnSearchResultsRenderer: {
        primaryContents: {
          sectionListRenderer: {
            contents: [
              {
                itemSectionRenderer: {
                  contents: [
                    {
                      videoRenderer: {
                        videoId: 'cov12345678',
                        title: { simpleText: 'Tarkan Kuzu Kuzu Acoustic Cover' },
                        ownerText: { runs: [{ text: 'Random Cover Channel' }] },
                        lengthText: { simpleText: '3:20' }
                      }
                    },
                    {
                      videoRenderer: {
                        videoId: 'top98765432',
                        title: { simpleText: 'Kuzu Kuzu' },
                        ownerText: { runs: [{ text: 'Tarkan - Topic' }] },
                        lengthText: { simpleText: '3:54' }
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      }
    }
  })};</script>`;

  const ranked = extractYouTubeCandidatesFromHtml(ytSearchHtml, 'Tarkan - Kuzu Kuzu');
  assert.equal(ranked[0].videoId, 'top98765432');
  assert.equal(ranked[1].videoId, 'cov12345678');

  const fakeFetch = async (url) => {
    if (String(url).includes('open.spotify.com/embed/playlist/')) {
      return { ok: true, status: 200, text: async () => playlistHtml };
    }
    if (String(url).includes('youtube.com/results')) {
      return { ok: true, status: 200, text: async () => ytSearchHtml };
    }
    return { ok: false, status: 404, text: async () => '' };
  };

  const resolved = await resolveMusicInput(
    'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    '',
    { fetchImpl: fakeFetch }
  );
  assert.equal(resolved.ok, true);
  assert.equal(resolved.track.provider, 'youtube');
  assert.equal(resolved.track.sourceProvider, 'spotify');
  assert.equal(resolved.track.kind, 'bot');
  assert.equal(resolved.track.videoId, 'top98765432');
  assert.deepEqual(resolved.track.fallbackVideoIds, ['cov12345678']);
  assert.match(resolved.track.embedUrl, /youtube\.com\/embed\/top98765432/);
  assert.equal(resolved.track.queueTotal, 2);
  assert.equal(resolved.track.hasNext, true);
});

test('RoomManager resolves Spotify playlists, advances queue without duplicates, switches fallback, and stops at queue end', async () => {
  const { RoomManager } = await import('../server/roomManager.js');
  const fakeIo = {
    to: () => ({ emit: () => {} }),
    emit: () => {}
  };
  const rm = new RoomManager(fakeIo);
  const created = rm.createRoom({ playerId: 'h1', playerName: 'Efe' });
  const code = created.room.code;

  const playlistHtml = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        state: {
          data: {
            entity: {
              trackList: [
                { title: 'Song One', subtitle: 'Artist A' },
                { title: 'Song Two', subtitle: 'Artist B' }
              ]
            }
          }
        }
      }
    }
  })}</script>`;

  const mkYtHtml = (id1, id2, title) =>
    `<script>var ytInitialData = ${JSON.stringify({
      contents: {
        section: {
          items: [
            { videoRenderer: { videoId: id1, title: { simpleText: title }, ownerText: { runs: [{ text: 'Artist - Topic' }] }, lengthText: { simpleText: '3:10' } } },
            { videoRenderer: { videoId: id2, title: { simpleText: `${title} Official Audio` }, ownerText: { runs: [{ text: 'Label' }] }, lengthText: { simpleText: '3:12' } } }
          ]
        }
      }
    })};</script>`;

  const fakeFetch = async (url) => {
    const u = String(url);
    if (u.includes('open.spotify.com/embed/playlist/')) {
      return { ok: true, status: 200, text: async () => playlistHtml };
    }
    if (u.includes('Song%20Two')) {
      return { ok: true, status: 200, text: async () => mkYtHtml('song2main111', 'song2alt2222', 'Song Two') };
    }
    return { ok: true, status: 200, text: async () => mkYtHtml('song1main111', 'song1alt2222', 'Song One') };
  };

  const setRes = await rm.resolveAndSetRoomMusic({
    roomCode: code,
    playerId: 'h1',
    url: 'https://open.spotify.com/playlist/1234567890',
    fetchImpl: fakeFetch
  });
  assert.equal(setRes.ok, true);
  assert.equal(setRes.music.videoId, 'song1main111');
  assert.equal(setRes.music.hasNext, true);

  // Fallback swaps to secondary YouTube videoId cleanly
  const firstKey = `${created.room.music.embedUrl}|${created.room.music.updatedAt}`;
  const fbRes = rm.switchMusicFallback({ roomCode: code, playerId: 'h1', currentKey: firstKey });
  assert.equal(fbRes.ok, true);
  assert.equal(fbRes.music.videoId, 'song1alt2222');

  // Stale key duplicate advance is ignored
  const staleAdv = await rm.advanceRoomMusic({ roomCode: code, playerId: 'h1', currentKey: firstKey, fetchImpl: fakeFetch });
  assert.equal(staleAdv.ok, true);
  assert.equal(staleAdv.skippedDuplicate, true);
  assert.equal(created.room.music.videoId, 'song1alt2222');

  // Matching key advances to Song Two
  const updatedKey = `${created.room.music.embedUrl}|${created.room.music.updatedAt}`;
  const advRes = await rm.advanceRoomMusic({ roomCode: code, playerId: 'h1', currentKey: updatedKey, fetchImpl: fakeFetch });
  assert.equal(advRes.ok, true);
  assert.equal(advRes.music.videoId, 'song2main111');
  assert.equal(advRes.music.queueIndex, 1);
  assert.equal(advRes.music.hasNext, false);

  // Advancing past end stops playback when autoplay is disabled
  const toggleOffRes = rm.setMusicAutoplay({ roomCode: code, playerId: 'h1', enabled: false });
  assert.equal(toggleOffRes.ok, true);
  assert.equal(toggleOffRes.autoplayEnabled, false);
  assert.equal(created.room.music.autoplayEnabled, false);

  const endKey = `${created.room.music.embedUrl}|${created.room.music.updatedAt}`;
  const endRes = await rm.advanceRoomMusic({ roomCode: code, playerId: 'h1', currentKey: endKey, fetchImpl: fakeFetch });
  assert.equal(endRes.ok, true);
  assert.equal(endRes.music, null);
  assert.equal(created.room.music, null);
});

test('extractYouTubeRelatedFromHtml and findAutoplayTrack pick Mix tracks, filter noise, and fall back to search', async () => {
  const { extractYouTubeRelatedFromHtml, findAutoplayTrack } = await import('../server/musicResolver.js');

  const mixHtml = `<script>var ytInitialData = ${JSON.stringify({
    contents: {
      twoColumnWatchNextResults: {
        playlist: {
          playlist: {
            contents: [
              {
                playlistPanelVideoRenderer: {
                  videoId: 'playedSeed01',
                  title: { simpleText: 'Seed Track' },
                  longBylineText: { runs: [{ text: 'Artist - Topic' }] },
                  lengthText: { simpleText: '3:10' }
                }
              },
              {
                playlistPanelVideoRenderer: {
                  videoId: 'reactShort99',
                  title: { simpleText: 'Seed Reaction' },
                  longBylineText: { runs: [{ text: 'Reactor' }] },
                  lengthText: { simpleText: '0:30' }
                }
              },
              {
                playlistPanelVideoRenderer: {
                  videoId: 'nextMixGood1',
                  title: { simpleText: 'Tarkan - Dudu' },
                  longBylineText: { runs: [{ text: 'Tarkan - Topic' }] },
                  lengthText: { simpleText: '4:05' }
                }
              },
              {
                playlistPanelVideoRenderer: {
                  videoId: 'nextMixAlt02',
                  title: { simpleText: 'Tarkan - Kuzu Kuzu Official Audio' },
                  longBylineText: { runs: [{ text: 'Tarkan' }] },
                  lengthText: { simpleText: '3:52' }
                }
              }
            ]
          }
        }
      }
    }
  })};</script>`;

  const related = extractYouTubeRelatedFromHtml(mixHtml, ['playedSeed01']);
  assert.equal(related[0].videoId, 'nextMixGood1');
  assert.equal(related.some((c) => c.videoId === 'playedSeed01'), false);

  const mixTrack = await findAutoplayTrack(
    { videoId: 'playedSeed01', title: 'Seed Track', artist: 'Tarkan' },
    {
      excludeVideoIds: ['playedSeed01'],
      fetchImpl: async (url) => {
        assert.match(String(url), /watch\?v=playedSeed01&list=RDplayedSeed01/);
        return { ok: true, status: 200, text: async () => mixHtml };
      }
    }
  );
  assert.equal(mixTrack.ok, true);
  assert.equal(mixTrack.sourceProvider, 'autoplay');
  assert.equal(mixTrack.videoId, 'nextMixGood1');
  assert.deepEqual(mixTrack.fallbackVideoIds, ['nextMixAlt02', 'reactShort99']);

  // Fallback to search when Mix watch page fails
  const searchHtml = `<script>var ytInitialData = ${JSON.stringify({
    contents: {
      section: {
        items: [
          {
            videoRenderer: {
              videoId: 'playedSeed01',
              title: { simpleText: 'Seed Track' },
              ownerText: { runs: [{ text: 'Tarkan - Topic' }] },
              lengthText: { simpleText: '3:10' }
            }
          },
          {
            videoRenderer: {
              videoId: 'fallbackYt03',
              title: { simpleText: 'Sezen Aksu - Gulumse' },
              ownerText: { runs: [{ text: 'Sezen Aksu - Topic' }] },
              lengthText: { simpleText: '4:40' }
            }
          }
        ]
      }
    }
  })};</script>`;

  const fallbackTrack = await findAutoplayTrack(
    { videoId: 'playedSeed01', title: 'Seed Track', artist: 'Sezen Aksu' },
    {
      excludeVideoIds: ['playedSeed01'],
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.includes('/watch?')) {
          return { ok: false, status: 503, text: async () => '' };
        }
        assert.match(u, /results\?search_query=Sezen%20Aksu%20mix/);
        return { ok: true, status: 200, text: async () => searchHtml };
      }
    }
  );
  assert.equal(fallbackTrack.videoId, 'fallbackYt03');
  assert.equal(fallbackTrack.sourceProvider, 'autoplay');
  assert.equal(fallbackTrack.artist, 'Sezen Aksu');
});

test('RoomManager automatically continues with Serhat Canikli autoplay after queue ends', async () => {
  const { RoomManager } = await import('../server/roomManager.js');
  const emitted = [];
  const fakeIo = {
    to: () => ({ emit: (ev, data) => emitted.push({ ev, data }) }),
    emit: () => {}
  };
  const rm = new RoomManager(fakeIo);
  const created = rm.createRoom({ playerId: 'h1', playerName: 'Efe' });
  const code = created.room.code;

  assert.equal(created.room.musicAutoplay, true);

  const searchHtml = `<script>var ytInitialData = ${JSON.stringify({
    contents: {
      section: {
        items: [
          { videoRenderer: { videoId: 'seedTrack001', title: { simpleText: 'Baris Manco - Daglar Daglar' }, ownerText: { runs: [{ text: 'Baris Manco - Topic' }] }, lengthText: { simpleText: '3:45' } } }
        ]
      }
    }
  })};</script>`;

  const watchHtml = `<script>var ytInitialData = ${JSON.stringify({
    contents: {
      twoColumnWatchNextResults: {
        playlist: {
          playlist: {
            contents: [
              { playlistPanelVideoRenderer: { videoId: 'seedTrack001', title: { simpleText: 'Baris Manco - Daglar Daglar' }, longBylineText: { runs: [{ text: 'Baris Manco - Topic' }] }, lengthText: { simpleText: '3:45' } } },
              { playlistPanelVideoRenderer: { videoId: 'autoTrack002', title: { simpleText: 'Baris Manco - Sari Cizmeli Mehmet Aga' }, longBylineText: { runs: [{ text: 'Baris Manco - Topic' }] }, lengthText: { simpleText: '3:50' } } }
            ]
          }
        }
      }
    }
  })};</script>`;

  const fakeFetch = async (url) => {
    const u = String(url);
    if (u.includes('/watch?')) {
      return { ok: true, status: 200, text: async () => watchHtml };
    }
    return { ok: true, status: 200, text: async () => searchHtml };
  };

  const setRes = await rm.resolveAndSetRoomMusic({
    roomCode: code,
    playerId: 'h1',
    url: 'Baris Manco Daglar Daglar',
    fetchImpl: fakeFetch
  });
  assert.equal(setRes.ok, true);
  assert.equal(setRes.music.videoId, 'seedTrack001');
  assert.equal(setRes.music.autoplayEnabled, true);

  const firstKey = `${created.room.music.embedUrl}|${created.room.music.updatedAt}`;
  const autoRes = await rm.advanceRoomMusic({
    roomCode: code,
    playerId: 'h1',
    currentKey: firstKey,
    fetchImpl: fakeFetch
  });
  assert.equal(autoRes.ok, true);
  assert.equal(autoRes.music.videoId, 'autoTrack002');
  assert.equal(autoRes.music.sourceProvider, 'autoplay');
  assert.equal(autoRes.music.updatedBy, 'Serhat Canikli');
  assert.equal(autoRes.music.autoplayEnabled, true);
  assert.deepEqual(created.room.musicHistory, ['seedTrack001', 'autoTrack002']);
});

test('LocalSingleplayerClient supports Serhat Canikli queue, fallback, and autoplay flow', (ctx) => {
  const client = new LocalSingleplayerClient({
    playerName: 'Efe',
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onState: () => {}
  });
  ctx.after(() => client.destroy());

  const payload = {
    ok: true,
    track: {
      ok: true,
      provider: 'youtube',
      sourceProvider: 'spotify',
      kind: 'bot',
      title: 'Artist - First',
      videoId: 'vidOne11111',
      fallbackVideoIds: ['vidOneAlt22'],
      embedUrl: 'https://www.youtube.com/embed/vidOne11111?autoplay=1&enablejsapi=1'
    },
    queue: [
      {
        ok: true,
        provider: 'youtube',
        sourceProvider: 'spotify',
        kind: 'bot',
        title: 'Artist - First',
        videoId: 'vidOne11111',
        fallbackVideoIds: ['vidOneAlt22'],
        embedUrl: 'https://www.youtube.com/embed/vidOne11111?autoplay=1&enablejsapi=1'
      },
      {
        ok: true,
        provider: 'youtube',
        sourceProvider: 'spotify',
        kind: 'bot',
        title: 'Artist - Second',
        videoId: 'vidTwo22222',
        fallbackVideoIds: [],
        embedUrl: 'https://www.youtube.com/embed/vidTwo22222?autoplay=1&enablejsapi=1'
      }
    ]
  };

  let setRes = null;
  client.action('room:musicSet', { resolvedPayload: payload }, (r) => { setRes = r; });
  assert.equal(setRes.ok, true);
  assert.equal(setRes.music.videoId, 'vidOne11111');
  assert.equal(setRes.music.hasNext, true);
  assert.equal(setRes.music.autoplayEnabled, true);

  let fbRes = null;
  client.action('room:musicFallback', {}, (r) => { fbRes = r; });
  assert.equal(fbRes.ok, true);
  assert.equal(fbRes.music.videoId, 'vidOneAlt22');

  let nextRes = null;
  client.action('room:musicNext', {}, (r) => { nextRes = r; });
  assert.equal(nextRes.ok, true);
  assert.equal(nextRes.music.videoId, 'vidTwo22222');
  assert.equal(nextRes.music.hasNext, false);

  // Queue finished with autoplay enabled -> requests autoplayTrack with played history
  let needAutoRes = null;
  client.action('room:musicNext', {}, (r) => { needAutoRes = r; });
  assert.equal(needAutoRes.ok, false);
  assert.equal(needAutoRes.needsAutoplayTrack.videoId, 'vidTwo22222');
  assert.ok(needAutoRes.excludeVideoIds.includes('vidOne11111'));
  assert.ok(needAutoRes.excludeVideoIds.includes('vidTwo22222'));

  // Providing resolved autoplayTrack continues playback
  let autoRes = null;
  client.action('room:musicNext', {
    autoplayTrack: {
      ok: true,
      provider: 'youtube',
      sourceProvider: 'autoplay',
      kind: 'bot',
      title: 'Auto Next Song',
      videoId: 'vidAuto3333',
      fallbackVideoIds: [],
      embedUrl: 'https://www.youtube.com/embed/vidAuto3333?autoplay=1&enablejsapi=1'
    }
  }, (r) => { autoRes = r; });
  assert.equal(autoRes.ok, true);
  assert.equal(autoRes.music.videoId, 'vidAuto3333');
  assert.equal(autoRes.music.updatedBy, 'Serhat Canikli');

  // Disabling autoplay stops playback when advancing past end
  let toggleRes = null;
  client.action('room:musicAutoplay', { enabled: false }, (r) => { toggleRes = r; });
  assert.equal(toggleRes.ok, true);
  assert.equal(toggleRes.autoplayEnabled, false);
  assert.equal(toggleRes.music.autoplayEnabled, false);

  let stopRes = null;
  client.action('room:musicNext', {}, (r) => { stopRes = r; });
  assert.equal(stopRes.ok, true);
  assert.equal(stopRes.music, null);
});

test('LocalSingleplayerClient supports custom starting seatIndex for human player', () => {
  const states = [];
  const client = new LocalSingleplayerClient({
    playerName: 'Kuzey Oyuncu',
    playerAvatar: 'avatar-3',
    seatIndex: 2,
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onState: (room) => states.push(room)
  });

  client.emitRoomState();
  const latest = states[states.length - 1];
  assert.equal(latest.viewerSeatIndex, 2);
  assert.equal(latest.seats[2].type, 'human');
  assert.equal(latest.seats[2].name, 'Kuzey Oyuncu');
  assert.equal(latest.seats[0].type, 'bot');
  assert.equal(latest.game.viewerSeatIndex, 2);
  assert.equal(latest.game.seats[2].hand.length, 21);

  let orderRes = null;
  client.action('room:orderTreat', { itemId: 'cay', target: 'self' }, (r) => { orderRes = r; });
  assert.equal(orderRes.ok, true);
  assert.equal(orderRes.orders[2].drink.fromSeat, 2);
  assert.equal(orderRes.lastOrder.fromSeat, 2);
  assert.equal(orderRes.lastOrder.targetName, 'kendine');

  let clearRes = null;
  client.action('room:orderClear', { target: 'self' }, (r) => { clearRes = r; });
  assert.equal(clearRes.ok, true);
  assert.equal(clearRes.orders[2].drink, null);

  let snapRes = null;
  client.action('admin:snapshot', {}, (r) => { snapRes = r; });
  const myTileId = snapRes.snapshot.seats[2].hand[0].id;
  const deckTileId = snapRes.snapshot.deck[0].id;
  let swapRes = null;
  client.action('admin:swapTile', { myTileId, sourceKind: 'deck', targetTileId: deckTileId }, (r) => {
    swapRes = r;
  });
  assert.equal(swapRes.ok, true);
  assert.equal(swapRes.snapshot.seats[2].hand[0].id, deckTileId);

  client.destroy();
});

test('LocalSingleplayerClient accepts avatar-7..16 and picks unique bot names from BOT_NAME_POOL', async () => {
  const { BOT_NAME_POOL, isPresetAvatar, PRESET_AVATAR_COUNT } = await import('../shared/presets.js');
  assert.equal(PRESET_AVATAR_COUNT, 16);
  assert.equal(isPresetAvatar('avatar-7'), true);
  assert.equal(isPresetAvatar('avatar-16'), true);
  assert.equal(isPresetAvatar('avatar-17'), false);

  const states = [];
  const client = new LocalSingleplayerClient({
    playerName: 'Arhan',
    playerAvatar: 'avatar-12',
    seatIndex: 1,
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onState: (room) => states.push(room)
  });

  client.emitRoomState();
  const latest = states[states.length - 1];
  assert.equal(latest.seats[1].avatar, 'avatar-12');
  const bots = latest.seats.filter((s) => s.type === 'bot');
  assert.equal(bots.length, 3);
  assert.equal(new Set(bots.map((b) => b.name)).size, 3);
  for (const b of bots) {
    assert.ok(BOT_NAME_POOL.includes(b.name), `Unexpected bot name: ${b.name}`);
    assert.notEqual(b.name, 'Arhan');
    assert.ok(isPresetAvatar(b.avatar), `Unexpected bot avatar: ${b.avatar}`);
  }

  client.destroy();
});

test('GameSession allows opening and laying 1-tile gosterge pair in pairs mode with zero score bonus/penalty', () => {
  const session = new GameSession({
    roomCode: 'GOST',
    seatsConfig: [
      { playerId: 'p0', name: 'A', isBot: false },
      { playerId: 'p1', name: 'B', isBot: false },
      { playerId: 'p2', name: 'C', isBot: false },
      { playerId: 'p3', name: 'D', isBot: false }
    ],
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onStateChange: () => {}
  });

  session.startRound();
  session.gosterge = { id: 'g-center', color: 'blue', number: 7, copy: 0, isFakeOkey: false };
  session.okeyTarget = { color: 'blue', number: 8 };

  const mk = (id, color, number, isFakeOkey = false) => ({ id, color, number, copy: 0, isFakeOkey });

  // Seat 1 has 10 tiles: 4 normal pairs + 1 gosterge twin + 1 discard tile
  session.currentSeat = 1;
  session.turnPhase = 'play';
  session.seats[1].hand = [
    mk('p1a', 'red', 2), mk('p1b', 'red', 2),
    mk('p2a', 'black', 4), mk('p2b', 'black', 4),
    mk('p3a', 'yellow', 6), mk('p3b', 'yellow', 6),
    mk('p4a', 'red', 9), mk('p4b', 'red', 9),
    mk('gtwin', 'blue', 7),
    mk('disc1', 'black', 12)
  ];

  // Series mode cannot open with a 1-tile gosterge group
  const badSeries = session.openHand(1, [['gtwin']], 'series');
  assert.equal(badSeries.ok, false);

  // Pairs mode opens 5 pairs across 9 tiles, leaving 1 tile to discard, and adds zero round penalties
  const openRes = session.openHand(1, [
    ['p1a', 'p1b'],
    ['p2a', 'p2b'],
    ['p3a', 'p3b'],
    ['p4a', 'p4b'],
    ['gtwin']
  ], 'pairs');
  assert.equal(openRes.ok, true);
  assert.equal(session.seats[1].opened, true);
  assert.equal(session.seats[1].openMode, 'pairs');
  assert.equal(session.seats[1].hand.length, 1);
  assert.equal(session.tableMelds.length, 5);
  assert.deepEqual(session.seats.map((s) => s.roundPenalties), [0, 0, 0, 0]);
  assert.deepEqual(session.seats.map((s) => s.totalScore), [0, 0, 0, 0]);

  // Seat 2 also opened in pairs earlier and now lays an extra 1-tile gosterge pair via layMeld
  session.currentSeat = 2;
  session.turnPhase = 'play';
  session.seats[2].opened = true;
  session.seats[2].openMode = 'pairs';
  session.seats[2].hand = [mk('gtwin2', 'blue', 7), mk('non-g', 'red', 7), mk('disc2', 'yellow', 3)];

  const badSingleLay = session.layMeld(2, ['non-g']);
  assert.equal(badSingleLay.ok, false);

  const goodLay = session.layMeld(2, ['gtwin2']);
  assert.equal(goodLay.ok, true);
  assert.equal(session.seats[2].hand.length, 2);

  // Seat 3 opened in series cannot lay a 1-tile gosterge pair
  session.currentSeat = 3;
  session.turnPhase = 'play';
  session.seats[3].opened = true;
  session.seats[3].openMode = 'series';
  session.seats[3].hand = [mk('gtwin3', 'blue', 7), mk('disc3', 'yellow', 4)];
  const badSeriesLay = session.layMeld(3, ['gtwin3']);
  assert.equal(badSeriesLay.ok, false);

  session.destroy();
});

test('formatMusicPlayerDisplay separates track title from explicit Serhat Canikli DJ status', async () => {
  const { formatMusicPlayerDisplay } = await import('../shared/music.js');

  const spotifyDisplay = formatMusicPlayerDisplay({
    title: 'Tarkan - Kuzu Kuzu (Remix)',
    provider: 'youtube',
    sourceProvider: 'spotify',
    updatedBy: 'Efe',
    queueIndex: 0,
    queueTotal: 3
  });
  assert.equal(spotifyDisplay.titleText, 'Tarkan - Kuzu Kuzu (Remix) [1/3]');
  assert.equal(spotifyDisplay.djName, 'Serhat Canikli');
  assert.equal(spotifyDisplay.statusText, 'müziği çalıyor · Spotify · İsteyen: Efe');
  assert.equal(spotifyDisplay.titleText.includes('Serhat Canikli'), false);

  const autoDisplay = formatMusicPlayerDisplay({
    title: 'Sezen Aksu - Gülümse',
    provider: 'youtube',
    sourceProvider: 'autoplay',
    updatedBy: 'Serhat Canikli',
    queueIndex: 1,
    queueTotal: 2
  });
  assert.equal(autoDisplay.titleText, 'Sezen Aksu - Gülümse [2/2]');
  assert.equal(autoDisplay.djName, 'Serhat Canikli');
  assert.equal(autoDisplay.statusText, 'otomatik çalıyor');
  assert.equal(autoDisplay.titleText.includes('Serhat Canikli'), false);

  const pausedDisplay = formatMusicPlayerDisplay({
    title: 'Ceza - Holocaust',
    provider: 'youtube',
    sourceProvider: 'search',
    updatedBy: 'Arhan'
  }, true);
  assert.equal(pausedDisplay.titleText, 'Ceza - Holocaust');
  assert.equal(pausedDisplay.djName, 'Serhat Canikli');
  assert.equal(pausedDisplay.statusText, 'duraklatıldı · İsteyen: Arhan');
});

test('LocalSingleplayerClient supports queueing URLs and queue jump/remove/clear controls', (ctx) => {
  const client = new LocalSingleplayerClient({
    playerName: 'Efe',
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onState: () => {}
  });
  ctx.after(() => client.destroy());

  let res1 = null;
  client.action('room:musicSet', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Birinci' }, (r) => { res1 = r; });
  assert.equal(res1.ok, true);
  assert.equal(res1.music.queueTotal, 1);

  let res2 = null;
  client.action('room:musicSet', { url: 'https://youtu.be/9bZkp7q19f0', title: 'İkinci', mode: 'queue' }, (r) => { res2 = r; });
  assert.equal(res2.ok, true);
  assert.equal(res2.music.queueTotal, 2);
  assert.equal(res2.music.title, 'Birinci');
  assert.equal(res2.music.hasNext, true);
  assert.deepEqual(res2.music.queueItems.map((q) => q.title), ['Birinci', 'İkinci']);

  let res3 = null;
  client.action('room:musicSet', { url: 'https://youtu.be/kJQP7kiw5Fk', title: 'Üçüncü', mode: 'queue' }, (r) => { res3 = r; });
  assert.equal(res3.ok, true);
  assert.equal(res3.music.queueTotal, 3);

  let jumped = null;
  client.action('room:musicQueueJump', { index: 2 }, (r) => { jumped = r; });
  assert.equal(jumped.ok, true);
  assert.equal(jumped.music.title, 'Üçüncü');
  assert.equal(jumped.music.queueIndex, 2);

  let removed = null;
  client.action('room:musicQueueRemove', { index: 0 }, (r) => { removed = r; });
  assert.equal(removed.ok, true);
  assert.equal(removed.music.queueIndex, 1);
  assert.equal(removed.music.queueTotal, 2);

  let cleared = null;
  client.action('room:musicQueueClear', {}, (r) => { cleared = r; });
  assert.equal(cleared.ok, true);
  assert.equal(cleared.music.queueTotal, 1);
  assert.equal(cleared.music.title, 'Üçüncü');
});

test('GameSession accumulates roundHistory across rounds and exposes it in getClientView', () => {
  const session = new GameSession({
    roomCode: 'YAZB',
    seatsConfig: [
      { playerId: 'p0', name: 'Efe', isBot: false },
      { playerId: 'p1', name: 'Arhan', isBot: false },
      { playerId: 'p2', name: 'Hasan', isBot: false },
      { playerId: 'p3', name: 'Eray', isBot: false }
    ],
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onStateChange: () => {}
  });

  // Round 1: Seat 0 wins cleanly
  session.startRound();
  const safe0 = session.seats[0].hand.find((t) => !isOkeyTile(t, session.okeyTarget));
  session.seats[0].hand = [safe0];
  session.seats[0].opened = true;
  session.currentSeat = 0;
  session.turnPhase = 'play';
  session.discardTile(0, safe0.id);
  assert.equal(session.roundHistory.length, 1);
  assert.equal(session.roundHistory[0].roundNumber, 1);
  assert.equal(session.roundHistory[0].winnerSeat, 0);

  // Round 2: Deck exhausted
  session.startRound();
  session.deck = [];
  const cur = session.currentSeat;
  session.discardTile(cur, session.seats[cur].hand[0].id);
  assert.equal(session.roundHistory.length, 2);
  assert.equal(session.roundHistory[1].roundNumber, 2);
  assert.equal(session.roundHistory[1].deckExhausted, true);

  const view = session.getClientView(0);
  assert.equal(view.roundHistory.length, 2);
  assert.equal(view.roundHistory[0].winnerName, 'Efe');
  assert.equal(view.roundHistory[1].deckExhausted, true);

  session.destroy();
});

test('LocalSingleplayerClient handles chatSend, nudge cooldown, musicQueueMove, and musicQueueShuffle', (ctx) => {
  const states = [];
  const client = new LocalSingleplayerClient({
    playerName: 'Efe',
    seatIndex: 1,
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onState: (room) => states.push(room)
  });
  ctx.after(() => client.destroy());

  let chatRes = null;
  client.action('room:chatSend', { quickId: 'play' }, (r) => { chatRes = r; });
  assert.equal(chatRes.ok, true);
  assert.equal(chatRes.entry.seatIndex, 1);
  assert.equal(chatRes.entry.text, 'Hadi oyna!');
  assert.equal(states[states.length - 1].chatHistory.length, 1);

  let nudge1 = null;
  client.action('room:nudge', {}, (r) => { nudge1 = r; });
  assert.equal(nudge1.ok, true);
  assert.equal(nudge1.nudge.seatIndex, 1);

  let nudgeFast = null;
  client.action('room:nudge', {}, (r) => { nudgeFast = r; });
  assert.equal(nudgeFast.ok, false);

  client.action('room:musicSet', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'A' });
  client.action('room:musicSet', { url: 'https://youtu.be/9bZkp7q19f0', title: 'B', mode: 'queue' });
  client.action('room:musicSet', { url: 'https://youtu.be/kJQP7kiw5Fk', title: 'C', mode: 'queue' });

  let moved = null;
  client.action('room:musicQueueMove', { fromIndex: 2, toIndex: 0 }, (r) => { moved = r; });
  assert.equal(moved.ok, true);
  assert.equal(moved.music.title, 'A');
  assert.equal(moved.music.queueIndex, 1);
  assert.deepEqual(moved.music.queueItems.map((q) => q.title), ['C', 'A', 'B']);

  let shuffled = null;
  client.action('room:musicQueueShuffle', {}, (r) => { shuffled = r; });
  assert.equal(shuffled.ok, true);
  assert.equal(shuffled.music.queueItems.length, 3);
  assert.equal(shuffled.music.queueItems[0].title, 'C');
  assert.equal(shuffled.music.queueItems[1].title, 'A');
});

test('GameSession tracks matchStats and computeKahveAwards builds awards and itemized Adisyon receipt', async () => {
  const { computeKahveAwards } = await import('../shared/presets.js');
  const session = new GameSession({
    roomCode: 'ADIS',
    seatsConfig: [
      { playerId: 'p0', name: 'Efe', isBot: false },
      { playerId: 'p1', name: 'Serhat', isBot: false },
      { playerId: 'p2', name: 'Arhan', isBot: false },
      { playerId: 'p3', name: 'Zeynep', isBot: false }
    ],
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onStateChange: () => {}
  });

  session.startRound();
  session.okeyTarget = { color: 'red', number: 5 };
  session.currentSeat = 0;
  session.turnPhase = 'play';

  // Seat 0 opens and finishes from hand (elden) using Okey as final discard
  const finishOkey = { id: 'ok-fin', color: 'red', number: 5, copy: 0, isFakeOkey: false };
  session.seats[0].hand = [
    { id: 'r1', color: 'blue', number: 11, copy: 0, isFakeOkey: false },
    { id: 'r2', color: 'blue', number: 12, copy: 0, isFakeOkey: false },
    { id: 'r3', color: 'blue', number: 13, copy: 0, isFakeOkey: false },
    { id: 'b1', color: 'black', number: 11, copy: 0, isFakeOkey: false },
    { id: 'b2', color: 'black', number: 12, copy: 0, isFakeOkey: false },
    { id: 'b3', color: 'black', number: 13, copy: 0, isFakeOkey: false },
    { id: 'y1', color: 'yellow', number: 10, copy: 0, isFakeOkey: false },
    { id: 'y2', color: 'yellow', number: 11, copy: 0, isFakeOkey: false },
    { id: 'y3', color: 'yellow', number: 12, copy: 0, isFakeOkey: false },
    finishOkey
  ];

  assert.equal(
    session.openHand(0, [['r1', 'r2', 'r3'], ['b1', 'b2', 'b3'], ['y1', 'y2', 'y3']], 'series').ok,
    true
  );
  assert.equal(session.discardTile(0, finishOkey.id).ok, true);

  const view = session.getClientView(0);
  assert.equal(view.seats[0].matchStats.eldenFinishes, 1);
  assert.equal(view.seats[0].matchStats.okeyFinishes, 1);

  const adisyon = computeKahveAwards({
    seats: view.seats,
    socialStats: [
      { treatsOrdered: 2, sipsTaken: 4, catsPetted: 0 },
      { treatsOrdered: 0, sipsTaken: 0, catsPetted: 3 },
      { treatsOrdered: 0, sipsTaken: 0, catsPetted: 0 },
      { treatsOrdered: 0, sipsTaken: 0, catsPetted: 0 }
    ],
    teamMode: 'solo'
  });

  assert.ok(adisyon);
  assert.equal(adisyon.winnerSeat, 0);
  assert.ok(adisyon.awards.some((a) => a.badge === 'Masanın Ağası' && a.name === 'Efe'));
  assert.ok(adisyon.awards.some((a) => a.badge === 'El Ustası' && a.name === 'Efe'));
  assert.ok(adisyon.awards.some((a) => a.badge === 'Gönlü Bol' && a.name === 'Efe'));
  assert.ok(adisyon.awards.some((a) => a.badge === 'Çay Tiriyakisi' && a.name === 'Efe'));
  assert.ok(adisyon.awards.some((a) => a.badge === 'Kedi Dostu' && a.name === 'Serhat'));
  // Kuver 80 + 2 treats * 25 (50) + 4 sips * 5 (20) = 150
  assert.equal(adisyon.billTotal, 150);
  assert.ok(adisyon.receiptFooter.includes('150 TL'));

  session.destroy();
});

test('LocalSingleplayerClient handles live cozy options, TV set/stop, drink sip/refill, and cat petting', (ctx) => {
  const states = [];
  const client = new LocalSingleplayerClient({
    playerName: 'Efe',
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60, roomAtmosphere: 'afternoon', roomAmbiance: 'ocakbasi' },
    onState: (room) => states.push(room)
  });
  ctx.after(() => client.destroy());

  client.emitRoomState();
  assert.equal(states[states.length - 1].options.roomAtmosphere, 'afternoon');
  assert.equal(states[states.length - 1].options.roomAmbiance, 'ocakbasi');

  let optRes = null;
  client.action('room:options', { roomAtmosphere: 'midnight', roomAmbiance: 'fireplace' }, (r) => { optRes = r; });
  assert.equal(optRes.ok, true);
  assert.equal(states[states.length - 1].options.roomAtmosphere, 'midnight');
  assert.equal(states[states.length - 1].options.roomAmbiance, 'fireplace');

  let tvSet = null;
  client.action('room:tvSet', {
    tvPayload: {
      channelId: 'trt1',
      title: 'TRT 1 Canlı',
      videoId: 'abc123def45',
      embedUrl: 'https://www.youtube.com/embed/abc123def45?autoplay=1',
      isLive: true
    }
  }, (r) => { tvSet = r; });
  assert.equal(tvSet.ok, true);
  assert.equal(states[states.length - 1].tv.channelId, 'trt1');

  let tvStop = null;
  client.action('room:tvStop', {}, (r) => { tvStop = r; });
  assert.equal(tvStop.ok, true);
  assert.equal(states[states.length - 1].tv, null);

  let ord = null;
  client.action('room:orderTreat', { itemId: 'cay', target: 'self' }, (r) => { ord = r; });
  assert.equal(ord.ok, true);
  assert.equal(ord.orders[0].drink.sipsRemaining, 4);

  for (let i = 3; i >= 0; i -= 1) {
    let sipRes = null;
    client.action('room:orderSip', {}, (r) => { sipRes = r; });
    assert.equal(sipRes.ok, true);
    assert.equal(sipRes.action, 'sip');
    assert.equal(sipRes.sipsRemaining, i);
  }
  let refillRes = null;
  client.action('room:orderSip', {}, (r) => { refillRes = r; });
  assert.equal(refillRes.ok, true);
  assert.equal(refillRes.action, 'refill');
  assert.equal(refillRes.sipsRemaining, 4);

  let petRes = null;
  client.action('room:catPet', { catIndex: 0 }, (r) => { petRes = r; });
  assert.equal(petRes.ok, true);
  assert.equal(petRes.payload.cat.name, 'Yumak');
  assert.equal(states[states.length - 1].socialStats[0].catsPetted, 1);

  let ambSet = null;
  client.action('room:ambianceSet', {
    ambianceId: 'rain',
    ambiancePayload: {
      ambianceId: 'rain',
      title: 'Yağmur & Gök Gürültüsü',
      videoId: 'rainVid999',
      embedUrl: 'https://www.youtube.com/embed/rainVid999?autoplay=1&loop=1&playlist=rainVid999'
    }
  }, (r) => { ambSet = r; });
  assert.equal(ambSet.ok, true);
  assert.equal(states[states.length - 1].ambianceTrack.videoId, 'rainVid999');

  let ambOff = null;
  client.action('room:options', { roomAmbiance: 'none' }, (r) => { ambOff = r; });
  assert.equal(ambOff.ok, true);
  assert.equal(states[states.length - 1].ambianceTrack, null);
});

test('GameSession tracks roundDiscardsBySeat including pickedUp state across draw/return/finish', () => {
  const session = new GameSession({
    roomCode: 'DISC',
    seatsConfig: [
      { playerId: 'p0', name: 'Ali', isBot: false },
      { playerId: 'p1', name: 'Veli', isBot: false },
      { playerId: 'p2', name: 'Can', isBot: false },
      { playerId: 'p3', name: 'Deniz', isBot: false }
    ],
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onStateChange: () => {}
  });

  session.startRound();
  const seat1Tile = session.seats[1].hand.find((t) => !isOkeyTile(t, session.okeyTarget)) || session.seats[1].hand[0];
  assert.equal(session.discardTile(1, seat1Tile.id).ok, true);
  assert.equal(session.roundDiscardsBySeat[1].length, 1);
  assert.equal(session.roundDiscardsBySeat[1][0].pickedUp, false);

  assert.equal(session.drawFromDiscard(2).ok, true);
  assert.equal(session.roundDiscardsBySeat[1][0].pickedUp, true);

  assert.equal(session.returnPickedDiscard(2).ok, true);
  assert.equal(session.roundDiscardsBySeat[1][0].pickedUp, false);

  assert.equal(session.drawFromDeck(2).ok, true);
  const seat2Tile = session.seats[2].hand.find((t) => !isOkeyTile(t, session.okeyTarget)) || session.seats[2].hand[0];
  assert.equal(session.discardTile(2, seat2Tile.id).ok, true);
  assert.equal(session.drawFromDiscard(3).ok, true);
  assert.equal(session.roundDiscardsBySeat[2][0].pickedUp, true);

  session.finishRound(null, false, 'Test sonu');
  assert.ok(session.roundSummary);
  assert.equal(session.roundSummary.discardsBySeat.length, 4);
  assert.equal(session.roundSummary.discardsBySeat[1].name, 'Veli');
  assert.equal(session.roundSummary.discardsBySeat[1].tiles[0].id, seat1Tile.id);
  assert.equal(session.roundSummary.discardsBySeat[1].tiles[0].pickedUp, false);
  assert.equal(session.roundSummary.discardsBySeat[2].tiles[0].id, seat2Tile.id);
  assert.equal(session.roundSummary.discardsBySeat[2].tiles[0].pickedUp, true);

  session.destroy();
});

test('GameSession.getClientView supports spectator overview and behind-seat views without revealing controls', () => {
  const session = new GameSession({
    roomCode: 'SPEC',
    seatsConfig: [
      { playerId: 'p0', name: 'Ali', isBot: false },
      { playerId: 'p1', name: 'Veli', isBot: false },
      { playerId: 'p2', name: 'Can', isBot: false },
      { playerId: 'p3', name: 'Deniz', isBot: false }
    ],
    options: { katlamali: false, islekPenalty: true, turnSeconds: 60 },
    onStateChange: () => {}
  });

  session.startRound();
  session.pickedDiscardTileId = session.seats[1].hand[0].id;

  const overview = session.getClientView(0, { isSpectator: true, watchSeatIndex: null });
  assert.equal(overview.isSpectator, true);
  assert.equal(overview.watchSeatIndex, null);
  assert.equal(overview.pickedDiscardTileId, null);
  assert.equal(overview.seats.every((s) => s.hand === null && s.tileCount === null), true);

  const behindSeat1 = session.getClientView(0, { isSpectator: true, watchSeatIndex: 1 });
  assert.equal(behindSeat1.isSpectator, true);
  assert.equal(behindSeat1.watchSeatIndex, 1);
  assert.equal(behindSeat1.viewerSeatIndex, 1);
  assert.equal(behindSeat1.pickedDiscardTileId, null);
  assert.equal(Array.isArray(behindSeat1.seats[1].hand), true);
  assert.equal(behindSeat1.seats[1].hand.length, 22);
  assert.equal(behindSeat1.seats[1].tileCount, 22);
  assert.equal(behindSeat1.seats[0].hand, null);
  assert.equal(behindSeat1.seats[0].tileCount, null);
  assert.equal(behindSeat1.seats[2].hand, null);
  assert.equal(behindSeat1.seats[3].hand, null);

  session.destroy();
});

