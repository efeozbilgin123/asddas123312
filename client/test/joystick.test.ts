import { expect, test } from 'vitest';
import { cameraRelative, joystickVector } from '../src/input/joystick';

test('joystick maps drag to normalized vector with deadzone', () => {
  expect(joystickVector(0, 0, 60)).toEqual({ x: 0, z: 0, run: false });
  const right = joystickVector(60, 0, 60);
  expect(right.x).toBeCloseTo(1);
  expect(right.z).toBeCloseTo(0);
  expect(right.run).toBe(true);
  const far = joystickVector(120, 0, 60);
  expect(Math.hypot(far.x, far.z)).toBeCloseTo(1);
  expect(joystickVector(5, 0, 60)).toEqual({ x: 0, z: 0, run: false });
});

test('joystick: dragging down moves toward the camera (+z), half drag walks', () => {
  const v = joystickVector(0, 30, 60);
  expect(v.z).toBeGreaterThan(0);
  expect(v.run).toBe(false);
});

test('cameraRelative rotates forward by yaw', () => {
  const r = cameraRelative({ x: 0, z: -1, run: false }, Math.PI / 2);
  expect(r.x).toBeCloseTo(-1);
  expect(r.z).toBeCloseTo(0);
});

test('cameraRelative keeps input with zero yaw', () => {
  const r = cameraRelative({ x: 1, z: 0, run: true }, 0);
  expect(r).toMatchObject({ x: 1, run: true });
  expect(r.z).toBeCloseTo(0);
});
