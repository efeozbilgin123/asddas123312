import test from 'node:test';
import assert from 'node:assert/strict';
import { BilliardSession, BILLIARD_TABLE, getBallGroup } from '../shared/billiardSession.js';

test('BilliardSession initializes 16 balls in valid 8-ball rack with 8-ball centered in row 3', () => {
  const b = new BilliardSession();
  assert.equal(b.phase, 'waiting');
  assert.equal(b.balls.length, 16);

  const ids = new Set(b.balls.map((ball) => ball.id));
  assert.equal(ids.size, 16);

  const cue = b.balls.find((ball) => ball.id === 0);
  assert.equal(cue.x, 0);
  assert.equal(cue.z, 1.75);
  assert.equal(cue.pocketed, false);

  const eight = b.balls.find((ball) => ball.id === 8);
  assert.equal(eight.x, 0);
  assert.ok(eight.z < -1.75);

  assert.equal(getBallGroup(0), 'cue');
  assert.equal(getBallGroup(8), 'eight');
  assert.equal(getBallGroup(3), 'solids');
  assert.equal(getBallGroup(12), 'stripes');
});

test('BilliardSession handles sitHuman, toggleBotSeat, standHuman, and startMatch', (ctx) => {
  const b = new BilliardSession();
  ctx.after(() => b.destroy());

  // Cannot start with 0 players
  assert.equal(b.startMatch({ autoFillBot: true }).ok, false);

  // Sit 1 human and start with autoFillBot = false -> fails
  const s1 = b.sitHuman({ playerId: 'p1', playerName: 'Efe', seatIndex: 0 });
  assert.equal(s1.ok, true);
  assert.equal(s1.seatIndex, 0);
  assert.equal(b.startMatch({ autoFillBot: false }).ok, false);

  // Toggle bot on seat 1 -> add & remove
  assert.equal(b.toggleBotSeat(1).ok, true);
  assert.equal(b.seats[1].type, 'bot');
  assert.equal(b.toggleBotSeat(1).ok, true);
  assert.equal(b.seats[1].type, 'empty');

  // Cannot add bot on human seat
  assert.equal(b.toggleBotSeat(0).ok, false);

  // Sit second human
  const s2 = b.sitHuman({ playerId: 'p2', playerName: 'Arhan', seatIndex: 1 });
  assert.equal(s2.ok, true);

  // Start match -> playing
  const st = b.startMatch({ autoFillBot: false });
  assert.equal(st.ok, true);
  assert.equal(b.phase, 'playing');
  assert.equal(b.currentSeat, 0);
  assert.equal(b.isBreakShot, true);

  // Cannot toggle bot while playing
  assert.equal(b.toggleBotSeat(1).ok, false);

  // standHuman while other human is seated converts seat to bot cleanly
  const stand1 = b.standHuman('p1', { convertToBotIfActive: true });
  assert.equal(stand1.ok, true);
  assert.equal(b.seats[0].type, 'bot');
  assert.equal(b.phase, 'playing');

  // Remaining human stands up -> returns to waiting cleanly
  const stand2 = b.standHuman('p2', { convertToBotIfActive: true });
  assert.equal(stand2.ok, true);
  assert.equal(b.seats[1].type, 'empty');
  assert.equal(b.phase, 'waiting');
});

test('BilliardSession physics simulates break shot, clears isBreakShot, and detects no-hit foul + ballInHand placement', (ctx) => {
  const b = new BilliardSession();
  ctx.after(() => b.destroy());

  b.sitHuman({ playerId: 'p1', playerName: 'Efe', seatIndex: 0 });
  b.sitHuman({ playerId: 'p2', playerName: 'Arhan', seatIndex: 1 });
  assert.equal(b.startMatch({ autoFillBot: false }).ok, true);

  // Break straight at apex ball
  const breakRes = b.shoot('p1', { angle: -Math.PI / 2, power: 0.9 });
  assert.equal(breakRes.ok, true);
  assert.ok(breakRes.shot.frames.length > 2);
  assert.equal(b.isBreakShot, false);
  assert.ok(breakRes.shot.events.some((ev) => ev.kind === 'ball'));

  // Force a clear no-hit foul by moving balls away and aiming at empty cushion
  b.shotBusyUntil = 0;
  b.currentSeat = 0;
  b.ballInHand = false;
  for (const ball of b.balls) {
    if (ball.id !== 0) {
      ball.pocketed = true;
    }
  }
  const b1 = b.balls.find((ball) => ball.id === 1);
  b1.pocketed = false;
  b1.x = -1.2;
  b1.z = -2.5;
  const b8 = b.balls.find((ball) => ball.id === 8);
  b8.pocketed = false;
  b8.x = 1.2;
  b8.z = -2.5;

  const cue = b.balls.find((ball) => ball.id === 0);
  cue.pocketed = false;
  cue.x = 0.2;
  cue.z = 1.8;

  // Shoot gently sideways away from all balls -> no-hit foul -> ballInHand for p2
  const missRes = b.shoot('p1', { angle: 0, power: 0.15 });
  assert.equal(missRes.ok, true);
  assert.equal(b.currentSeat, 1);
  assert.equal(b.ballInHand, true);

  // Non-turn player cannot place cue ball
  assert.equal(b.placeCueBall('p1', { x: 0, z: 0 }).ok, false);

  // Turn player places cue ball safely
  b.shotBusyUntil = 0;
  const placeRes = b.placeCueBall('p2', { x: 0.35, z: 0.5 });
  assert.equal(placeRes.ok, true);
  assert.ok(Math.abs(cue.x - 0.35) < 0.05);
  assert.ok(Math.abs(cue.z - 0.5) < 0.05);

  // Wrong turn aim & shoot rejected
  assert.equal(b.updateAim('p1', { angle: 0, power: 0.5 }).ok, false);
  assert.equal(b.updateAim('p2', { angle: 0, power: 0.5 }).ok, true);
  assert.equal(b.shoot('p1', { angle: 0, power: 0.5 }).ok, false);
});

test('BilliardSession assigns groups on legal pocket, loses on early 8-ball, and wins on legal 8-ball pocket', (ctx) => {
  const b = new BilliardSession();
  ctx.after(() => b.destroy());

  b.sitHuman({ playerId: 'p1', playerName: 'Efe', seatIndex: 0 });
  b.sitHuman({ playerId: 'p2', playerName: 'Arhan', seatIndex: 1 });
  b.startMatch({ autoFillBot: false });

  // Skip break
  b.isBreakShot = false;
  b.shotBusyUntil = 0;
  b.currentSeat = 0;

  // Sink solid #1 into top-left corner pocket (-1.72, -3.47)
  const cue = b.balls.find((ball) => ball.id === 0);
  const solid1 = b.balls.find((ball) => ball.id === 1);
  for (const ball of b.balls) {
    if (![0, 1, 8, 9].includes(ball.id)) ball.pocketed = true;
  }
  cue.pocketed = false;
  cue.x = -1.1;
  cue.z = -2.85;
  solid1.pocketed = false;
  solid1.x = -1.42;
  solid1.z = -3.17;
  const stripe9 = b.balls.find((ball) => ball.id === 9);
  stripe9.pocketed = false;
  stripe9.x = 0.6;
  stripe9.z = 0.6;
  const eight = b.balls.find((ball) => ball.id === 8);
  eight.pocketed = false;
  eight.x = 1.0;
  eight.z = -2.2;

  const angleToSolid = Math.atan2(solid1.z - cue.z, solid1.x - cue.x);
  const makeSolid = b.shoot('p1', { angle: angleToSolid, power: 0.55 });
  assert.equal(makeSolid.ok, true);
  assert.equal(solid1.pocketed, true);
  assert.equal(b.seats[0].group, 'solids');
  assert.equal(b.seats[1].group, 'stripes');
  assert.equal(b.currentSeat, 0); // retains turn on legal make

  // All solids cleared (only 1 was left) -> p1 now legally targets 8-ball
  b.shotBusyUntil = 0;
  cue.x = 1.3;
  cue.z = -3.05;
  eight.x = 1.5;
  eight.z = -3.25;
  const angleToEight = Math.atan2(eight.z - cue.z, eight.x - cue.x);
  const winShot = b.shoot('p1', { angle: angleToEight, power: 0.5 });
  assert.equal(winShot.ok, true);
  assert.equal(eight.pocketed, true);
  assert.equal(b.phase, 'gameOver');
  assert.equal(b.winnerSeat, 0);
  assert.equal(b.wins[0], 1);

  // Start second match and pocket 8-ball early -> opponent wins
  b.startMatch({ autoFillBot: false });
  b.isBreakShot = false;
  b.shotBusyUntil = 0;
  const cue2 = b.balls.find((ball) => ball.id === 0);
  const eight2 = b.balls.find((ball) => ball.id === 8);
  for (const ball of b.balls) {
    if (ball.id !== 0 && ball.id !== 8 && ball.id !== 2 && ball.id !== 10) ball.pocketed = true;
  }
  b.balls.find((ball) => ball.id === 2).x = -1.2;
  b.balls.find((ball) => ball.id === 2).z = 2.0;
  b.balls.find((ball) => ball.id === 10).x = 1.2;
  b.balls.find((ball) => ball.id === 10).z = 2.0;
  cue2.x = 1.25;
  cue2.z = -3.0;
  eight2.x = 1.5;
  eight2.z = -3.25;
  const earlyShot = b.shoot('p1', { angle: Math.atan2(eight2.z - cue2.z, eight2.x - cue2.x), power: 0.5 });
  assert.equal(earlyShot.ok, true);
  assert.equal(b.phase, 'gameOver');
  assert.equal(b.winnerSeat, 1);
  assert.ok(BILLIARD_TABLE.halfL > BILLIARD_TABLE.halfW);
});
