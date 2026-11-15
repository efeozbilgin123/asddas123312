import { Client } from '@colyseus/sdk';
import {
  JOIN_ERROR_NAME, ROOM_NAME,
  type ChatBroadcast, type CorrectMsg, type DeniedMsg, type EmoteBroadcast, type MoveMsg
} from '@kahvehane/shared';

export interface RemotePlayer {
  id: string;
  name: string;
  look: string;
  avatar: string;
  x: number;
  z: number;
  facing: number;
  speed: number;
  seatId: string;
  away: boolean;
}

export interface CatView { x: number; z: number; facing: number; action: string }

export interface Session {
  online: boolean;
  selfId: string;
  /** Includes self. */
  players(): ReadonlyMap<string, RemotePlayer>;
  cat(): CatView | null;
  onChat(cb: (m: ChatBroadcast) => void): void;
  onEmote(cb: (m: EmoteBroadcast) => void): void;
  onCorrect(cb: (p: CorrectMsg) => void): void;
  onDenied(cb: (reason: DeniedMsg['reason']) => void): void;
  /** The server connection is gone for good (SDK reconnection gave up, or the server removed us). */
  onLost(cb: () => void): void;
  sendMove(m: MoveMsg): void;
  sit(seatId: string): void;
  stand(): void;
  chat(text: string): void;
  emote(id: string): void;
  leave(): void;
}

export type ConnectError = { error: 'full' | 'name' | 'offline' };

interface JoinableClient {
  join(name: string, options: object): Promise<unknown>;
}

/** HTTP(S) base of the game server (for avatar uploads/downloads). */
export function serverHttpUrl(): string {
  return defaultServerUrl().replace(/^ws/, 'http');
}

/** The server URL: ?server=… or the page's own origin. */
export function defaultServerUrl(): string {
  const param = new URLSearchParams(location.search).get('server');
  if (param) return param;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
}

export function offlineSession(): Session {
  const empty = new Map<string, RemotePlayer>();
  const noop = () => {};
  return {
    online: false,
    selfId: 'offline',
    players: () => empty,
    cat: () => null,
    onChat: noop,
    onEmote: noop,
    onCorrect: noop,
    onDenied: noop,
    onLost: noop,
    sendMove: noop,
    sit: noop,
    stand: noop,
    chat: noop,
    emote: noop,
    leave: noop
  };
}

interface SdkRoom {
  sessionId: string;
  state: {
    players?: { forEach(cb: (p: Omit<RemotePlayer, 'id'>, id: string) => void): void };
    cat?: CatView;
  };
  send(type: string, msg?: unknown): void;
  onMessage(type: string, cb: (msg: never) => void): void;
  onLeave?(cb: (code: number) => void): void;
  leave(consented?: boolean): unknown;
}

function wrap(room: SdkRoom): Session {
  let online = true;
  let leaving = false;
  const lost: Array<() => void> = [];
  room.onLeave?.(() => {
    if (leaving || !online) return;
    online = false;
    lost.forEach((cb) => cb());
  });
  return {
    get online() {
      return online;
    },
    selfId: room.sessionId,
    players() {
      const out = new Map<string, RemotePlayer>();
      room.state.players?.forEach((p, id) =>
        out.set(id, { id, name: p.name, look: p.look, avatar: p.avatar ?? 'mannequin', x: p.x, z: p.z, facing: p.facing, speed: p.speed, seatId: p.seatId, away: p.away })
      );
      return out;
    },
    cat: () => (room.state.cat ? { ...room.state.cat } : null),
    onChat: (cb) => room.onMessage('chat', cb as (m: never) => void),
    onEmote: (cb) => room.onMessage('emote', cb as (m: never) => void),
    onCorrect: (cb) => room.onMessage('correct', cb as (m: never) => void),
    onDenied: (cb) => room.onMessage('denied', ((m: DeniedMsg) => cb(m.reason)) as (m: never) => void),
    onLost: (cb) => void lost.push(cb),
    sendMove: (m) => room.send('move', m),
    sit: (seatId) => room.send('sit', { seatId }),
    stand: () => room.send('stand', {}),
    chat: (text) => room.send('chat', { text }),
    emote: (id) => room.send('emote', { id }),
    leave: () => {
      leaving = true;
      void room.leave(true);
    }
  };
}

export async function connect(
  opts: { url: string; name: string; look: string; avatar?: string; timeoutMs?: number },
  deps: { client?: JoinableClient } = {}
): Promise<Session | ConnectError> {
  const client: JoinableClient = deps.client ?? (new Client(opts.url) as unknown as JoinableClient);
  const timeout = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), opts.timeoutMs ?? 4000));
  const joining = client.join(ROOM_NAME, { name: opts.name, look: opts.look, avatar: opts.avatar ?? 'mannequin' });
  try {
    const result = await Promise.race([joining, timeout]);
    if (result === 'timeout') {
      // a join that still completes later must not leave a ghost player holding a slot
      joining.then((r) => (r as SdkRoom).leave(true)).catch(() => {});
      return { error: 'offline' };
    }
    const room = result as SdkRoom;
    // swallow unhandled message types so the SDK doesn't warn
    for (const t of ['chat', 'emote', 'correct', 'denied']) room.onMessage(t, () => {});
    return wrap(room);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes(JOIN_ERROR_NAME)) return { error: 'name' };
    if (/no rooms found|locked|full/i.test(msg)) return { error: 'full' };
    return { error: 'offline' };
  }
}
