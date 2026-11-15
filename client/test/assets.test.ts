import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { loadAll, type Loaders } from '../src/world/assets';
import type { AssetEntry } from '../src/world/manifest';

const manifest: AssetEntry[] = [
  { id: 'good', kind: 'model', source: 'polyhaven' },
  { id: 'broken', kind: 'model', source: 'polyhaven' },
  { id: 'floor', kind: 'texture', source: 'polyhaven' },
  { id: 'sky', kind: 'hdri', source: 'polyhaven' }
];

function fakeLoaders(): Loaders {
  return {
    model: async (url) => {
      if (url.includes('broken')) throw new Error('404');
      return new THREE.Group();
    },
    texture: async () => new THREE.Texture(),
    hdri: async () => new THREE.DataTexture()
  };
}

describe('loadAll', () => {
  test('loadAll resolves with missing entries when one asset 404s', async () => {
    const bank = await loadAll(manifest, '1k', undefined, fakeLoaders());
    expect(bank.missing).toEqual(['broken']);
    expect(bank.models.has('good')).toBe(true);
    expect(bank.textures.get('floor')?.map).toBeInstanceOf(THREE.Texture);
    expect(bank.hdri.has('sky')).toBe(true);
  });

  test('loadAll reports progress up to total', async () => {
    const calls: Array<[number, number]> = [];
    await loadAll(manifest, '1k', (d, t) => calls.push([d, t]), fakeLoaders());
    expect(calls.at(-1)).toEqual([manifest.length, manifest.length]);
  });
});
