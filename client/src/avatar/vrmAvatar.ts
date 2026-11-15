import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { AvatarState } from '@kahvehane/shared';
import { DEFAULT_SEAT, rotateWorld, type AvatarLike } from './avatar';

export interface VrmClips { idle?: THREE.AnimationClip; walk?: THREE.AnimationClip; run?: THREE.AnimationClip }

const _v = new THREE.Vector3();
const _axis = new THREE.Vector3();

/**
 * A VRM avatar driven by AvatarState: retargeted Mixamo clips, procedural sit, and the VRM's own
 * spring-bone physics (hair, clothes, body) updated every frame.
 */
export class VrmAvatarView implements AvatarLike {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Partial<Record<keyof VrmClips, THREE.AnimationAction>> = {};
  private current: THREE.AnimationAction | null = null;
  private sitBlend = 0;
  private readonly hipY: number;

  constructor(scene: THREE.Scene, private readonly vrm: VRM, clips: VrmClips) {
    vrm.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.frustumCulled = false;
      }
    });
    this.root.add(vrm.scene);
    scene.add(this.root);
    this.root.updateMatrixWorld(true);
    this.hipY = this.bone('hips')?.getWorldPosition(_v).y ?? 0.9;
    this.mixer = new THREE.AnimationMixer(vrm.scene);
    for (const key of ['idle', 'walk', 'run'] as const) {
      const c = clips[key];
      if (c) this.actions[key] = this.mixer.clipAction(c);
    }
  }

  private bone(name: VRMHumanBoneName): THREE.Object3D | null {
    return this.vrm.humanoid?.getNormalizedBoneNode(name) ?? null;
  }

  private play(key: keyof VrmClips, timeScale = 1): void {
    const next = this.actions[key] ?? this.actions.idle;
    if (!next) return;
    next.timeScale = timeScale;
    if (next === this.current) return;
    next.reset().fadeIn(0.25).play();
    this.current?.fadeOut(0.25);
    this.current = next;
  }

  update(s: AvatarState, dt: number, seat = DEFAULT_SEAT): void {
    const sitting = s.mode === 'sit';
    if (sitting || s.speed < 0.15) this.play('idle');
    else if (s.speed > 2.2 && this.actions.run) this.play('run', s.speed / 3.2);
    else this.play('walk', Math.max(0.5, s.speed / 1.6));
    this.mixer.update(dt);

    this.sitBlend = THREE.MathUtils.damp(this.sitBlend, sitting ? 1 : 0, 10, dt);
    const k = this.sitBlend;
    const fwd = seat.forward * k;
    this.root.position.set(s.x + Math.sin(s.facing) * fwd, -Math.max(0, this.hipY - seat.height) * k, s.z + Math.cos(s.facing) * fwd);
    this.root.rotation.y = s.facing;
    this.root.updateMatrixWorld(true);
    if (k > 0.001) {
      _axis.set(Math.cos(s.facing), 0, -Math.sin(s.facing));
      const axis = _axis.clone();
      for (const side of ['left', 'right'] as const) {
        const up = this.bone(`${side}UpperLeg`);
        const low = this.bone(`${side}LowerLeg`);
        if (up) rotateWorld(up, axis, -(Math.PI / 2) * k);
        if (low) rotateWorld(low, axis, (Math.PI / 2) * k);
      }
    }
    this.vrm.update(dt); // normalized → raw bones, spring bones (physics), look-at
  }
}
