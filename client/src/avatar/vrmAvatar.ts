import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { AvatarState } from '@kahvehane/shared';
import { DEFAULT_SEAT, rotateWorld, type AvatarLike } from './avatar';
import { DisplaySmoother, LocomotionMixer } from './locomotion';

export interface VrmClips { idle?: THREE.AnimationClip; walk?: THREE.AnimationClip; run?: THREE.AnimationClip }

const _v = new THREE.Vector3();
const _axis = new THREE.Vector3();

/**
 * A VRM avatar driven by AvatarState: retargeted Mixamo clips, procedural sit, and the VRM's own
 * spring-bone physics (hair, clothes, body) updated every frame.
 */
export class VrmAvatarView implements AvatarLike {
  readonly root = new THREE.Group();
  private readonly loco: LocomotionMixer;
  private readonly smooth = new DisplaySmoother();
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
    this.loco = new LocomotionMixer(new THREE.AnimationMixer(vrm.scene), clips);
  }

  private bone(name: VRMHumanBoneName): THREE.Object3D | null {
    return this.vrm.humanoid?.getNormalizedBoneNode(name) ?? null;
  }

  update(s: AvatarState, dt: number, seat = DEFAULT_SEAT): void {
    const sitting = s.mode === 'sit';
    this.loco.update(s.speed, sitting, dt);
    this.smooth.update(s.x, s.z, s.facing, dt);
    const yaw = this.smooth.yaw;

    this.sitBlend = THREE.MathUtils.damp(this.sitBlend, sitting ? 1 : 0, 10, dt);
    const k = this.sitBlend;
    const fwd = seat.forward * k;
    this.root.position.set(this.smooth.x + Math.sin(yaw) * fwd, -Math.max(0, this.hipY - seat.height) * k, this.smooth.z + Math.cos(yaw) * fwd);
    this.root.rotation.y = yaw;
    this.root.updateMatrixWorld(true);
    if (k > 0.001) {
      // seated pose about the avatar's own right axis: thighs forward, shins down,
      // a slight lean back, hands resting on the thighs
      _axis.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const axis = _axis.clone();
      const spine = this.bone('spine');
      if (spine) rotateWorld(spine, axis, -0.12 * k);
      for (const side of ['left', 'right'] as const) {
        const up = this.bone(`${side}UpperLeg`);
        const low = this.bone(`${side}LowerLeg`);
        if (up) rotateWorld(up, axis, -(Math.PI / 2) * k);
        if (low) rotateWorld(low, axis, (Math.PI / 2) * k);
        const arm = this.bone(`${side}UpperArm`);
        const fore = this.bone(`${side}LowerArm`);
        if (arm) rotateWorld(arm, axis, -0.45 * k);
        if (fore) rotateWorld(fore, axis, -0.75 * k);
      }
    }
    this.vrm.update(dt); // normalized → raw bones, spring bones (physics), look-at
  }
}
