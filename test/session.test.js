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
