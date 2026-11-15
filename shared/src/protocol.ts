import { overlapsAny } from './collision';
import { AVATAR_RADIUS, RUN_SPEED } from './controller';
import { ROOM, type Box2 } from './layout';

export const MAX_PLAYERS = 15;
export const ROOM_NAME = 'salon';

export const LOOKS = [
  { id: 'kiremit', label: 'Kiremit', color: '#c0583c' },
  { id: 'zeytin', label: 'Zeytin', color: '#6b7a3a' },
  { id: 'lacivert', label: 'Lacivert', color: '#2c3e66' },
  { id: 'hardal', label: 'Hardal', color: '#c9962e' },
  { id: 'murdum', label: 'Mürdüm', color: '#6a2c4f' },
  { id: 'kum', label: 'Kum', color: '#cdb38a' }
] as const satisfies readonly { id: string; label: string; color: string }[];

export const EMOTES = [
  { id: 'selam', emoji: '👋', label: 'Selam' },
  { id: 'kahkaha', emoji: '😂', label: 'Kahkaha' },
  { id: 'cay', emoji: '☕', label: 'Çay' },
  { id: 'tamam', emoji: '👍', label: 'Tamam' },
  { id: 'kalp', emoji: '❤️', label: 'Kalp' },
  { id: 'alkis', emoji: '👏', label: 'Alkış' }
] as const satisfies readonly { id: string; emoji: string; label: string }[];

/** Bundled avatars: two permissively licensed anime VRMs and the tinted mannequin. */
export const BUILTIN_AVATARS = ['twist', 'seed', 'mannequin'] as const;
export type BuiltinAvatar = (typeof BUILTIN_AVATARS)[number];
const CUSTOM_AVATAR = /^custom:([0-9a-f]{64})$/;

/** A valid avatar id: a builtin, or `custom:<sha256>` of an upload the server actually has. */
export function sanitizeAvatar(raw: unknown, exists: (hash: string) => boolean): string {
  if (typeof raw !== 'string') return 'mannequin';
  if ((BUILTIN_AVATARS as readonly string[]).includes(raw)) return raw;
  const m = CUSTOM_AVATAR.exec(raw);
  return m && exists(m[1]!) ? raw : 'mannequin';
}

// ---- messages ----
export interface JoinOptions { name: string; look: string; avatar?: string }
export interface MoveMsg { x: number; z: number; facing: number; speed: number }
export interface SitMsg { seatId: string }
export interface ChatMsg { text: string }
export interface EmoteMsg { id: string }
export interface ChatBroadcast { from: string; name: string; text: string; at: number }
export interface EmoteBroadcast { from: string; id: string }
export interface CorrectMsg { x: number; z: number }
export interface DeniedMsg { reason: 'seat-taken' | 'too-far' | 'rate-limit' }

/** Server rejection texts; the client maps them back to error kinds. */
export const JOIN_ERROR_NAME = 'İsim gerekli';

// ---- sanitizing ----
function clean(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw
    .replace(/[\u0000-\u001f\u007f<>]/g, (c) => (c === '\n' || c === '\t' ? ' ' : ''))
    .replace(/\s+/g, ' ')
    .trim();
  const cut = Array.from(s).slice(0, max).join('').trim();
  return cut.length > 0 ? cut : null;
}

export const sanitizeName = (raw: unknown): string | null => clean(raw, 20);
export const sanitizeChat = (raw: unknown): string | null => clean(raw, 200);

// ---- move validation ----
const SWEEP_STEP = 0.1;

/**
 * Shape and geometry check for a move: finite numbers, inside the room, and the straight path from
 * `prev` to `next` never passes through furniture. Speed is checked separately by MoveBudget.
 */
export function validateMove(prev: { x: number; z: number }, next: MoveMsg, boxes: readonly Box2[]): boolean {
  if (![next.x, next.z, next.facing, next.speed].every(Number.isFinite)) return false;
  if (Math.abs(next.x) > ROOM.width / 2 || Math.abs(next.z) > ROOM.depth / 2) return false;
  const dist = Math.hypot(next.x - prev.x, next.z - prev.z);
  const steps = Math.max(1, Math.ceil(dist / SWEEP_STEP));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = { x: prev.x + (next.x - prev.x) * t, z: prev.z + (next.z - prev.z) * t };
    if (overlapsAny(p, AVATAR_RADIUS - 0.02, boxes)) return false;
  }
  return true;
}

/** Allowed speed: run speed × 1.5. */
export const MOVE_RATE = RUN_SPEED * 1.5;
/** Short burst allowance (network stalls deliver queued moves together). */
export const MOVE_BURST = 1.5;

/** Token bucket of metres a player may move; refills at MOVE_RATE up to MOVE_BURST. */
export class MoveBudget {
  private tokens = MOVE_BURST;
  constructor(private last: number) {}

  spend(dist: number, nowMs: number): boolean {
    this.tokens = Math.min(MOVE_BURST, this.tokens + (MOVE_RATE * Math.max(0, nowMs - this.last)) / 1000);
    this.last = Math.max(this.last, nowMs);
    if (!(dist <= this.tokens)) return false;
    this.tokens -= dist;
    return true;
  }
}

// ---- rate limiting ----
export class RateLimiter {
  private readonly hits: number[] = [];
  constructor(private readonly max: number, private readonly windowMs: number) {}

  allow(nowMs: number): boolean {
    while (this.hits.length > 0 && nowMs - this.hits[0]! >= this.windowMs) this.hits.shift();
    if (this.hits.length >= this.max) return false;
    this.hits.push(nowMs);
    return true;
  }
}
