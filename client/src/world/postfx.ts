import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { QualityPreset } from './quality';

export interface PostFx {
  render(): void;
  setSize(w: number, h: number): void;
}

/**
 * Render pipeline per quality preset: plain render (low), or a composer with ambient occlusion
 * (high only), a gentle bloom on lamps/fire, tone mapping (OutputPass) and anti-aliasing.
 */
export function createPostFx(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, q: QualityPreset): PostFx {
  if (!q.ao && !q.bloom) {
    return { render: () => renderer.render(scene, camera), setSize: () => {} };
  }
  const size = renderer.getSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: q.aa === 'msaa' ? 4 : 0
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  let ao: GTAOPass | null = null;
  if (q.ao) {
    ao = new GTAOPass(scene, camera, size.x, size.y);
    ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1.2, samples: 12 });
    ao.blendIntensity = 0.85;
    composer.addPass(ao);
  }
  if (q.bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.32, 0.55, 0.88));
  composer.addPass(new OutputPass());
  if (q.aa === 'smaa') composer.addPass(new SMAAPass(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio()));
  return {
    render: () => composer.render(),
    setSize: (w, h) => {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      ao?.setSize(w, h);
    }
  };
}
