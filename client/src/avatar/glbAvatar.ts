import * as THREE from 'three';
import type { AvatarState } from '@kahvehane/shared';
import type { AvatarLike } from './avatar';

const HEIGHT = 1.7;

/** First clip whose name matches any pattern. */
export function pickClip(clips: THREE.AnimationClip[], patterns: RegExp[]): THREE.AnimationClip | undefined {
  for (const re of patterns) {
    const c = clips.find((x) => re.test(x.name));
    if (c) return c;
  }
  return undefined;
}

/**
 * A plain (non-VRM) GLB avatar. With a skeleton and clips it plays its own idle/walk/run;
 * without (a static sculpt) it glides with a gentle bob so it still reads as "moving".
 */
export class GlbAvatarView implements AvatarLike {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer | null = null;
  private readonly actions: Partial<Record<'idle' | 'walk' | 'run', THREE.AnimationAction>> = {};
  private current: THREE.AnimationAction | null = null;
  private readonly inner = new THREE.Group();
  private phase = 0;

  constructor(scene: THREE.Scene, model: THREE.Object3D, clips: THREE.AnimationClip[]) {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y || 1;
    const k = HEIGHT / h;
    model.scale.multiplyScalar(k);
    model.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.frustumCulled = false;
      }
    });
    this.inner.add(model);
    this.root.add(this.inner);
    scene.add(this.root);
    let skinned = false;
    model.traverse((o) => (skinned ||= (o as THREE.SkinnedMesh).isSkinnedMesh === true));
    if (skinned && clips.length) {
      this.mixer = new THREE.AnimationMixer(model);
      const map = {
        idle: pickClip(clips, [/idle/i, /stand/i, /breath/i]) ?? clips[0],
        walk: pickClip(clips, [/walk/i]),
        run: pickClip(clips, [/run|jog/i])
      };
      for (const key of ['idle', 'walk', 'run'] as const) if (map[key]) this.actions[key] = this.mixer.clipAction(map[key]!);
    }
  }

  private play(key: 'idle' | 'walk' | 'run', timeScale = 1): void {
    const next = this.actions[key] ?? this.actions.idle;
    if (!next) return;
    next.timeScale = timeScale;
    if (next === this.current) return;
    next.reset().fadeIn(0.25).play();
    this.current?.fadeOut(0.25);
    this.current = next;
  }

  update(s: AvatarState, dt: number): void {
    this.root.position.set(s.x, 0, s.z);
    this.root.rotation.y = s.facing;
    const moving = s.mode !== 'sit' && s.speed > 0.15;
    if (this.mixer) {
      if (!moving) this.play('idle');
      else if (s.speed > 2.2 && this.actions.run) this.play('run', s.speed / 3.2);
      else this.play('walk', Math.max(0.5, s.speed / 1.6));
      this.mixer.update(dt);
      return;
    }
    // static model: a light bob and sway while moving, still otherwise
    this.phase += dt * (moving ? 2 * Math.PI * (s.speed / 1.1) : 0);
    const amt = THREE.MathUtils.damp(this.inner.position.y === 0 && !moving ? 0 : 1, moving ? 1 : 0, 8, dt);
    this.inner.position.y = Math.abs(Math.sin(this.phase)) * 0.035 * amt;
    this.inner.rotation.z = Math.sin(this.phase) * 0.03 * amt;
  }
}
