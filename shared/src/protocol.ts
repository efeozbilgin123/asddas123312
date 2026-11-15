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

// ---- messages ----
export interface JoinOptions { name: string; look: string }
export interface MoveMsg { x: number; z: number; facing: number; speed: number }
export interface SitMsg { seatId: string }
export interface ChatMsg { text: string }
export interface EmoteMsg { id: string }
export interface ChatBroadcast { from: string; name: string; text: string; at: number }
export interface EmoteBroadcast { from: string; id: string }
export interface CorrectMsg { x: number; z: number }
export interface DeniedMsg { reason: 'seat-taken' | 'rate-limit' }

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
const SPEED_FACTOR = 1.5;
const SLACK = 0.5;

export function validateMove(prev: { x: number; z: number }, next: MoveMsg, elapsedSec: number, boxes: readonly Box2[]): boolean {
  if (![next.x, next.z, next.facing, next.speed].every(Number.isFinite)) return false;
  if (Math.abs(next.x) > ROOM.width / 2 || Math.abs(next.z) > ROOM.depth / 2) return false;
  const dist = Math.hypot(next.x - prev.x, next.z - prev.z);
  const budget = RUN_SPEED * SPEED_FACTOR * Math.max(0, elapsedSec);
  // Slack absorbs jitter but never more than doubles the budget, so many tiny messages can't add up.
  if (dist > budget + Math.min(SLACK, budget)) return false;
  return !overlapsAny(next, AVATAR_RADIUS - 0.02, boxes);
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
