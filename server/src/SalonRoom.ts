import { Room, type Client } from '@colyseus/core';
import {
  CAT_SPOTS, COLLIDERS, EMOTES, JOIN_ERROR_NAME, LOOKS, MAX_PLAYERS, MoveBudget, RateLimiter, SEATS, SIT_RADIUS, SPAWN,
  catStep, initialCat, sanitizeAvatar, sanitizeChat, sanitizeName, seatReach, standUp, validateMove,
  type CatState, type ChatMsg, type EmoteMsg, type JoinOptions, type MoveMsg, type SitMsg
} from '@kahvehane/shared';
import { CatSchema, PlayerState, SalonState } from './schema';

export interface SalonOptions {
  /** Seconds a dropped client may take to reconnect (0 in tests). */
  reconnectSeconds?: number;
  /** Whether an uploaded avatar with this sha256 exists. */
  avatarExists?: (hash: string) => boolean;
}

/** Client offers Sit within SIT_RADIUS; allow a little for positions still in flight. */
const SIT_TOLERANCE = 0.3;
const CAT_TICK_MS = 100;

interface Track {
  x: number;
  z: number;
  budget: MoveBudget;
  limiter: RateLimiter;
}

export class SalonRoom extends Room<{ state: SalonState }> {
  maxClients = MAX_PLAYERS;
  autoDispose = false;
  /** Seconds a dropped client may take to reconnect. */
  reconnectSeconds = 10;
  private readonly tracks = new Map<string, Track>();
  private cat: CatState = initialCat(CAT_SPOTS, Math.random);
  private joined = 0;

  private avatarExists: (hash: string) => boolean = () => false;

  onCreate(options: SalonOptions = {}): void {
    this.reconnectSeconds = options.reconnectSeconds ?? 10;
    if (options.avatarExists) this.avatarExists = options.avatarExists;
    this.setState(new SalonState());
    this.state.cat = new CatSchema();
    this.writeCat();
    this.setSimulationInterval((dt) => this.tickCat(dt / 1000), CAT_TICK_MS);

    this.onMessage('move', (client, msg: MoveMsg) => this.onMove(client, msg));
    this.onMessage('sit', (client, msg: SitMsg) => this.onSit(client, msg));
    this.onMessage('stand', (client) => this.onStand(client));
    this.onMessage('chat', (client, msg: ChatMsg) => this.onChat(client, msg));
    this.onMessage('emote', (client, msg: EmoteMsg) => this.onEmote(client, msg));
    this.onMessage('avatar', (client, msg: { id?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.avatar = sanitizeAvatar(msg?.id, this.avatarExists);
    });
  }

  onJoin(client: Client, options: Partial<JoinOptions> = {}): void {
    const name = sanitizeName(options.name);
    if (!name) throw new Error(JOIN_ERROR_NAME);
    const look = LOOKS.some((l) => l.id === options.look) ? options.look! : LOOKS[0].id;
    const p = new PlayerState();
    p.name = name;
    p.look = look;
    p.avatar = sanitizeAvatar(options.avatar, this.avatarExists);
    p.x = SPAWN[0] + ((this.joined++ % 5) - 2) * 0.6;
    p.z = SPAWN[2];
    p.facing = Math.PI;
    p.speed = 0;
    this.state.players.set(client.sessionId, p);
    this.tracks.set(client.sessionId, { x: p.x, z: p.z, budget: new MoveBudget(Date.now()), limiter: new RateLimiter(3, 2000) });
  }

  async onDrop(client: Client): Promise<void> {
    const p = this.state.players.get(client.sessionId);
    if (!p || this.reconnectSeconds <= 0) return;
    p.away = true;
    try {
      await this.allowReconnection(client, this.reconnectSeconds);
    } catch {
      /* timed out: onLeave removes the player */
    }
  }

  onReconnect(client: Client): void {
    const p = this.state.players.get(client.sessionId);
    if (p) p.away = false;
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.tracks.delete(client.sessionId);
  }

  // ---------- handlers ----------
  private onMove(client: Client, msg: MoveMsg): void {
    const p = this.state.players.get(client.sessionId);
    const t = this.tracks.get(client.sessionId);
    if (!p || !t || p.seatId) return;
    const ok =
      msg && typeof msg === 'object' && validateMove(t, msg, COLLIDERS) && t.budget.spend(Math.hypot(msg.x - t.x, msg.z - t.z), Date.now());
    if (!ok) {
      client.send('correct', { x: t.x, z: t.z });
      return;
    }
    p.x = t.x = msg.x;
    p.z = t.z = msg.z;
    p.facing = msg.facing;
    p.speed = Math.max(0, Math.min(msg.speed, 3.2));
  }

  private onSit(client: Client, msg: SitMsg): void {
    const p = this.state.players.get(client.sessionId);
    const seat = SEATS.find((s) => s.id === msg?.seatId);
    if (!p || !seat || p.seatId) return;
    if (seatReach(p, seat) > SIT_RADIUS + SIT_TOLERANCE) {
      client.send('denied', { reason: 'too-far' });
      return;
    }
    const taken = [...this.state.players.values()].some((o) => o.seatId === seat.id);
    if (taken) {
      client.send('denied', { reason: 'seat-taken' });
      return;
    }
    p.seatId = seat.id;
    p.x = seat.pos[0];
    p.z = seat.pos[2];
    p.facing = seat.facingY;
    p.speed = 0;
  }

  private onStand(client: Client): void {
    const p = this.state.players.get(client.sessionId);
    const t = this.tracks.get(client.sessionId);
    const seat = SEATS.find((s) => s.id === p?.seatId);
    if (!p || !t || !seat) return;
    const s = standUp({ x: p.x, z: p.z, facing: p.facing, speed: 0, mode: 'sit', seatId: seat.id }, seat, COLLIDERS);
    p.seatId = '';
    p.x = t.x = s.x;
    p.z = t.z = s.z;
  }

  private onChat(client: Client, msg: ChatMsg): void {
    const p = this.state.players.get(client.sessionId);
    const t = this.tracks.get(client.sessionId);
    if (!p || !t) return;
    const text = sanitizeChat(msg?.text);
    if (!text) return;
    if (!t.limiter.allow(Date.now())) {
      client.send('denied', { reason: 'rate-limit' });
      return;
    }
    this.broadcast('chat', { from: client.sessionId, name: p.name, text, at: Date.now() });
  }

  private onEmote(client: Client, msg: EmoteMsg): void {
    const t = this.tracks.get(client.sessionId);
    if (!t || !EMOTES.some((e) => e.id === msg?.id)) return;
    if (!t.limiter.allow(Date.now())) {
      client.send('denied', { reason: 'rate-limit' });
      return;
    }
    this.broadcast('emote', { from: client.sessionId, id: msg.id });
  }

  // ---------- cat ----------
  private tickCat(dt: number): void {
    let nearest = { x: 999, z: 999 };
    let best = Infinity;
    for (const p of this.state.players.values()) {
      const d = Math.hypot(p.x - this.cat.x, p.z - this.cat.z);
      if (d < best) {
        best = d;
        nearest = { x: p.x, z: p.z };
      }
    }
    this.cat = catStep(this.cat, dt, { spots: CAT_SPOTS, avatar: nearest, rng: Math.random });
    this.writeCat();
  }

  private writeCat(): void {
    const c = this.state.cat;
    c.x = this.cat.x;
    c.z = this.cat.z;
    c.facing = this.cat.facing;
    c.action = this.cat.action;
  }
}
