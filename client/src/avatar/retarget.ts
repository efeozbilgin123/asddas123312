import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

/** Mixamo bone (without the "mixamorig" prefix) → VRM humanoid bone. */
const MAP: Record<string, VRMHumanBoneName> = {
  Hips: 'hips',
  Spine: 'spine',
  Spine1: 'chest',
  Spine2: 'upperChest',
  Neck: 'neck',
  Head: 'head',
  LeftShoulder: 'leftShoulder',
  LeftArm: 'leftUpperArm',
  LeftForeArm: 'leftLowerArm',
  LeftHand: 'leftHand',
  LeftHandThumb1: 'leftThumbMetacarpal',
  LeftHandThumb2: 'leftThumbProximal',
  LeftHandThumb3: 'leftThumbDistal',
  LeftHandIndex1: 'leftIndexProximal',
  LeftHandIndex2: 'leftIndexIntermediate',
  LeftHandIndex3: 'leftIndexDistal',
  LeftHandMiddle1: 'leftMiddleProximal',
  LeftHandMiddle2: 'leftMiddleIntermediate',
  LeftHandMiddle3: 'leftMiddleDistal',
  LeftHandRing1: 'leftRingProximal',
  LeftHandRing2: 'leftRingIntermediate',
  LeftHandRing3: 'leftRingDistal',
  LeftHandPinky1: 'leftLittleProximal',
  LeftHandPinky2: 'leftLittleIntermediate',
  LeftHandPinky3: 'leftLittleDistal',
  RightShoulder: 'rightShoulder',
  RightArm: 'rightUpperArm',
  RightForeArm: 'rightLowerArm',
  RightHand: 'rightHand',
  RightHandThumb1: 'rightThumbMetacarpal',
  RightHandThumb2: 'rightThumbProximal',
  RightHandThumb3: 'rightThumbDistal',
  RightHandIndex1: 'rightIndexProximal',
  RightHandIndex2: 'rightIndexIntermediate',
  RightHandIndex3: 'rightIndexDistal',
  RightHandMiddle1: 'rightMiddleProximal',
  RightHandMiddle2: 'rightMiddleIntermediate',
  RightHandMiddle3: 'rightMiddleDistal',
  RightHandRing1: 'rightRingProximal',
  RightHandRing2: 'rightRingIntermediate',
  RightHandRing3: 'rightRingDistal',
  RightHandPinky1: 'rightLittleProximal',
  RightHandPinky2: 'rightLittleIntermediate',
  RightHandPinky3: 'rightLittleDistal',
  LeftUpLeg: 'leftUpperLeg',
  LeftLeg: 'leftLowerLeg',
  LeftFoot: 'leftFoot',
  LeftToeBase: 'leftToes',
  RightUpLeg: 'rightUpperLeg',
  RightLeg: 'rightLowerLeg',
  RightFoot: 'rightFoot',
  RightToeBase: 'rightToes'
};

/** "mixamorigLeftUpLeg" / "mixamorig:LeftUpLeg" → "leftUpperLeg"; null for unmapped bones. */
export function mixamoToVrmBone(name: string): VRMHumanBoneName | null {
  const m = /^mixamorig:?(.+)$/.exec(name);
  return (m && MAP[m[1]!]) ?? null;
}

const _restInv = new THREE.Quaternion();
const _parentRest = new THREE.Quaternion();
const _q = new THREE.Quaternion();

/**
 * Converts a Mixamo clip (from `source`, the model it was authored on) to the VRM's normalized
 * humanoid bones — three-vrm's documented method: q' = parentRestWorld · q · restWorld⁻¹.
 * Root/hips translation is dropped: the controller moves the avatar, clips play in place.
 */
export function retargetClip(clip: THREE.AnimationClip, source: THREE.Object3D, vrm: VRM): THREE.AnimationClip {
  source.updateMatrixWorld(true);
  const tracks: THREE.KeyframeTrack[] = [];
  const vrm0 = vrm.meta?.metaVersion === '0';
  for (const track of clip.tracks) {
    const [boneName, property] = track.name.split('.');
    if (property !== 'quaternion' || !boneName) continue;
    const vrmBone = mixamoToVrmBone(boneName);
    const target = vrmBone ? vrm.humanoid?.getNormalizedBoneNode(vrmBone) : null;
    const node = source.getObjectByName(boneName);
    if (!target || !node?.parent) continue;
    node.getWorldQuaternion(_restInv).invert();
    node.parent.getWorldQuaternion(_parentRest);
    const values = Float32Array.from(track.values);
    for (let i = 0; i < values.length; i += 4) {
      _q.fromArray(values, i).premultiply(_parentRest).multiply(_restInv);
      _q.toArray(values, i);
      if (vrm0) {
        values[i] = -values[i]!;
        values[i + 2] = -values[i + 2]!;
      }
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${target.name}.quaternion`, Array.from(track.times), Array.from(values)));
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
