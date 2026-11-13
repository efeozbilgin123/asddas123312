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
  const starterDiscard = session.seats[1].hand[0];
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
