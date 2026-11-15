import { expect, test } from 'vitest';
import { followCamera } from '../src/avatar/camera';
import { ROOM } from '../src/world/layout';

test('followCamera stays inside room near a wall', () => {
  const target = { x: 0, y: 1.5, z: -ROOM.depth / 2 + 0.2 };
  // yaw = π: camera sits at target + (sin π, cos π)·d = behind toward −z, i.e. into the back wall
  const cam = followCamera(target, Math.PI, 0.3, 4, [], ROOM);
  expect(cam.z).toBeGreaterThan(-ROOM.depth / 2);
  expect(cam.z).toBeLessThan(ROOM.depth / 2);
  expect(Math.hypot(cam.x - target.x, cam.y - target.y, cam.z - target.z)).toBeGreaterThanOrEqual(1.0 - 1e-6);
});

test('followCamera returns full distance in open space', () => {
  const target = { x: 0, y: 1.5, z: 0 };
  const cam = followCamera(target, 0, 0.3, 4, [], ROOM);
  expect(Math.hypot(cam.x - target.x, cam.y - target.y, cam.z - target.z)).toBeCloseTo(4, 5);
  expect(cam.z).toBeGreaterThan(0); // yaw 0 → camera behind at +z
});

test('followCamera stays below the ceiling', () => {
  const cam = followCamera({ x: 0, y: 1.5, z: 0 }, 0, 1.2, 6, [], ROOM);
  expect(cam.y).toBeLessThan(ROOM.height);
});
