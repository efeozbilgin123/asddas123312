import { afterAll, beforeAll, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AvatarStore } from '../src/avatarStore';
import { createHttpApp } from '../src/http';

let dir: string;
let server: http.Server;
let base: string;
let store: AvatarStore;

const vrm = (size = 2048) => {
  const b = Buffer.alloc(size, 7);
  b.write('glTF', 0, 'ascii');
  return b;
};
const upload = (body: Buffer, ip = '1.1.1.1') =>
  fetch(`${base}/avatars`, { method: 'POST', body, headers: { 'content-type': 'application/octet-stream', 'x-forwarded-for': ip } });

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'kh-avatars-'));
  store = new AvatarStore(dir, { maxFiles: 3 });
  server = http.createServer(createHttpApp({ store, clientDist: dir, uploadLimit: { max: 5, windowMs: 600_000 } }));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

test('a valid VRM upload returns its content id and can be fetched back', async () => {
  const body = vrm();
  const res = await upload(body, '10.0.0.1');
  expect(res.status).toBe(200);
  const { id } = (await res.json()) as { id: string };
  expect(id).toMatch(/^custom:[0-9a-f]{64}$/);
  const got = await fetch(`${base}/avatars/${id.slice(7)}.vrm`);
  expect(got.status).toBe(200);
  expect(got.headers.get('x-content-type-options')).toBe('nosniff');
  expect(got.headers.get('content-type')).toContain('application/octet-stream');
  expect(Buffer.from(await got.arrayBuffer()).equals(body)).toBe(true);
  expect(store.has(id.slice(7))).toBe(true);
});

test('a file that is not glTF binary is rejected', async () => {
  const res = await upload(Buffer.from('<html><script>alert(1)</script></html>'), '10.0.0.2');
  expect(res.status).toBe(400);
});

test('a file over 30 MB is rejected', async () => {
  const res = await upload(vrm(31 * 1024 * 1024), '10.0.0.3');
  expect(res.status).toBe(413);
});

test('more than 5 uploads in 10 minutes from one address are refused', async () => {
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await upload(vrm(2048 + i), '10.0.0.4')).status);
  expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
  expect(codes[5]).toBe(429);
});

test('the store keeps at most maxFiles uploads (oldest evicted)', () => {
  expect(store.count()).toBeLessThanOrEqual(3);
});

test('unknown or malformed avatar paths are 404', async () => {
  expect((await fetch(`${base}/avatars/${'d'.repeat(64)}.vrm`)).status).toBe(404);
  expect((await fetch(`${base}/avatars/..%2F..%2Fetc%2Fpasswd.vrm`)).status).toBe(404);
});

test('health still answers', async () => {
  expect((await fetch(`${base}/health`)).status).toBe(200);
});
