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

