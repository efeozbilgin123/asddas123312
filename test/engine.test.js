import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, computeOkeyTarget, isOkeyTile } from '../shared/tiles.js';
import {
  validateSet,
  validateRun,
  validateGroup,
  validatePair,
  canLayoffTile,
  findBestOpening,
  autoArrangeRuns,
  autoArrangePairs,
  analyzeHandLive
} from '../shared/melds.js';
import { isDiscardPlayableOnTable, computeRoundScores } from '../shared/rules.js';

function t(id, color, number, isFakeOkey = false) {
  return { id, color, number, copy: 0, isFakeOkey };
}

test('createDeck produces 106 tiles with 2 false okeys', () => {
  const deck = createDeck();
  assert.equal(deck.length, 106);
  const fakes = deck.filter((x) => x.isFakeOkey);
  assert.equal(fakes.length, 2);
});

test('computeOkeyTarget wraps 13 to 1 of the same color', () => {
  const okey = computeOkeyTarget(t('g1', 'blue', 13));
  assert.deepEqual(okey, { color: 'blue', number: 1 });
});

test('validateSet checks unique colors and handles Okey wildcard', () => {
  const okeyTarget = { color: 'red', number: 5 };
  const valid = validateSet(
    [t('1', 'red', 9), t('2', 'blue', 9), t('3', 'black', 9)],
    okeyTarget
  );
  assert.equal(valid.valid, true);
  assert.equal(valid.points, 27);

  const withOkey = validateSet(
    [t('1', 'blue', 11), t('2', 'black', 11), t('3', 'red', 5)],
    okeyTarget
  );
  assert.equal(withOkey.valid, true);
  assert.equal(withOkey.points, 33);

  const dupColor = validateSet(
    [t('1', 'red', 7), t('2', 'red', 7), t('3', 'black', 7)],
    okeyTarget
  );
  assert.equal(dupColor.valid, false);
});

test('validateRun rejects 12-13-1 wraparound in 101 Okey and supports Sahte Okey', () => {
  const okeyTarget = { color: 'yellow', number: 7 };
  const wrap12 = validateRun(
    [t('1', 'black', 12), t('2', 'black', 13), t('3', 'black', 1)],
    okeyTarget
  );
  assert.equal(wrap12.valid, false);

  const highRun = validateRun(
    [t('1', 'black', 11), t('2', 'black', 12), t('3', 'black', 13)],
    okeyTarget
  );
  assert.equal(highRun.valid, true);
  assert.equal(highRun.points, 36);

  const withFake = validateRun(
    [t('1', 'yellow', 6), t('2', 'fake', 0, true), t('3', 'yellow', 8)],
    okeyTarget
  );
  assert.equal(withFake.valid, true);
  assert.equal(withFake.points, 21);

  const invalidWrap = validateRun(
    [t('1', 'red', 13), t('2', 'red', 1), t('3', 'red', 2)],
    okeyTarget
  );
  assert.equal(invalidWrap.valid, false);
});

test('canLayoffTile appends to runs/sets and swaps real tile for Okey', () => {
  const okeyTarget = { color: 'red', number: 4 };
  const run = validateRun(
    [t('1', 'blue', 5), t('o', 'red', 4), t('3', 'blue', 7)],
    okeyTarget
  );
  const meld = { id: 'm-1', type: 'run', ownerSeat: 0, points: run.points, slots: run.slots };

  // Layoff 8 blue
  const appendRes = canLayoffTile(t('4', 'blue', 8), meld, okeyTarget);
  assert.equal(appendRes.valid, true);
  assert.equal(appendRes.mode, 'append');
  assert.equal(appendRes.updatedMeld.points, 26);

  // Swap real 6 blue for Okey
  const swapRes = canLayoffTile(t('real6', 'blue', 6), meld, okeyTarget);
  assert.equal(swapRes.valid, true);
  assert.equal(swapRes.mode, 'swap_okey');
  assert.equal(isOkeyTile(swapRes.swappedOkey, okeyTarget), true);
});

test('findBestOpening detects >= 101 opening sets/runs', () => {
  const okeyTarget = { color: 'red', number: 1 };
  const hand = [
    t('a1', 'red', 11),
    t('a2', 'red', 12),
    t('a3', 'red', 13), // 36
    t('b1', 'blue', 10),
    t('b2', 'black', 10),
    t('b3', 'yellow', 10),
    t('b4', 'red', 10), // 40
    t('c1', 'blue', 8),
    t('c2', 'blue', 9),
    t('c3', 'blue', 10) // wait b1 is blue 10! So use black 8,9,10:
  ];
  hand.splice(7, 3, t('c1', 'black', 8), t('c2', 'black', 9), t('c3', 'black', 11)); // not consecutive
  hand.splice(7, 3, t('c1', 'yellow', 8), t('c2', 'yellow', 9), t('c3', 'yellow', 11));
  // Add a clear 3-tile run: green/yellow 11-12-13 -> 36
  hand.splice(7, 3, t('c1', 'yellow', 11), t('c2', 'yellow', 12), t('c3', 'yellow', 13)); // 36 -> total 112

  const best = findBestOpening(hand, okeyTarget, 101);
  assert.equal(best.canOpen, true);
  assert.ok(best.totalPoints >= 101);
});

test('validatePair and isDiscardPlayableOnTable work accurately', () => {
  const okeyTarget = { color: 'black', number: 3 };
  const pair = validatePair([t('p1', 'red', 9), t('p2', 'red', 9)], okeyTarget);
  assert.equal(pair.valid, true);

  const setMeld = validateGroup(
    [t('s1', 'red', 5), t('s2', 'blue', 5), t('s3', 'yellow', 5)],
    okeyTarget
  );
  const tableMelds = [{ id: 'm-1', type: 'set', slots: setMeld.slots, points: setMeld.points }];
  assert.equal(isDiscardPlayableOnTable(t('d1', 'black', 5), tableMelds, okeyTarget), true);
  assert.equal(isDiscardPlayableOnTable(t('d2', 'black', 6), tableMelds, okeyTarget), false);
});

test('computeRoundScores calculates 202 for unopened and -101 for winner', () => {
  const okeyTarget = { color: 'red', number: 2 };
  const rows = computeRoundScores({
    seats: [
      { seatIndex: 0, name: 'A', opened: true, openMode: 'series', hand: [], roundPenalties: 0 },
      { seatIndex: 1, name: 'B', opened: false, openMode: null, hand: [t('1', 'red', 5)], roundPenalties: 0 },
      { seatIndex: 2, name: 'C', opened: true, openMode: 'series', hand: [t('2', 'blue', 10)], roundPenalties: 101 },
      { seatIndex: 3, name: 'D', opened: true, openMode: 'pairs', hand: [t('3', 'black', 4)], roundPenalties: 0 }
    ],
    winnerSeat: 0,
    finishedWithOkey: false,
    okeyTarget
  });
  assert.equal(rows[0].roundDelta, -101);
  assert.equal(rows[1].roundDelta, 202);
  assert.equal(rows[2].roundDelta, 111);
  assert.equal(rows[3].roundDelta, 8);
});

test('computeRoundScores applies 2x/4x multipliers, flat +101 for held Okey, and 0 on roundCancelled', () => {
  const okeyTarget = { color: 'red', number: 2 };

  // Çiftten bitme (2x) + Elde Okey bırakma (+101 sabit)
  const pairsWin = computeRoundScores({
    seats: [
      { seatIndex: 0, name: 'A', opened: true, openMode: 'pairs', hand: [], roundPenalties: 0 },
      { seatIndex: 1, name: 'B', opened: false, openMode: null, hand: [t('1', 'blue', 9)], roundPenalties: 0 },
      { seatIndex: 2, name: 'C', opened: true, openMode: 'series', hand: [t('2', 'red', 2), t('3', 'blue', 5)], roundPenalties: 0 },
      { seatIndex: 3, name: 'D', opened: true, openMode: 'pairs', hand: [t('4', 'black', 3)], roundPenalties: 0 }
    ],
    winnerSeat: 0,
    finishedWithOkey: false,
    finishedFromPairs: true,
    okeyTarget
  });
  assert.equal(pairsWin[0].roundDelta, -202);
  assert.equal(pairsWin[1].roundDelta, 404);
  assert.equal(pairsWin[2].handValue, 10);
  assert.equal(pairsWin[2].penalties, 101);
  assert.equal(pairsWin[2].roundDelta, 111);
  assert.equal(pairsWin[3].roundDelta, 12);

  // Elden (kafa) + Okeyle bitme (4x)
  const kafaOkeyWin = computeRoundScores({
    seats: [
      { seatIndex: 0, name: 'A', opened: true, openMode: 'series', hand: [], roundPenalties: 0 },
      { seatIndex: 1, name: 'B', opened: false, openMode: null, hand: [t('1', 'blue', 4)], roundPenalties: 0 },
      { seatIndex: 2, name: 'C', opened: true, openMode: 'series', hand: [t('2', 'yellow', 5)], roundPenalties: 0 },
      { seatIndex: 3, name: 'D', opened: true, openMode: 'series', hand: [], roundPenalties: 0 }
    ],
    winnerSeat: 0,
    finishedWithOkey: true,
    finishedFromHand: true,
    okeyTarget
  });
  assert.equal(kafaOkeyWin[0].roundDelta, -404);
  assert.equal(kafaOkeyWin[1].roundDelta, 808);
  assert.equal(kafaOkeyWin[2].roundDelta, 20);

  // 4 oyuncu da çift açınca el iptali (herkese 0)
  const cancelled = computeRoundScores({
    seats: [
      { seatIndex: 0, name: 'A', opened: true, openMode: 'pairs', hand: [t('1', 'blue', 4)], roundPenalties: 101 },
      { seatIndex: 1, name: 'B', opened: true, openMode: 'pairs', hand: [t('2', 'red', 7)], roundPenalties: 0 },
      { seatIndex: 2, name: 'C', opened: true, openMode: 'pairs', hand: [t('3', 'black', 8)], roundPenalties: 0 },
      { seatIndex: 3, name: 'D', opened: true, openMode: 'pairs', hand: [t('4', 'yellow', 9)], roundPenalties: 0 }
    ],
    winnerSeat: null,
    roundCancelled: true,
    okeyTarget
  });
  assert.deepEqual(
    cancelled.map((r) => r.roundDelta),
    [0, 0, 0, 0]
  );
});

test('autoArrangeRuns and autoArrangePairs insert gaps between melds/pairs and preserve all tiles', () => {
  const okeyTarget = { color: 'yellow', number: 1 };

  // 3 melds (3+3+3 = 9 tiles) + 13 leftovers = 22 tiles
  const runHand = [
    t('r1', 'red', 10),
    t('r2', 'red', 11),
    t('r3', 'red', 12),
    t('b1', 'blue', 7),
    t('b2', 'blue', 8),
    t('b3', 'blue', 9),
    t('k1', 'black', 13),
    t('r4', 'red', 13),
    t('b4', 'blue', 13),
    t('x1', 'red', 2),
    t('x2', 'blue', 3),
    t('x3', 'black', 4),
    t('x4', 'yellow', 5),
    t('x5', 'red', 6),
    t('x6', 'blue', 2),
    t('x7', 'black', 6),
    t('x8', 'yellow', 3),
    t('x9', 'red', 4),
    t('x10', 'blue', 5),
    t('x11', 'black', 2),
    t('x12', 'yellow', 4),
    t('x13', 'yellow', 6)
  ];

  const runSlots = autoArrangeRuns(runHand, okeyTarget);
  assert.equal(runSlots.length, 28);
  assert.equal(runSlots.filter(Boolean).length, 22);
  // Top row (0..13): meld1 (0..2), null at 3, meld2 (4..6), null at 7, meld3 (8..10)
  assert.equal(runSlots[3], null);
  assert.equal(runSlots[7], null);
  assert.notEqual(runSlots[0], null);
  assert.notEqual(runSlots[4], null);
  assert.notEqual(runSlots[8], null);

  // 7 pairs (14 tiles) + 8 leftovers = 22 tiles
  const pairHand = [];
  for (let i = 0; i < 7; i += 1) {
    pairHand.push({ id: `pa-${i}`, color: 'red', number: i + 2, copy: 0, isFakeOkey: false });
    pairHand.push({ id: `pb-${i}`, color: 'red', number: i + 2, copy: 1, isFakeOkey: false });
  }
  for (let i = 0; i < 8; i += 1) {
    pairHand.push(t(`left-${i}`, 'blue', i + 2));
  }

  const pairSlots = autoArrangePairs(pairHand, okeyTarget);
  assert.equal(pairSlots.length, 28);
  assert.equal(pairSlots.filter(Boolean).length, 22);
  // 5 pairs on row 0 separated by single null gaps at indices 2, 5, 8, 11
  assert.equal(pairSlots[2], null);
  assert.equal(pairSlots[5], null);
  assert.equal(pairSlots[8], null);
  assert.equal(pairSlots[11], null);
  // 2 remaining pairs on row 1 separated by null at 16, and null at 19 before leftovers
  assert.equal(pairSlots[16], null);
  assert.equal(pairSlots[19], null);
});

test('analyzeHandLive automatically counts Tek (Seri) points and Cift count without forming 12-13-1', () => {
  const okeyTarget = { color: 'yellow', number: 1 };
  const hand = [
    t('s1', 'red', 12),
    t('s2', 'red', 13),
    t('s3', 'red', 1), // 12-13-1 must NOT count as a valid run!
    t('p1a', 'blue', 10),
    t('p1b', 'black', 10),
    t('p1c', 'yellow', 10), // 30
    { id: 'c1a', color: 'blue', number: 8, copy: 0, isFakeOkey: false },
    { id: 'c1b', color: 'blue', number: 8, copy: 1, isFakeOkey: false },
    { id: 'c2a', color: 'black', number: 9, copy: 0, isFakeOkey: false },
    { id: 'c2b', color: 'black', number: 9, copy: 1, isFakeOkey: false }
  ];

  // Unarranged rackSlots (all null) still auto-counts optimal melds & pairs
  const live = analyzeHandLive(new Array(28).fill(null), hand, okeyTarget);
  assert.equal(live.seriesPoints, 30);
  assert.equal(live.seriesGroups.length, 1);
  assert.equal(live.pairCount, 2);

  // Manual rack layout with gaps counts arranged groups too
  const slots = new Array(28).fill(null);
  slots[0] = hand[3];
  slots[1] = hand[4];
  slots[2] = hand[5];
  slots[4] = hand[6];
  slots[5] = hand[7];
  slots[7] = hand[8];
  slots[8] = hand[9];
  const arrangedLive = analyzeHandLive(slots, hand, okeyTarget);
  assert.equal(arrangedLive.seriesPoints, 30);
  assert.equal(arrangedLive.pairCount, 2);
});

test('analyzeHandLive respects requiredTileId (picked left discard) so Tek Ac never omits it', () => {
  const okeyTarget = { color: 'yellow', number: 1 };
  // Hand has 10-10-10 (30) + 12-12-12 (36) + 13-13-13 (39) = 105 without leftTile,
  // and red 11 + red 12 + red 13 (leftTile) = 36 so 30 + 36 + 36 = 102 WITH leftTile!
  const leftTile = t('left-r13', 'red', 13);
  const hand = [
    t('a1', 'blue', 10),
    t('a2', 'black', 10),
    t('a3', 'yellow', 10), // 30
    t('b1', 'blue', 12),
    t('b2', 'black', 12),
    t('b3', 'yellow', 12), // 36
    t('c1', 'blue', 13),
    t('c2', 'black', 13),
    t('c3', 'yellow', 13), // 39 (overlaps with leftTile if both used? No, leftTile is red 13!)
    t('r11', 'red', 11),
    t('r12', 'red', 12),
    leftTile,
    t('extra', 'black', 4)
  ];

  const liveWithReq = analyzeHandLive(new Array(28).fill(null), hand, okeyTarget, 14, leftTile.id);
  assert.equal(liveWithReq.seriesUsesRequired, true);
  assert.ok(liveWithReq.seriesPoints >= 101);
  assert.ok(liveWithReq.seriesGroups.some((g) => g.tiles.some((x) => x.id === leftTile.id)));

  // Unusable left tile marks seriesUsesRequired = false
  const deadLeft = t('dead-2', 'yellow', 2);
  const handWithDead = [...hand, deadLeft];
  const liveDead = analyzeHandLive(new Array(28).fill(null), handWithDead, okeyTarget, 14, deadLeft.id);
  assert.equal(liveDead.seriesUsesRequired, false);
});

test('chooseBotDrawSource refuses left discard if opening uses all 22 tiles without leaving a discard', async () => {
  const { chooseBotDrawSource } = await import('../shared/botAI.js');
  const okeyTarget = { color: 'yellow', number: 1 };
  // 21 tiles in hand + 1 leftDiscardTop = 22 tiles, where the only 101+ opening consumes all 22 tiles!
  // Groups:
  // g1: red 2..10 (9 tiles, 54 pts) — wait 2+3+4+5+6+7+8+9+10 = 54
  // g2: blue 2..10 (9 tiles, 54 pts) -> total 108 pts across 18 tiles; plus 4-tile set black/yellow/red/blue 1? Wait: make exact 22-tile cover:
  // Group A (7 tiles): black 1..7 = 28
  // Group B (7 tiles): blue 1..7 = 28
  // Group C (8 tiles): red 1..8 = 36 -> 28+28+36 = 92; bump numbers so >= 101 AND no sub-run < 101?
  // Wait: findBestOpening takes sub-runs! Wait: if hand ONLY has 4-tile sets/runs? No, sub-runs of length 3 have fewer points!
  // Let's make 6 tiles + 4 tiles + 4 tiles + 4 tiles + 4 tiles = 22 tiles? Sub-runs still exist!
  // Wait: what if opening requires >= 101 and using ALL 4 groups (4+4+4+4+6 or 3+3+3+3+10? No, 10-tile run has sub-runs!):
  // Actually: 3+3+3+3+3+3+4 = 22 tiles with NO sub-runs on the 3-tile sets!
  // Check sums of 6 sets of 3 + 1 set of 4 = 22 tiles:
  // Wait: 10 + 10 + 10 (30? no, sets are max 4!)
  // Let's make exact 22 tiles that have NO sub-runs/sub-sets >= 101 without using ALL 22 tiles:
  // - black 2,3,4 (9) + blue 2,3,4 (9) + red 2,3,4 (9) + yellow 2,3,4 (9) -> 12 tiles = 36 pts (no sub-runs!)
  // - red 5,6,7 (18) + blue 5,6,7 (18) -> 18 tiles = 72 pts
  // - black 8,9,10,11 (38) -> wait 8,9,10 (27): 72 + 27 = 99 < 101! With black 11 (leftDiscardTop), black 8..11 = 38 -> 72 + 38 = 110 >= 101, using ALL 22 tiles!
  // Verify NO subset of 21 tiles reaches 101: max is 72 + 29? Wait: black 9,10,11 = 30 -> 72 + 30 = 102!
  // Haha good catch! So put leftDiscardTop = black 5 (in 3-tile set? No, let all 3-tile sets be sets of same number? No, runs of length 3 have no sub-runs!).
  // Use 6 runs of length 3 + 1 set of length 4:
  // Wait: set of 4 tens = 40 (subset of 3 tens = 30).
  // What if we have FIVE 3-tile runs + ONE 4-tile set + ONE 3-tile run:
  // Wait: 6*3 + 4 = 22.
  // To make 22 tiles REQUIRED: removing any 1 tile from ANY group reduces points below 101!
  // If we use 3-tile runs/sets only? 7*3 = 21 tiles (1 left over).
  // To force 22 tiles: 4-tile set of 3s (12 pts; dropping 1 -> 9 pts, delta 3) + ... no, openThreshold is 101!
  // Look: set openThreshold = 105 (katlamali!).
  // 22 tiles = six 3-tile groups + one 4-tile group:
  // Say:
  // 1) red 4,5,6 (15)
  // 2) blue 4,5,6 (15)
  // 3) black 4,5,6 (15)
  // 4) yellow 4,5,6 (15)
  // 5) red 7,8,9 (24)  -> Wait black/blue/etc. Make sure no cross-color sets of 4/5/6! Wait: red 4 + blue 4 + black 4 + yellow 4 = 16! So vary the numbers!
  // Easy! Use distinct numbers per color:
  // 1) red 2,3,4 (9)
  // 2) blue 3,4,5 (12)
  // 3) black 4,5,6 (15)
  // 4) yellow 5,6,7 (18)
  // 5) red 8,9,10 (27)
  // 6) blue 7,8,9 (24) -> sum = 9+12+15+18+27+24 = 105! Wait that's 18 tiles!
  // We want 22 tiles required for threshold 105:
  // Adjust threshold = 108!Wait: max points of 7 runs of 3 = 21 tiles. With katlamali openThreshold = 114:
  // 1) red 1,2,3 (6)
  // 2) blue 2,3,4 (9)
  // 3) black 3,4,5 (12)
  // 4) yellow 4,5,6 (15)
  // 5) red 6,7,8 (21)
  // 6) blue 7,8,9 (24) -> 18 tiles, 87 pts
  // 7) 4-tile set of 7s? No, colors overlap with 7s -> 4-tile set of 10s (40 pts) -> 87+40 = 127 (3 tens = 30 -> 117 >= 114, still works).
  // Set openThreshold = 126! Then 87 + 30 = 117 < 126, MUST use all 4 tens (87 + 40 = 127 >= 126) using ALL 22 tiles!
  const hand = [
    t('r1', 'red', 1), t('r2', 'red', 2), t('r3', 'red', 3),
    t('b2', 'blue', 2), t('b3', 'blue', 3), t('b4', 'blue', 4),
    t('k3', 'black', 3), t('k4', 'black', 4), t('k5', 'black', 5),
    t('y4', 'yellow', 4), t('y5', 'yellow', 5), t('y6', 'yellow', 6),
    t('r6', 'red', 6), t('r7', 'red', 7), t('r8', 'red', 8),
    t('b7', 'blue', 7), t('b8', 'blue', 8), t('b9', 'blue', 9),
    t('t1', 'red', 10), t('t2', 'blue', 10), t('t3', 'black', 10)
  ];
  const leftDiscardTop = t('t4', 'yellow', 10);
  const src = chooseBotDrawSource({
    seat: { seatIndex: 1, opened: false, hand },
    leftDiscardTop,
    state: {
      okeyTarget,
      openThreshold: 126,
      pairThreshold: 5,
      tableMelds: [],
      seats: [],
      options: { katlamali: true }
    }
  });
  assert.equal(src, 'deck');
});

test('computeBotTurnActions does not emit invalid sim-* layoffTile ids', async () => {
  const { computeBotTurnActions } = await import('../shared/botAI.js');
  const okeyTarget = { color: 'black', number: 1 };
  // Step 2 lays [r13, b13, y13] as sim-0; without fix, Step 3 emits layoffTile { meldId: 'sim-0' } for w1.
  const hand = [
    t('r13', 'red', 13), t('b13', 'blue', 13), t('y13', 'yellow', 13),
    t('w1', 'black', 1), t('d1', 'yellow', 4)
  ];
  const actions = computeBotTurnActions({
    seat: { seatIndex: 0, opened: true, openMode: 'series', hand },
    state: {
      okeyTarget,
      openThreshold: 101,
      pairThreshold: 5,
      tableMelds: [],
      seats: [{ seatIndex: 0, opened: true, openMode: 'series' }],
      pickedDiscardTileId: null,
      pickedDiscardFromSeat: null,
      options: { katlamali: false }
    }
  });

  const simLayoffs = actions.filter(
    (a) => a.type === 'layoffTile' && String(a.meldId).startsWith('sim-')
  );
  assert.equal(simLayoffs.length, 0);
  assert.equal(actions.some((a) => a.type === 'discardTile'), true);
});

test('isGostergeTile and validatePair treat matching gosterge twin as a 1-tile pair without wildcards', async () => {
  const { isGostergeTile } = await import('../shared/tiles.js');
  const gosterge = t('g-center', 'blue', 7);
  const okeyTarget = { color: 'blue', number: 8 };
  const twin = t('g-twin', 'blue', 7);
  const fake = t('fake-1', 'blue', 7, true);
  const other = t('other-1', 'red', 7);

  assert.equal(isGostergeTile(twin, gosterge), true);
  assert.equal(isGostergeTile(fake, gosterge), false);
  assert.equal(isGostergeTile(other, gosterge), false);
  assert.equal(isGostergeTile(twin, null), false);

  const validSingle = validatePair([twin], okeyTarget, gosterge);
  assert.equal(validSingle.valid, true);
  assert.equal(validSingle.type, 'pair');
  assert.equal(validSingle.isGostergePair, true);
  assert.equal(validSingle.points, 14);
  assert.equal(validSingle.slots.length, 1);

  assert.equal(validatePair([twin], okeyTarget, null).valid, false);
  assert.equal(validatePair([fake], okeyTarget, gosterge).valid, false);
  assert.equal(validatePair([other], okeyTarget, gosterge).valid, false);
});

test('findPairsInHand and analyzeHandLive count 1-tile gosterge pair without wasting an Okey', async () => {
  const { findPairsInHand } = await import('../shared/melds.js');
  const gosterge = t('g-center', 'red', 4);
  const okeyTarget = { color: 'red', number: 5 };
  const hand = [
    t('p1a', 'blue', 2), t('p1b', 'blue', 2),
    t('p2a', 'black', 6), t('p2b', 'black', 6),
    t('p3a', 'yellow', 9), t('p3b', 'yellow', 9),
    t('p4a', 'red', 11), t('p4b', 'red', 11),
    t('gtwin', 'red', 4),
    t('okey', 'red', 5),
    t('spare', 'black', 12)
  ];

  const pairs = findPairsInHand(hand, okeyTarget, null, gosterge);
  // 4 normal pairs + 1 gosterge 1-tile pair + [spare, okey] = 6 pairs total (no wild wasted on gtwin)
  assert.equal(pairs.length, 6);
  const gPair = pairs.find((p) => p.some((x) => x.id === 'gtwin'));
  assert.ok(gPair);
  assert.equal(gPair.length, 1);

  // Place isolated gtwin on rack slot 0 and remaining pairs spaced with gaps
  const rackSlots = new Array(28).fill(null);
  rackSlots[0] = hand[8]; // gtwin alone
  rackSlots[2] = hand[0]; rackSlots[3] = hand[1];
  rackSlots[5] = hand[2]; rackSlots[6] = hand[3];
  rackSlots[8] = hand[4]; rackSlots[9] = hand[5];
  rackSlots[11] = hand[6]; rackSlots[12] = hand[7];

  const live = analyzeHandLive(rackSlots, hand.slice(0, 9), okeyTarget, 14, null, gosterge);
  assert.equal(live.pairCount, 5);
  assert.equal(live.pairGroups.some((g) => g.tiles.length === 1 && g.tiles[0].id === 'gtwin'), true);
});

test('botAI opens and lays 1-tile gosterge pair while preserving discard tile', async () => {
  const { chooseBotDrawSource, computeBotTurnActions } = await import('../shared/botAI.js');
  const gosterge = t('g-center', 'yellow', 10);
  const okeyTarget = { color: 'yellow', number: 11 };

  // 9 tiles in hand = 4 pairs (8 tiles) + 1 spare; drawing gtwin makes 10 tiles = 5 pairs (9 tiles) + 1 discard!
  const drawSrc = chooseBotDrawSource({
    seat: {
      seatIndex: 1,
      opened: false,
      hand: [
        t('p1a', 'red', 2), t('p1b', 'red', 2),
        t('p2a', 'blue', 4), t('p2b', 'blue', 4),
        t('p3a', 'black', 6), t('p3b', 'black', 6),
        t('p4a', 'red', 8), t('p4b', 'red', 8),
        t('disc', 'blue', 13)
      ]
    },
    leftDiscardTop: t('gtwin', 'yellow', 10),
    state: {
      gosterge,
      okeyTarget,
      openThreshold: 101,
      pairThreshold: 5,
      tableMelds: [],
      seats: [
        { seatIndex: 0, opened: true, openMode: 'pairs' },
        { seatIndex: 1, opened: false, openMode: null }
      ],
      options: { katlamali: true }
    }
  });
  assert.equal(drawSrc, 'discard');

  // 10 tiles in hand: 4 normal pairs + 1 single gtwin + 1 discard
  const openHand = [
    t('p1a', 'red', 2), t('p1b', 'red', 2),
    t('p2a', 'blue', 4), t('p2b', 'blue', 4),
    t('p3a', 'black', 6), t('p3b', 'black', 6),
    t('p4a', 'red', 8), t('p4b', 'red', 8),
    t('gtwin', 'yellow', 10),
    t('disc', 'blue', 13)
  ];
  const openActions = computeBotTurnActions({
    seat: { seatIndex: 0, opened: false, openMode: null, hand: openHand },
    state: {
      gosterge,
      okeyTarget,
      openThreshold: 101,
      pairThreshold: 5,
      tableMelds: [],
      seats: [{ seatIndex: 0, opened: false, openMode: null }],
      pickedDiscardTileId: null,
      pickedDiscardFromSeat: null,
      options: { katlamali: false }
    }
  });
  const openAct = openActions.find((a) => a.type === 'openHand');
  assert.ok(openAct);
  assert.equal(openAct.mode, 'pairs');
  assert.equal(openAct.groups.length, 5);
  assert.equal(openAct.groups.some((g) => g.length === 1 && g[0] === 'gtwin'), true);
  assert.equal(openActions.some((a) => a.type === 'discardTile'), true);

  // Already opened in pairs: lays 1-tile gosterge pair and discards remaining tile
  const layActions = computeBotTurnActions({
    seat: {
      seatIndex: 0,
      opened: true,
      openMode: 'pairs',
      hand: [t('gtwin', 'yellow', 10), t('disc', 'blue', 13)]
    },
    state: {
      gosterge,
      okeyTarget,
      openThreshold: 101,
      pairThreshold: 5,
      tableMelds: [],
      seats: [{ seatIndex: 0, opened: true, openMode: 'pairs' }],
      pickedDiscardTileId: null,
      pickedDiscardFromSeat: null,
      options: { katlamali: false }
    }
  });
  const layAct = layActions.find((a) => a.type === 'layMeld');
  assert.ok(layAct);
  assert.deepEqual(layAct.tileIds, ['gtwin']);
  assert.equal(layActions.find((a) => a.type === 'discardTile')?.tileId, 'disc');
});



