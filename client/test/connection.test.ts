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
