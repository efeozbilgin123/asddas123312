import * as THREE from 'three';
import type { AssetBank } from './assets';
import { fireColor, flicker } from './flicker';
import { PLACEMENTS, ROOM, WINDOW } from './layout';
import type { QualityPreset } from './quality';

export interface Lighting {
  update(t: number): void;
}

const STOVE_LIGHT = 7;
const LAMP_LIGHT = 9;

export function createLighting(renderer: THREE.WebGLRenderer, scene: THREE.Scene, bank: AssetBank, q: QualityPreset): Lighting {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const hdr = bank.hdri.get('snowy_forest');
  if (hdr) {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    pmrem.dispose();
    scene.environmentIntensity = 0.22;
    scene.background = hdr; // only visible through the window
    scene.backgroundIntensity = 0.35;
  } else {
    scene.background = new THREE.Color('#1b2333');
  }

  scene.add(new THREE.HemisphereLight('#ffd9a8', '#3a2414', 0.25));

  const shadowed = (l: THREE.PointLight) => {
    if (!q.shadows) return;
    l.castShadow = true;
    l.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    l.shadow.bias = -0.002;
    l.shadow.radius = 4;
  };

  const stove = PLACEMENTS.find((p) => p.id === 'stove')!;
  const stoveLight = new THREE.PointLight('#ff8a3a', STOVE_LIGHT, 9, 2);
  stoveLight.position.set(stove.pos[0] + 0.6, 0.45, stove.pos[2] + 0.6);
  shadowed(stoveLight);
  scene.add(stoveLight);

  // Fire glow at the stove's front: a soft additive sprite whose colour follows the flicker.
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const fire = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTex, color: '#ff7a24', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
  );
  const front = { x: Math.sin(stove.rotY), z: Math.cos(stove.rotY) };
  fire.position.set(stove.pos[0] + front.x * 0.33, 0.32, stove.pos[2] + front.z * 0.33);
  fire.scale.setScalar(0.35);
  scene.add(fire);


  PLACEMENTS.filter((p) => p.asset === 'lantern_chandelier_01').forEach((p, i) => {
    const l = new THREE.PointLight('#ffc27a', LAMP_LIGHT, 11, 2);
    l.position.set(p.pos[0], ROOM.height - 0.65, p.pos[2]);
    if (i === 0) shadowed(l);
    scene.add(l);
  });

  const oilLamp = PLACEMENTS.find((p) => p.id === 'oil-lamp');
  if (oilLamp) {
    const l = new THREE.PointLight('#ffb062', 2.5, 4, 2);
    l.position.set(oilLamp.pos[0], oilLamp.pos[1] + 0.45, oilLamp.pos[2]);
    scene.add(l);
  }

  const moon = new THREE.DirectionalLight('#8fa6d8', 0.35);
  moon.position.set(WINDOW.x, WINDOW.y + 2, -ROOM.depth / 2 - 4);
  moon.target.position.set(WINDOW.x, 0, 0);
  scene.add(moon, moon.target);

  return {
    update(t: number) {
      const f = flicker(t);
      stoveLight.intensity = STOVE_LIGHT * f;
      const c = fireColor(f);
      fire.material.color.setRGB(c.r, c.g, c.b);
      fire.scale.setScalar(0.3 + 0.08 * f);
    }
  };
}
