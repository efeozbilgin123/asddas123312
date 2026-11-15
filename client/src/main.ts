import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { AvatarView } from './avatar/avatar';
import { followCamera } from './avatar/camera';
import { step, type AvatarState } from '@kahvehane/shared';
import { initialCat, catStep, type CatState } from '@kahvehane/shared';
import { CatView } from './cat/cat';
import { cameraRelative, TouchJoystick } from './input/joystick';
import { KeyboardInput } from './input/keyboard';
import { nearestSeat, sitDown, standUp } from '@kahvehane/shared';
import { Hud, readSetting, type CharacterId } from './ui/hud';
import { loadAll, type AssetBank } from './world/assets';
import { CAT_SPOTS, COLLIDERS, LOOKS, ROOM, SEAT_POSE, SEATS, SPAWN } from '@kahvehane/shared';
import { connect, defaultServerUrl, offlineSession, type Session } from './net/connection';
import { RemotePlayers, textSprite } from './net/remote';
import { ChatPanel } from './ui/chat';
import { EMOTES } from '@kahvehane/shared';
import { showJoin, type JoinChoice } from './ui/join';
import { createLighting } from './world/lighting';
import { MANIFEST } from './world/manifest';
import { detectQuality, QUALITY, type QualityName } from './world/quality';
import { addLoadedPlacements, buildRoom } from './world/room';
import { createSnow } from './world/weather';

const QUALITIES = ['low', 'medium', 'high'] as const;
const CHARACTERS = ['mannequin'] as const;
const params = new URLSearchParams(location.search);
const forced = params.get('q');
const qualityName: QualityName =
  (QUALITIES as readonly string[]).includes(forced ?? '')
    ? (forced as QualityName)
    : readSetting('kh.quality', QUALITIES) ?? detectQuality(navigator as Navigator & { deviceMemory?: number });
const quality = QUALITY[qualityName];
const still = params.has('still');
const touch = matchMedia('(pointer: coarse)').matches;
let character: CharacterId = readSetting('kh.character', CHARACTERS) ?? 'mannequin';

// ---------- renderer & scene ----------
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: qualityName !== 'low' });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
function resize(): void {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- HUD & input ----------
const hudRoot = document.getElementById('hud')!;
const keyboard = new KeyboardInput();
const joystick = new TouchJoystick(hudRoot);
const hud = new Hud(hudRoot, touch, qualityName, character, {
  onSitToggle: () => toggleSit(),
  onQuality: () => location.reload(),
  onCharacter: (c) => {
    character = c;
    spawnAvatar();
  }
});
let worldReady = false;
keyboard.onInteract(() => {
  if (worldReady) toggleSit(); // ignore E while the salon is still loading
});

// ---------- world ----------
const bank: AssetBank = await loadAll(
  MANIFEST.filter((m) => !m.deferred),
  '1k',
  (d, t) => hud.progress(d, t)
);
const room = buildRoom(bank, quality);
scene.add(room.group);
const lighting = createLighting(renderer, scene, bank, quality);
const snow = createSnow(quality);
scene.add(snow.object);

// ---------- avatars ----------
const lookColor = (id: string) => LOOKS.find((l) => l.id === id)?.color;
function makeAvatar(look: string): AvatarView | null {
  const model = bank.models.get(`char-${character}`);
  if (!model) return null;
  return new AvatarView(scene, SkeletonUtils.clone(model), model.animations, { idle: 'idle', walk: 'walk', run: 'run' }, { tint: lookColor(look) });
}

let avatar: AvatarState = { x: SPAWN[0], z: SPAWN[2], facing: Math.PI, speed: 0, mode: 'walk', seatId: null };
let avatarView: AvatarView | null = null;
let myLook: string = LOOKS[0].id;
function spawnAvatar(): void {
  if (avatarView) scene.remove(avatarView.root);
  avatarView = makeAvatar(myLook);
}

// ---------- session ----------
let session: Session = offlineSession();
const remotes = new RemotePlayers(scene, makeAvatar);

function occupied(): Set<string> {
  return remotes.occupiedSeats(session);
}

function toggleSit(): void {
  if (avatar.mode === 'sit') {
    const seat = SEATS.find((s) => s.id === avatar.seatId);
    if (seat) avatar = standUp(avatar, seat, COLLIDERS);
    session.stand();
    return;
  }
  const seat = nearestSeat(avatar, SEATS, occupied());
  if (!seat) return;
  avatar = sitDown(avatar, seat); // optimistic; reverted on 'denied'
  session.sit(seat.id);
}

async function joinSalon(): Promise<void> {
  const auto = params.get('name');
  let choice: JoinChoice | null = auto ? { name: auto, look: params.get('look') ?? LOOKS[0].id } : null;
  let message = '';
  for (;;) {
    if (!choice) choice = await showJoin(hudRoot, message);
    myLook = choice.look;
    const result = await connect({ url: defaultServerUrl(), name: choice.name, look: choice.look });
    if ('error' in result) {
      if (result.error === 'offline') break;
      message = result.error === 'full' ? 'Salon dolu (15/15). Biraz sonra tekrar dene.' : 'Bir isim yaz';
      choice = null;
      continue;
    }
    session = result;
    const me = session.players().get(session.selfId);
    if (me) avatar = { ...avatar, x: me.x, z: me.z, facing: me.facing };
    session.onCorrect((p) => {
      avatar = { ...avatar, x: p.x, z: p.z };
    });
    session.onDenied((reason) => {
      if (reason === 'seat-taken') {
        const seat = SEATS.find((s) => s.id === avatar.seatId);
        if (seat) avatar = standUp(avatar, seat, COLLIDERS);
        hud.toast('Bu koltuk dolu');
      }
    });
    break;
  }
  spawnAvatar();
}

// ---------- chat & emotes ----------
let ownBubble: { sprite: THREE.Sprite; until: number } | null = null;
function showOwnBubble(text: string, kind: 'chat' | 'emote'): void {
  if (ownBubble) scene.remove(ownBubble.sprite);
  const sprite =
    kind === 'emote'
      ? textSprite(text, { height: 0.42, bg: 'rgba(0,0,0,0)', font: 80 })
      : textSprite(Array.from(text).slice(0, 60).join(''), { height: 0.24, bg: 'rgba(243,230,211,0.95)', fg: '#1a0f06' });
  scene.add(sprite);
  ownBubble = { sprite, until: performance.now() + (kind === 'emote' ? 3000 : 4000) };
}
const emojiOf = (id: string) => EMOTES.find((e) => e.id === id)?.emoji ?? '';
let chat: ChatPanel | null = null;
const known = new Map<string, string>(); // id → name, for join/leave lines

function setupChat(): void {
  if (!session.online) return;
  chat = new ChatPanel(hudRoot, {
    onSend: (text) => session.chat(text),
    onEmote: (id) => session.emote(id)
  });
  session.onChat((m) => {
    const self = m.from === session.selfId;
    chat?.add({ name: m.name, text: m.text, self });
    if (self) showOwnBubble(m.text, 'chat');
    else remotes.bubble(m.from, m.text, 'chat', performance.now());
  });
  session.onEmote((m) => {
    if (m.from === session.selfId) showOwnBubble(emojiOf(m.id), 'emote');
    else remotes.bubble(m.from, emojiOf(m.id), 'emote', performance.now());
  });
  session.onDenied((reason) => {
    if (reason === 'rate-limit') chat?.system('Biraz yavaş 🙂');
  });
  for (const p of session.players().values()) known.set(p.id, p.name);
}

function announceJoinsAndLeaves(): void {
  if (!chat) return;
  const now = session.players();
  for (const p of now.values()) {
    if (!known.has(p.id)) {
      known.set(p.id, p.name);
      chat.system(`${p.name} salona girdi`);
    }
  }
  for (const [id, name] of known) {
    if (!now.has(id)) {
      known.delete(id);
      chat.system(`${name} ayrıldı`);
    }
  }
}

// Sends our position at most 10 times a second, only when it changed.
let lastSent = { x: NaN, z: NaN, facing: NaN, at: 0 };
function sendMove(now: number): void {
  if (!session.online || avatar.mode === 'sit' || now - lastSent.at < 100) return;
  const moved = Math.hypot(avatar.x - lastSent.x, avatar.z - lastSent.z) > 0.01 || Math.abs(avatar.facing - lastSent.facing) > 0.02;
  if (!moved && !(Number.isNaN(lastSent.x))) return;
  session.sendMove({ x: avatar.x, z: avatar.z, facing: avatar.facing, speed: avatar.speed });
  lastSent = { x: avatar.x, z: avatar.z, facing: avatar.facing, at: now };
}

// ---------- cat ----------
let cat: CatState = initialCat(CAT_SPOTS, Math.random);
let catView = new CatView(scene, bank);

// ---------- camera orbit ----------
const orbit = { yaw: 0, pitch: 0.35, distance: 3.2 };
let dragging: { id: number; x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  if (touch && e.clientX < innerWidth * 0.4) return; // left side belongs to the joystick
  dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
addEventListener('pointermove', (e) => {
  if (!dragging || e.pointerId !== dragging.id) return;
  orbit.yaw -= (e.clientX - dragging.x) * 0.006;
  orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + (e.clientY - dragging.y) * 0.004, 0.1, 1.2);
  dragging.x = e.clientX;
  dragging.y = e.clientY;
});
addEventListener('pointerup', (e) => {
  if (dragging?.id === e.pointerId) dragging = null;
});
canvas.addEventListener('wheel', (e) => {
  orbit.distance = THREE.MathUtils.clamp(orbit.distance + e.deltaY * 0.003, 2, 6);
}, { passive: true });

const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
let viewOverride: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;

function updateCamera(dt: number): void {
  if (viewOverride) {
    camera.position.copy(viewOverride.pos);
    camera.lookAt(viewOverride.target);
    return;
  }
  const seated = avatar.mode === 'sit';
  if (seated) {
    // ease the orbit behind the seated avatar, closer and lower
    const behind = avatar.facing + Math.PI;
    let d = (behind - orbit.yaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    orbit.yaw += d * Math.min(1, dt * 2.5);
  }
  const headY = seated ? 1.2 : 1.55;
  camTarget.set(avatar.x, headY, avatar.z);
  const want = followCamera(camTarget, orbit.yaw, seated ? 0.25 : orbit.pitch, seated ? 1.8 : orbit.distance, COLLIDERS, ROOM);
  camPos.set(want.x, want.y, want.z);
  camera.position.lerp(camPos, 1 - Math.exp(-dt * 10));
  camera.lookAt(camTarget);
}

// ---------- loop ----------
let fps = 60;
function tick(dt: number): void {
  const kb = keyboard.read();
  const js = joystick.read();
  const raw = Math.hypot(js.x, js.z) > 0 ? js : kb;
  // the cat is a small moving obstacle for the avatar (only once a cat model is in the room)
  const obstacles = catView.present ? [...COLLIDERS, { minX: cat.x - 0.15, maxX: cat.x + 0.15, minZ: cat.z - 0.15, maxZ: cat.z + 0.15 }] : COLLIDERS;
  avatar = step(avatar, cameraRelative(raw, orbit.yaw), dt, obstacles);
  const now = performance.now();
  sendMove(now);
  const shared = session.cat();
  if (shared) cat = { ...cat, x: shared.x, z: shared.z, facing: shared.facing, action: shared.action as CatState['action'] };
  else cat = catStep(cat, dt, { spots: CAT_SPOTS, avatar, rng: Math.random });
  remotes.update(session, now, dt);
  announceJoinsAndLeaves();
  const seat = avatar.seatId ? SEATS.find((x) => x.id === avatar.seatId) : undefined;
  avatarView?.update(avatar, dt, seat ? SEAT_POSE[seat.kind] : undefined);
  catView.update(cat, dt);
  lighting.update(performance.now() / 1000);
  snow.update(dt);
  hud.sitState(avatar.mode === 'sit' ? 'stand' : nearestSeat(avatar, SEATS, occupied()) ? 'sit' : null, touch);
  hud.status(session.online, session.players().size);
  if (ownBubble && avatarView) {
    const p = avatarView.root.position;
    ownBubble.sprite.position.set(p.x, avatar.mode === 'sit' ? 1.77 : 2.32, p.z);
    if (now > ownBubble.until) {
      scene.remove(ownBubble.sprite);
      ownBubble = null;
    }
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}

const debug = {
  ready: false,
  avatar: () => ({ ...avatar }),
  cat: () => ({ ...cat }),
  fps: () => fps,
  session: () => session,
  chatText: () => chat?.text() ?? '',
  hasBubble: (id: string) => remotes.hasBubble(id),
  teleport(x: number, z: number) {
    avatar = { ...avatar, x, z, mode: 'walk', seatId: null };
  },
  /** Advance the simulation n frames (used by headless tests in ?still mode). */
  tick(n = 1, dt = 1 / 30) {
    for (let i = 0; i < n; i++) tick(dt);
  },
  view(px: number, py: number, pz: number, tx: number, ty: number, tz: number) {
    viewOverride = { pos: new THREE.Vector3(px, py, pz), target: new THREE.Vector3(tx, ty, tz) };
    tick(1 / 30);
  },
  follow() {
    viewOverride = null;
  }
};
// Test/debug hooks only in development or with ?debug (they can teleport the avatar).
if (import.meta.env.DEV || params.has('debug')) (window as unknown as { __kh: typeof debug }).__kh = debug;

hud.ready();
await joinSalon();
setupChat();
camera.position.set(avatar.x, 2.5, avatar.z + 3);
updateCamera(1);
worldReady = true;
hud.missing(bank.missing.filter((id) => id !== 'cat'));

void loadAll(MANIFEST.filter((m) => m.deferred), '1k', undefined, undefined, bank).then(() => {
  addLoadedPlacements(room.furniture, bank, quality);
  if (!catView.present) catView = new CatView(scene, bank);
  hud.missing(bank.missing.filter((id) => id !== 'cat'));
  debug.ready = true;
});

const clock = new THREE.Clock();
if (!still) {
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    fps = fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    tick(dt);
  });
}
