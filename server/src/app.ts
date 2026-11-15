import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@kahvehane/shared';
import type http from 'node:http';
import { SalonRoom, type SalonOptions } from './SalonRoom';

/** Colyseus server with the salon room; attach to an existing HTTP server in production. */
export function createGameServer(options: SalonOptions = {}, httpServer?: http.Server): Server {
  const server = new Server({ transport: new WebSocketTransport(httpServer ? { server: httpServer } : {}) });
  server.define(ROOM_NAME, SalonRoom, options);
  return server;
}
