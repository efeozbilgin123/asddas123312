import * as THREE from 'three';
import type { AvatarState } from '@kahvehane/shared';

/** `sit`: a real seated clip (e.g. Mixamo "Sitting Idle"); without one a procedural pose is used. */
export interface ClipMap { idle: string; walk: string; run?: string; sit?: string }

const HEIGHT = 1.72;
export const DEFAULT_SEAT = { height: 0.47, forward: 0 };

export interface AvatarOptions {
  /** Rotate the model 180° (Mixamo exports differ: some face +z, some −z). */
  flip?: boolean;
  /** Body colour for the placeholder mannequin (joints get a darker shade). */
  tint?: string;
}

const _q = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _axis = new THREE.Vector3();

/** Rotates a bone by `angle` about a world-space axis (rig-independent posing). */
export function rotateWorld(bone: THREE.Object3D, axis: THREE.Vector3, angle: number): void {
  if (!bone.parent) return;
  bone.parent.getWorldQuaternion(_qp);
  _q.setFromAxisAngle(axis, angle);
  // local' = parentWorld⁻¹ · R · parentWorld · local
  const pinv = _qp.clone().invert();
  bone.quaternion.premultiply(pinv.multiply(_q).multiply(_qp));
  bone.updateMatrixWorld(true);
}

/**
 * A rigged character driven by AvatarState. Clips may come from another model with the same
 * (Mixamo) skeleton. Sitting is a procedural pose layered over the idle clip.
 */
/** What every avatar view offers (mannequin or VRM). */
export interface AvatarLike {
  readonly root: THREE.Group;
  update(s: AvatarState, dt: number, seat?: { height: number; forward: number }): void;
}

export class AvatarView implements AvatarLike {
  readonly root = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Partial<Record<'idle' | 'walk' | 'run' | 'sit', THREE.AnimationAction>> = {};
  private current: THREE.AnimationAction | null = null;
  private readonly bones = new Map<string, THREE.Bone>();
  private sitBlend = 0;
  private readonly hipY: number;

  constructor(scene: THREE.Scene, model: THREE.Object3D, clips: THREE.AnimationClip[], map: ClipMap, opts: AvatarOptions = {}) {
    this.model = model;
    model.updateMatrixWorld(true); // clones have stale bone matrices until updated
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y || 1;
    model.scale.multiplyScalar(HEIGHT / h);
    model.position.y -= box.min.y * (HEIGHT / h); // feet on the floor
    if (opts.flip) model.rotation.y = Math.PI; // our yaw convention looks along +z
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false; // skinned bounds don't follow the animation
        if (opts.tint) {
          const mat = (m.material as THREE.MeshStandardMaterial).clone();
          const c = new THREE.Color(opts.tint);
          if (/joint/i.test(mat.name)) c.multiplyScalar(0.55);
          mat.color.copy(c);
          m.material = mat;
        }
      }
      const b = o as THREE.Bone;
      if (b.isBone) this.bones.set(b.name.replace(/^mixamorig:?/, ''), b);
    });
    this.root.add(model);
    scene.add(this.root);
    this.root.updateMatrixWorld(true);
    const hips = this.bones.get('Hips');
    const hipY = hips ? hips.getWorldPosition(new THREE.Vector3()).y : 0.95;
    this.hipY = hipY;
    this.mixer = new THREE.AnimationMixer(model);
    for (const key of ['idle', 'walk', 'run', 'sit'] as const) {
      const name = map[key];
      const clip = name ? THREE.AnimationClip.findByName(clips, name) : undefined;
      if (clip) this.actions[key] = this.mixer.clipAction(stripRootMotion(clip));
    }
  }

  private play(key: 'idle' | 'walk' | 'run' | 'sit', timeScale = 1): void {
    const next = this.actions[key] ?? this.actions.idle;
    if (!next) return;
    next.timeScale = timeScale;
    if (next === this.current) return;
    next.reset().fadeIn(0.25).play();
    this.current?.fadeOut(0.25);
    this.current = next;
  }

  /** `seat`: the sitting surface of the current seat (hips rest on it). */
  update(s: AvatarState, dt: number, seat: { height: number; forward: number } = DEFAULT_SEAT): void {
    const sitting = s.mode === 'sit';
    const sitClip = sitting && this.actions.sit !== undefined;
    if (sitClip) this.play('sit');
    else if (sitting || s.speed < 0.15) this.play('idle');
    else if (s.speed > 2.2 && this.actions.run) this.play('run', s.speed / 3.2);
    else this.play('walk', Math.max(0.5, s.speed / 1.6));
    this.mixer.update(dt);

    this.sitBlend = THREE.MathUtils.damp(this.sitBlend, sitting ? 1 : 0, 10, dt);
    const k = this.sitBlend;
    const fwd = seat.forward * k;
    this.root.position.set(s.x + Math.sin(s.facing) * fwd, -Math.max(0, this.hipY - seat.height) * k, s.z + Math.cos(s.facing) * fwd);
    this.root.rotation.y = s.facing;
    if (k > 0.001 && !this.actions.sit) {
      this.root.updateMatrixWorld(true);
      this.applySitPose(k, s.facing);
    }
  }

  /**
   * Bends hips and knees ~90° about the avatar's own right axis, in world space, after the mixer
   * has written the idle pose — works for any rig orientation.
   */
  private applySitPose(k: number, facing: number): void {
    _axis.set(Math.cos(facing), 0, -Math.sin(facing)); // avatar's local +x in world space
    const axis = _axis.clone();
    for (const side of ['Left', 'Right']) {
      const up = this.bones.get(`${side}UpLeg`);
      const leg = this.bones.get(`${side}Leg`);
      if (up) rotateWorld(up, axis, -(Math.PI / 2) * k); // thigh swings forward to horizontal
      if (leg) rotateWorld(leg, axis, (Math.PI / 2) * k); // shin back down to vertical
    }
  }

  /** Head position for cameras. */
  headPosition(out = new THREE.Vector3()): THREE.Vector3 {
    const head = this.bones.get('Head');
    if (head) return head.getWorldPosition(out);
    return out.set(this.root.position.x, 1.6, this.root.position.z);
  }
}

/** Drops horizontal hips translation so clips play in place (the controller moves the root). */
function stripRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
  const c = clip.clone();
  for (const track of c.tracks) {
    if (/Hips\.position$/.test(track.name)) {
      const v = track.values;
      const x0 = v[0]!;
      const z0 = v[2]!;
      for (let i = 0; i < v.length; i += 3) {
        v[i] = x0;
        v[i + 2] = z0;
      }
    }
  }
  return c;
}
