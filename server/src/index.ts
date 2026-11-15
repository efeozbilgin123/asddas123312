import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { ROOM_NAME } from '@kahvehane/shared';
import { createGameServer } from './app';

const port = Number(process.env.PORT ?? 2567);
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

const app = express();
app.get('/health', async (_req, res) => {
  const rooms = await matchMaker.query({ name: ROOM_NAME });
  res.json({ ok: true, players: rooms.reduce((n, r) => n + r.clients, 0) });
});
app.use(express.static(clientDist));

const httpServer = http.createServer(app);
const gameServer = createGameServer({}, httpServer);
await gameServer.listen(port);
// One shared salon that always exists; clients only `join` it (a full salon must not spawn a second one).
await matchMaker.createRoom(ROOM_NAME, {});
console.log(`Kahvehane sunucusu: http://localhost:${port}`);
