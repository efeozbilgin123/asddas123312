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

test('parseMusicUrl handles YouTube, Spotify, SoundCloud, MP3 audio, web players and rejects unsafe URLs', async () => {
  const { parseMusicUrl } = await import('../shared/music.js');

  const yt = parseMusicUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Test Track');
  assert.equal(yt.ok, true);
  assert.equal(yt.provider, 'youtube');
  assert.equal(yt.kind, 'iframe');
  assert.match(yt.embedUrl, /youtube\.com\/embed\/dQw4w9WgXcQ/);

  const sp = parseMusicUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=123');
  assert.equal(sp.ok, true);
  assert.equal(sp.provider, 'spotify');
  assert.match(sp.embedUrl, /open\.spotify\.com\/embed\/track\/4cOdK2wGLETKBW3PvgPWqT/);

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

