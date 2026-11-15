import * as THREE from 'three';
import type { AssetBank } from '../world/assets';
import type { CatState } from '@kahvehane/shared';

const CLIP_PATTERNS: Record<CatState['action'], RegExp[]> = {
  walk: [/walk/i, /trot/i, /run/i],
  sleep: [/sleep/i, /lie|lay/i, /idle/i],
  sit: [/sit/i, /idle/i],
  groom: [/groom|lick|clean/i, /sit/i, /idle/i]
};

/** Renders the cat if a rigged cat model is present in the bank; otherwise does nothing. */
export class CatView {
  private readonly root: THREE.Object3D | null = null;
  private readonly mixer: THREE.AnimationMixer | null = null;
  private readonly clips = new Map<CatState['action'], THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;

  constructor(scene: THREE.Scene, bank: AssetBank, targetLength = 0.45) {
    const src = bank.models.get('cat');
    if (!src) return;
    const root = src; // single cat: use the loaded scene directly (skinned meshes can't be shallow-cloned)
    const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    const len = Math.max(size.x, size.z) || 1;
    root.scale.multiplyScalar(targetLength / len);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = m.receiveShadow = true;
    });
    scene.add(root);
    this.root = root;
    this.mixer = new THREE.AnimationMixer(root);
    for (const action of Object.keys(CLIP_PATTERNS) as CatState['action'][]) {
      for (const re of CLIP_PATTERNS[action]) {
        const clip = src.animations.find((c) => re.test(c.name));
        if (clip) {
          this.clips.set(action, this.mixer.clipAction(clip));
          break;
        }
      }
    }
  }

  get present(): boolean {
    return this.root !== null;
  }

  update(state: CatState, dt: number): void {
    if (!this.root || !this.mixer) return;
    this.root.position.set(state.x, 0, state.z);
    this.root.rotation.y = state.facing;
    const next = this.clips.get(state.action) ?? null;
    if (next && next !== this.current) {
      next.reset().fadeIn(0.3).play();
      this.current?.fadeOut(0.3);
      this.current = next;
    }
    this.mixer.update(dt);
  }
}
