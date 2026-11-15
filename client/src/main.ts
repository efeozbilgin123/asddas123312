import * as THREE from 'three';
import { AvatarView } from './avatar/avatar';
import { followCamera } from './avatar/camera';
import { step, type AvatarState } from './avatar/controller';
import { initialCat, catStep, type CatState } from './cat/brain';
import { CatView } from './cat/cat';
import { cameraRelative, TouchJoystick } from './input/joystick';
import { KeyboardInput } from './input/keyboard';
import { nearestSeat, sitDown, standUp } from './interact/seats';
import { Hud, readSetting, type CharacterId } from './ui/hud';
import { loadAll, type AssetBank } from './world/assets';
import { CAT_SPOTS, COLLIDERS, ROOM, SEATS, SPAWN } from './world/layout';
import { createLighting } from './world/lighting';
import { MANIFEST } from './world/manifest';
import { detectQuality, QUALITY, type QualityName } from './world/quality';
import { addLoadedPlacements, buildRoom } from './world/room';
import { createSnow } from './world/weather';

const QUALITIES = ['low', 'medium', 'high'] as const;
const CHARACTERS = ['soldier'] as const;
const params = new URLSearchParams(location.search);
const forced = params.get('q');
const qualityName: QualityName =
  (QUALITIES as readonly string[]).includes(forced ?? '')
    ? (forced as QualityName)
    : readSetting('kh.quality', QUALITIES) ?? detectQuality(navigator as Navigator & { deviceMemory?: number });
const quality = QUALITY[qualityName];
const still = params.has('still');
const touch = matchMedia('(pointer: coarse)').matches;
let character: CharacterId = readSetting('kh.character', CHARACTERS) ?? 'soldier';

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

// ---------- avatar ----------
let avatar: AvatarState = { x: SPAWN[0], z: SPAWN[2], facing: Math.PI, speed: 0, mode: 'walk', seatId: null };
let avatarView: AvatarView | null = null;
function spawnAvatar(): void {
  if (avatarView) scene.remove(avatarView.root);
  const model = bank.models.get(`char-${character}`);
  const clips = model?.animations ?? [];
  avatarView = model ? new AvatarView(scene, model, clips, { idle: 'Idle', walk: 'Walk', run: 'Run' }) : null;
}
spawnAvatar();

function toggleSit(): void {
  if (avatar.mode === 'sit') {
    const seat = SEATS.find((s) => s.id === avatar.seatId);
    if (seat) avatar = standUp(avatar, seat, COLLIDERS);
    return;
  }
  const seat = nearestSeat(avatar, SEATS, new Set());
  if (seat) avatar = sitDown(avatar, seat);
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
  cat = catStep(cat, dt, { spots: CAT_SPOTS, avatar, rng: Math.random });
  avatarView?.update(avatar, dt);
  catView.update(cat, dt);
  lighting.update(performance.now() / 1000);
  snow.update(dt);
  hud.sitState(avatar.mode === 'sit' ? 'stand' : nearestSeat(avatar, SEATS, new Set()) ? 'sit' : null, touch);
  updateCamera(dt);
  renderer.render(scene, camera);
}

const debug = {
  ready: false,
  avatar: () => ({ ...avatar }),
  cat: () => ({ ...cat }),
  fps: () => fps,
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

camera.position.set(avatar.x, 2.5, avatar.z + 3);
updateCamera(1);
hud.ready();
worldReady = true;

void loadAll(MANIFEST.filter((m) => m.deferred), '1k', undefined, undefined, bank).then(() => {
  addLoadedPlacements(room.furniture, bank, quality);
  if (!catView.present) catView = new CatView(scene, bank);
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
