import { expect, test } from 'vitest';
import { zipSync } from 'fflate';
import { modelFromZip } from '../src/ui/avatarFile';

const glb = (tag: string) => {
  const b = new Uint8Array(32);
  b.set([0x67, 0x6c, 0x54, 0x46]); // "glTF"
  b[31] = tag.charCodeAt(0);
  return b;
};

test('picks the .vrm inside a zip first', () => {
  const zip = zipSync({ 'a/readme.txt': new Uint8Array([1]), 'a/model.glb': glb('g'), 'a/model.vrm': glb('v') });
  expect(modelFromZip(zip)?.name).toBe('a/model.vrm');
});

test('falls back to a .glb (Sketchfab layout: source/*.glb)', () => {
  const zip = zipSync({ 'x/textures/base.jpeg': new Uint8Array([1, 2]), 'x/source/MIELSIE  The Snowberry Sweetheart.glb': glb('g') });
  const m = modelFromZip(zip)!;
  expect(m.name).toBe('x/source/MIELSIE  The Snowberry Sweetheart.glb');
  expect(m.bytes[31]).toBe('g'.charCodeAt(0));
});

test('returns null when the zip has no binary glTF model', () => {
  expect(modelFromZip(zipSync({ 'a.txt': new Uint8Array([1]), 'b.gltf': new Uint8Array([123]) }))).toBeNull();
  expect(modelFromZip(new Uint8Array([1, 2, 3]))).toBeNull();
});
