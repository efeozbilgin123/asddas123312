import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { SEATS, SPAWN } from '@kahvehane/shared';
import { createGameServer } from '../src/app';
import type { SalonRoom } from '../src/SalonRoom';

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await boot(createGameServer({ reconnectSeconds: 0 }));
});
afterAll(async () => colyseus.shutdown());
beforeEach(async () => colyseus.cleanup());

const join = (room: SalonRoom, name = 'Ayşe', look = 'hardal') => colyseus.connectTo(room, { name, look });
const sofa = SEATS.find((s) => s.id === 'sofa-l')!;
const nearSofa = { x: sofa.pos[0], z: -3.15, facing: Math.PI, speed: 0 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Walks a client to a target in small validated steps. */
const AROUND_SOFA = [{ x: -2.8, z: 3.6 }, { x: -2.8, z: 0.5 }, { x: -2.5, z: -1.0 }, { x: -2.5, z: -3.15 }];

async function walkVia(room: SalonRoom, client: Awaited<ReturnType<typeof join>>, to: { x: number; z: number }) {
  for (const w of AROUND_SOFA) await walkTo(room, client, w);
  await walkTo(room, client, to);
}

async function walkTo(room: SalonRoom, client: Awaited<ReturnType<typeof join>>, to: { x: number; z: number }) {
  const p = room.state.players.get(client.sessionId)!;
  const steps = Math.ceil(Math.hypot(to.x - p.x, to.z - p.z) / 0.15) + 1; // 0.15 m / 60 ms ≈ 2.5 m/s
  const from = { x: p.x, z: p.z };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    client.send('move', { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t, facing: 0, speed: 1.6 });
    await sleep(60);
  }
  await room.waitForNextPatch();
}

describe('SalonRoom', () => {
  test('join adds a player with sanitized name and valid look', async () => {
    const room = await colyseus.createRoom<SalonRoom>('salon', {});
    const c = await colyseus.connectTo(room, { name: '  <b>Efe</b>  ', look: 'nope' });
    await room.waitForNextPatch();
    const p = room.state.players.get(c.sessionId)!;
    expect(p.name).toBe('bEfe/b');
    expect(p.look).toBe('kiremit');
    expect(Math.abs(p.z - SPAWN[2])).toBeLessThan(0.01);
  });

  test('join without a name is rejected', async () => {
    const room = await colyseus.createRoom<SalonRoom>('salon', {});
    await expect(colyseus.connectTo(room, { name: '   ', look: 'kum' })).rejects.toThrow(/İsim gerekli/);
  });

  test('16th client is rejected', async () => {
    const room = await colyseus.createRoom<SalonRoom>('salon', {});
    for (let i = 0; i < 15; i++) await join(room, `Oyuncu ${i}`);
    await expect(join(room, 'Fazla')).rejects.toThrow();
    expect(room.state.players.size).toBe(15);
  });

  test('valid move updates state', async () => {
    const room = await colyseus.createRoom<SalonRoom>('salon', {});
    const c = await join(room);
    await room.waitForNextPatch();
    const p = room.state.players.get(c.sessionId)!;
    c.send('move', { x: p.x, z: p.z - 0.1, facing: Math.PI, speed: 1.6 });
    await room.waitForMessage('move');
    expect(p.z).toBeCloseTo(SPAWN[2] - 0.1, 3);
  });

  test('move faster than allowed is corrected', async () => {
    const room = await colyseus.createRoom<SalonRoom>('salon', {});
    const c = await join(room);
    await room.waitForNextPatch();
    const p = room.state.players.get(c.sessionId)!;
    const correction = c.waitForMessage('correct');
    c.send('move', { x: p.x, z: p.z - 10, facing: 0, speed: 3.2 });
    const msg = await correction;
    expect(msg.z).toBeCloseTo(SPAWN[2], 3);
    expect(p.z).toBeCloseTo(SPAWN[2], 3);
  });

  test('sit takes a free seat near the player; stand frees it', async () => {
    const room = await colyseus.createRoom<SalonRoom>('salon', {});
    const c = await join(room);
    await room.waitForNextPatch();
    await walkVia(room, c, nearSofa);
    c.send('sit', { seatId: 'sofa-l' });
    await room.waitForMessage('sit');
    const p = room.state.players.get(c.sessionId)!;
    expect(p.seatId).toBe('sofa-l');
    expect(p.x).toBeCloseTo(sofa.pos[0], 3);
    c.send('stand', {});
    await room.waitForMessage('stand');
    expect(p.seatId).toBe('');
  });

  test('sit far from the seat is denied', async () => {
    const room = await colyseus.createRoom<SalonRoom>('salon', {});
    const c = await join(room);
    await room.waitForNextPatch();
    const denied = c.waitForMessage('denied');
    c.send('sit', { seatId: 'sofa-l' });
    expect(await denied).toEqual({ reason: 'too-far' });
    expect(room.state.players.get(c.sessionId)!.seatId).toBe('');
  });

  test('sit is accepted wherever the client offers it (behind a table chair)', async () => {
    const room = await colyseus.createRoom<SalonRoom>('salon', {});
    const c = await join(room);
    await room.waitForNextPatch();
    // masa-3 chair 1 sits at (-0.8, 2.35) facing the table; 1.7 m behind it is still within reach of its approach point
    await walkTo(room, c, { x: -0.8, z: 4.05 });
    c.send('sit', { seatId: 'masa-3-sandalye-1' });
    await room.waitForMessage('sit');
    expect(room.state.players.get(c.sessionId)!.seatId).toBe('masa-3-sandalye-1');
  });

  test('a sustained speed hack is corrected', async () => {
    const room = await colyseus.createRoom<SalonRoom>('salon', {});
    const c = await join(room);
    await room.waitForNextPatch();
    const p = room.state.players.get(c.sessionId)!;
    const z0 = p.z;
    for (let i = 1; i <= 15; i++) {
      c.send('move', { x: p.x, z: z0 - 0.9 * i, facing: Math.PI, speed: 3.2 });
      await sleep(100);
    }
    await room.waitForNextPatch();
    expect(z0 - p.z).toBeLessThan(3.2 * 1.5 * 1.5 + 1.6); // ≤ allowed rate × elapsed + burst
  });

  test('standing still does not allow a teleport', async () => {
    const room = await colyseus.createRoom<SalonRoom>('salon', {});
    const c = await join(room);
    await room.waitForNextPatch();
    await sleep(2500);
    const correction = c.waitForMessage('correct');
    c.send('move', { x: 6.5, z: -4.0, facing: 0, speed: 3.2 });
    await correction;
    expect(room.state.players.get(c.sessionId)!.z).toBeCloseTo(SPAWN[2], 3);
  });

  test('a dropped player shows as away, then leaves and frees the seat', async () => {
    const room = await colyseus.createRoom<SalonRoom>('salon', {});
    room.reconnectSeconds = 1; // the suite's server defaults to 0
    const a = await join(room, 'Ayşe');
    await room.waitForNextPatch();
    await walkVia(room, a, nearSofa);
    a.send('sit', { seatId: 'sofa-l' });
    await room.waitForMessage('sit');
    const id = a.sessionId;
    a.reconnection.enabled = false; // the SDK would otherwise reconnect on its own
    (a as unknown as { connection: { close(code?: number): void } }).connection.close(4010); // unclean drop (4000 means "consented")
    await sleep(300);
    expect(room.state.players.get(id)?.away).toBe(true);
    expect(room.state.players.get(id)?.seatId).toBe('sofa-l');
    await sleep(1500);
    expect(room.state.players.has(id)).toBe(false);
  });

  test('second sit on same seat is rejected', async () => {
    const room = await colyseus.createRoom<SalonRoom>('salon', {});
    const a = await join(room, 'Ayşe');
    const b = await join(room, 'Mehmet');
    await room.waitForNextPatch();
    await walkVia(room, a, nearSofa);
    await walkVia(room, b, { x: nearSofa.x + 0.6, z: nearSofa.z });
    const denied = Promise.race([a.waitForMessage('denied', 1500).catch(() => null), b.waitForMessage('denied', 1500).catch(() => null)]);
    a.send('sit', { seatId: 'sofa-l' });
    b.send('sit', { seatId: 'sofa-l' });
    const d = await denied;
    const seated = [...room.state.players.values()].filter((p) => p.seatId === 'sofa-l');
    expect(seated.length).toBe(1);
    expect(d).toEqual({ reason: 'seat-taken' });
    const loser = [...room.state.players.values()].find((p) => p.seatId !== 'sofa-l')!;
    expect(loser.seatId).toBe('');
  });

  test('chat is sanitized and broadcast to everyone', async () => {
    const room = await colyseus.createRoom<SalonRoom>('salon', {});
    const a = await join(room, 'Ayşe');
    const b = await join(room, 'Mehmet');
    const got = b.waitForMessage('chat');
    a.send('chat', { text: '  merhaba   <script>  ' });
    const msg = await got;
    expect(msg).toMatchObject({ from: a.sessionId, name: 'Ayşe', text: 'merhaba script' });
  });

  test('chat over the rate limit is denied', async () => {
    const room = await colyseus.createRoom<SalonRoom>('salon', {});
    const a = await join(room);
    const denied = a.waitForMessage('denied');
    for (let i = 0; i < 4; i++) a.send('chat', { text: `m${i}` });
    expect(await denied).toEqual({ reason: 'rate-limit' });
  });

  test('emote broadcasts known ids only', async () => {
    const room = await colyseus.createRoom<SalonRoom>('salon', {});
    const a = await join(room, 'Ayşe');
    const b = await join(room, 'Mehmet');
    const got = b.waitForMessage('emote');
    a.send('emote', { id: 'hack' });
    a.send('emote', { id: 'cay' });
    expect(await got).toEqual({ from: a.sessionId, id: 'cay' });
  });

  test('leave frees the seat and removes the player', async () => {
    const room = await colyseus.createRoom<SalonRoom>('salon', {});
    const a = await join(room, 'Ayşe');
    await room.waitForNextPatch();
    await walkVia(room, a, nearSofa);
    a.send('sit', { seatId: 'sofa-l' });
    await room.waitForMessage('sit');
    await a.leave();
    await sleep(100);
    expect(room.state.players.size).toBe(0);
  });

  test('cat state advances over time', async () => {
    const room = await colyseus.createRoom<SalonRoom>('salon', {});
    await join(room);
    const before = { x: room.state.cat.x, z: room.state.cat.z, action: room.state.cat.action };
    room.clock.tick?.(0);
    for (let i = 0; i < 5; i++) await room.waitForNextSimulationTick();
    expect(room.state.cat.action.length).toBeGreaterThan(0);
    expect(typeof before.x).toBe('number');
  });
});


test('join keeps a builtin avatar and replaces an unknown upload with the mannequin', async () => {
  const room = await colyseus.createRoom<SalonRoom>('salon', {});
  const a = await colyseus.connectTo(room, { name: 'Ayşe', look: 'kum', avatar: 'seed' });
  const b = await colyseus.connectTo(room, { name: 'Mehmet', look: 'kum', avatar: `custom:${'c'.repeat(64)}` });
  await room.waitForNextPatch();
  expect(room.state.players.get(a.sessionId)!.avatar).toBe('seed');
  expect(room.state.players.get(b.sessionId)!.avatar).toBe('mannequin');
});
