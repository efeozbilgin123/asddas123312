import * as THREE from 'three';
import { SEAT_POSE, SEATS, type AvatarState } from '@kahvehane/shared';
import type { AvatarLike } from '../avatar/avatar';
import type { RemotePlayer, Session } from './connection';
import { SnapshotBuffer } from './interpolation';

const TAG_HEIGHT = 0.28;

/** A text sprite (name tags, chat bubbles). Height in meters; width follows the text. */
export function textSprite(text: string, opts: { height?: number; bg?: string; fg?: string; font?: number } = {}): THREE.Sprite {
  const font = opts.font ?? 44;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = `600 ${font}px system-ui, sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + font;
  c.width = w;
  c.height = Math.ceil(font * 1.6);
  g.font = `600 ${font}px system-ui, sans-serif`;
  g.fillStyle = opts.bg ?? 'rgba(29,20,14,0.82)';
  const r = c.height / 2;
  g.beginPath();
  g.roundRect(0, 0, c.width, c.height, r);
  g.fill();
  g.fillStyle = opts.fg ?? '#f3e6d3';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  const h = opts.height ?? TAG_HEIGHT;
  sprite.scale.set((h * c.width) / c.height, h, 1);
  sprite.renderOrder = 10;
  return sprite;
}

interface Entry {
  view: AvatarLike;
  buffer: SnapshotBuffer;
  tag: THREE.Sprite;
  tagText: string;
  bubble: { sprite: THREE.Sprite; until: number } | null;
  last: string;
}

/** Views for every other player in the session: interpolated movement, seats, name tags. */
export class RemotePlayers {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly avatars: { mannequin(look: string): AvatarLike | null; vrm(id: string): Promise<AvatarLike | null> }
  ) {}

  /** Ids that currently occupy a seat (other players only). */
  occupiedSeats(session: Session): Set<string> {
    const out = new Set<string>();
    for (const p of session.players().values()) if (p.id !== session.selfId && p.seatId) out.add(p.seatId);
    return out;
  }

  update(session: Session, nowMs: number, dt: number): void {
    const players = session.players();
    for (const [id, e] of this.entries) {
      if (!players.has(id) || id === session.selfId) this.remove(id, e);
    }
    for (const p of players.values()) {
      if (p.id === session.selfId) continue;
      let e = this.entries.get(p.id);
      if (!e) {
        const view = this.avatars.mannequin(p.look); // shown until the VRM (if any) is ready
        if (!view) continue;
        const entry: Entry = { view, buffer: new SnapshotBuffer(), tag: this.tag(p), tagText: tagText(p), bubble: null, last: '' };
        e = entry;
        this.scene.add(e.tag);
        this.entries.set(p.id, e);
        if (p.avatar !== 'mannequin') {
          void this.avatars.vrm(p.avatar).then((v) => {
            if (!v) return; // load failed: keep the mannequin
            if (this.entries.get(p.id) !== entry) return void this.scene.remove(v.root);
            this.scene.remove(entry.view.root);
            entry.view = v;
          });
        }
      }
      const key = `${p.x.toFixed(3)},${p.z.toFixed(3)},${p.facing.toFixed(3)},${p.speed.toFixed(2)}`;
      if (key !== e.last) {
        e.buffer.push(nowMs, p);
        e.last = key;
      }
      if (tagText(p) !== e.tagText) {
        this.scene.remove(e.tag);
        e.tag = this.tag(p);
        e.tagText = tagText(p);
        this.scene.add(e.tag);
      }
      const s = e.buffer.sample(nowMs) ?? p;
      const seat = p.seatId ? SEATS.find((x) => x.id === p.seatId) : undefined;
      const state: AvatarState = seat
        ? { x: seat.pos[0], z: seat.pos[2], facing: seat.facingY, speed: 0, mode: 'sit', seatId: seat.id }
        : { x: s.x, z: s.z, facing: s.facing, speed: s.speed, mode: 'walk', seatId: null };
      e.view.update(state, dt, seat ? SEAT_POSE[seat.kind] : undefined);
      const head = seat ? 1.45 : 2.0;
      e.tag.position.set(e.view.root.position.x, head, e.view.root.position.z);
      if (e.bubble) {
        e.bubble.sprite.position.set(e.view.root.position.x, head + 0.32, e.view.root.position.z);
        if (nowMs > e.bubble.until) {
          this.scene.remove(e.bubble.sprite);
          e.bubble = null;
        }
      }
    }
  }

  /** Shows a chat or emote bubble over a remote player. */
  bubble(playerId: string, text: string, kind: 'chat' | 'emote', nowMs: number): void {
    const e = this.entries.get(playerId);
    if (!e) return;
    if (e.bubble) this.scene.remove(e.bubble.sprite);
    const sprite =
      kind === 'emote'
        ? textSprite(text, { height: 0.42, bg: 'rgba(0,0,0,0)', font: 80 })
        : textSprite(Array.from(text).slice(0, 60).join(''), { height: 0.24, bg: 'rgba(243,230,211,0.95)', fg: '#1a0f06' });
    this.scene.add(sprite);
    e.bubble = { sprite, until: nowMs + (kind === 'emote' ? 3000 : 4000) };
  }

  /** Whether a remote player currently shows a bubble (used by tests). */
  hasBubble(playerId: string): boolean {
    return this.entries.get(playerId)?.bubble != null;
  }

  private tag(p: RemotePlayer): THREE.Sprite {
    return textSprite(tagText(p), p.away ? { fg: '#a89a88' } : {});
  }

  private remove(id: string, e: Entry): void {
    this.scene.remove(e.view.root, e.tag);
    if (e.bubble) this.scene.remove(e.bubble.sprite);
    this.entries.delete(id);
  }
}

function tagText(p: RemotePlayer): string {
  return p.away ? `${p.name} (uzakta)` : p.name;
}
