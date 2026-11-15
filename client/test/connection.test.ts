import { expect, test } from 'vitest';
import { connect, offlineSession } from '../src/net/connection';

test('connect falls back to offline when server unreachable', async () => {
  const client = { join: () => new Promise(() => {}) };
  const t0 = Date.now();
  const r = await connect({ url: 'ws://x', name: 'Ayşe', look: 'kum', timeoutMs: 200 }, { client });
  expect(r).toEqual({ error: 'offline' });
  expect(Date.now() - t0).toBeLessThan(1000);
});

test('connect reports full and name errors', async () => {
  const fail = (msg: string) => ({ join: () => Promise.reject(new Error(msg)) });
  expect(await connect({ url: 'ws://x', name: '', look: 'kum' }, { client: fail('İsim gerekli') })).toEqual({ error: 'name' });
  expect(await connect({ url: 'ws://x', name: 'A', look: 'kum' }, { client: fail('no rooms found with provided criteria') })).toEqual({ error: 'full' });
  expect(await connect({ url: 'ws://x', name: 'A', look: 'kum' }, { client: fail('ECONNREFUSED') })).toEqual({ error: 'offline' });
});

test('offline session is inert', () => {
  const s = offlineSession();
  expect(s.online).toBe(false);
  expect(s.players().size).toBe(0);
  expect(s.cat()).toBeNull();
  expect(() => s.chat('x')).not.toThrow();
});

function fakeRoom() {
  const handlers: Record<string, (m: unknown) => void> = {};
  let leaveCb: ((code: number) => void) | null = null;
  const room = {
    sessionId: 's1',
    state: {},
    left: false,
    send() {},
    onMessage(type: string, cb: (m: unknown) => void) {
      handlers[type] = cb;
    },
    onLeave(cb: (code: number) => void) {
      leaveCb = cb;
    },
    leave() {
      room.left = true;
    },
    drop: (code = 4010) => leaveCb?.(code)
  };
  return room;
}

test('a lost connection is reported and the session goes offline', async () => {
  const room = fakeRoom();
  const s = await connect({ url: 'ws://x', name: 'A', look: 'kum' }, { client: { join: async () => room } });
  if ('error' in s) throw new Error('expected a session');
  let lost = 0;
  s.onLost(() => lost++);
  expect(s.online).toBe(true);
  room.drop();
  expect(lost).toBe(1);
  expect(s.online).toBe(false);
});

test('a join that completes after the timeout is left, not kept as a ghost', async () => {
  const room = fakeRoom();
  let resolveJoin: (r: unknown) => void = () => {};
  const client = { join: () => new Promise((r) => (resolveJoin = r)) };
  const r = await connect({ url: 'ws://x', name: 'A', look: 'kum', timeoutMs: 50 }, { client });
  expect(r).toEqual({ error: 'offline' });
  resolveJoin(room);
  await new Promise((res) => setTimeout(res, 10));
  expect(room.left).toBe(true);
});
