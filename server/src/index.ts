import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { ROOM_NAME } from '@kahvehane/shared';
import { createGameServer } from './app';
import { AvatarStore } from './avatarStore';
import { createHttpApp } from './http';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 2567);
const clientDist = path.resolve(here, '../../client/dist');
// Uploaded avatars live outside the repo checkout so updates (git reset) never touch them.
const avatarDir = process.env.AVATAR_DIR ?? path.resolve(here, '../../../kahvehane-avatars');

const store = new AvatarStore(avatarDir);
const httpServer = http.createServer(createHttpApp({ store, clientDist }));
const gameServer = createGameServer({ avatarExists: (h) => store.has(h) }, httpServer);
await gameServer.listen(port);
// One shared salon that always exists; clients only `join` it (a full salon must not spawn a second one).
await matchMaker.createRoom(ROOM_NAME, {});
console.log(`Kahvehane sunucusu: http://localhost:${port} · avatarlar: ${avatarDir}`);
