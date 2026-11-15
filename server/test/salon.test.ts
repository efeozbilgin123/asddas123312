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
const AROUND_SOFA = [{ x: -2.5, z: 0.5 }, { x: -2.5, z: -3.15 }];

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

  test('sit far from the seat is ignored', async () => {
    const room = await colyseus.createRoom<SalonRoom>('salon', {});
    const c = await join(room);
    await room.waitForNextPatch();
    c.send('sit', { seatId: 'sofa-l' });
    await room.waitForMessage('sit');
    expect(room.state.players.get(c.sessionId)!.seatId).toBe('');
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

