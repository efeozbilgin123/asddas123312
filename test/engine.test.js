import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, computeOkeyTarget, isOkeyTile } from '../shared/tiles.js';
import {
  validateSet,
  validateRun,
  validateGroup,
  validatePair,
  canLayoffTile,
  findBestOpening
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

test('validateRun supports 12-13-1 wraparound and Sahte Okey', () => {
  const okeyTarget = { color: 'yellow', number: 7 };
  const wrap = validateRun(
    [t('1', 'black', 12), t('2', 'black', 13), t('3', 'black', 1)],
    okeyTarget
  );
  assert.equal(wrap.valid, true);
  assert.equal(wrap.points, 26);

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
