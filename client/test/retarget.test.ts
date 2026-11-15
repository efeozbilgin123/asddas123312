import { expect, test } from 'vitest';
import { mixamoToVrmBone } from '../src/avatar/retarget';

test('maps sanitized and raw Mixamo bone names to VRM humanoid bones', () => {
  expect(mixamoToVrmBone('mixamorigHips')).toBe('hips');
  expect(mixamoToVrmBone('mixamorig:LeftUpLeg')).toBe('leftUpperLeg');
  expect(mixamoToVrmBone('mixamorigRightForeArm')).toBe('rightLowerArm');
  expect(mixamoToVrmBone('mixamorigLeftHandIndex1')).toBe('leftIndexProximal');
  expect(mixamoToVrmBone('mixamorigSpine2')).toBe('upperChest');
});

test('unknown bones are dropped', () => {
  expect(mixamoToVrmBone('mixamorigHeadTop_End')).toBeNull();
  expect(mixamoToVrmBone('Armature')).toBeNull();
});
