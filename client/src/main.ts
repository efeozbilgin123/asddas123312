import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadAll } from './world/assets';
import { createLighting } from './world/lighting';
import { MANIFEST } from './world/manifest';
import { detectQuality, QUALITY } from './world/quality';
import { addLoadedPlacements, buildRoom } from './world/room';
import { createSnow } from './world/weather';

const params = new URLSearchParams(location.search);
const forced = params.get('q');
const quality = QUALITY[forced === 'low' || forced === 'medium' || forced === 'high' ? forced : detectQuality(navigator as Navigator & { deviceMemory?: number })];
const still = params.has('still');
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
camera.position.set(1.5, 2.6, 4.5);
const controls = new OrbitControls(camera, canvas);
controls.target.set(-2, 0.8, -2.5);
controls.update();

function resize(): void {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const bank = await loadAll(MANIFEST.filter((m) => !m.deferred), quality.textureRes === '2k' ? '1k' : '1k');
const room = buildRoom(bank, quality);
scene.add(room.group);
const lighting = createLighting(renderer, scene, bank, quality);
const snow = createSnow(quality);
scene.add(snow.object);

const debug = {
  ready: false,
  view(px: number, py: number, pz: number, tx: number, ty: number, tz: number) {
    camera.position.set(px, py, pz);
    controls.target.set(tx, ty, tz);
    controls.update();
    lighting.update(1.3);
    renderer.render(scene, camera);
  }
};
(window as unknown as { __kh: typeof debug }).__kh = debug;

void loadAll(MANIFEST.filter((m) => m.deferred), '1k', undefined, undefined, bank).then(() => {
  addLoadedPlacements(room.furniture, bank, quality);
  debug.ready = true;
});

const clock = new THREE.Clock();
if (!still) renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  lighting.update(clock.elapsedTime);
  snow.update(dt);
  controls.update();
  renderer.render(scene, camera);
});
