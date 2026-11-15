import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import type { AssetEntry } from './manifest';

export type Res = '1k' | '2k';

export interface PbrSet {
  map: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  aoMap?: THREE.Texture;
}

export interface AssetBank {
  models: Map<string, THREE.Group>;
  textures: Map<string, PbrSet>;
  hdri: Map<string, THREE.DataTexture>;
  missing: string[];
}

export interface Loaders {
  model(url: string): Promise<THREE.Group>;
  texture(url: string): Promise<THREE.Texture>;
  hdri(url: string): Promise<THREE.DataTexture>;
}

export const ASSET_ROOT = './assets';

export function realLoaders(): Loaders {
  const gltf = new GLTFLoader();
  const tex = new THREE.TextureLoader();
  const rgbe = new RGBELoader();
  return {
    model: async (url) => {
      const g = await gltf.loadAsync(url);
      g.scene.animations = g.animations; // keep clips with the scene for rigged models
      return g.scene;
    },
    texture: (url) => tex.loadAsync(url),
    hdri: (url) => rgbe.loadAsync(url)
  };
}

export function emptyBank(): AssetBank {
  return { models: new Map(), textures: new Map(), hdri: new Map(), missing: [] };
}

function texUrl(id: string, map: string, res: Res): string {
  return `${ASSET_ROOT}/textures/${id}/${id}_${map}_${res}.jpg`;
}

async function optional<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p;
  } catch {
    return undefined;
  }
}

async function loadEntry(entry: AssetEntry, res: Res, loaders: Loaders, bank: AssetBank): Promise<void> {
  if (entry.kind === 'model' && entry.source === 'local') {
    bank.models.set(entry.id, await loaders.model(`${ASSET_ROOT}/${entry.path}`));
  } else if (entry.kind === 'model') {
    bank.models.set(entry.id, await loaders.model(`${ASSET_ROOT}/models/${entry.id}/${entry.id}_${res}.gltf`));
  } else if (entry.kind === 'hdri') {
    bank.hdri.set(entry.id, await loaders.hdri(`${ASSET_ROOT}/hdri/${entry.id}_${res}.hdr.bin`));
  } else if (entry.source === 'local') {
    const map = await loaders.texture(`${ASSET_ROOT}/${entry.path}`);
    map.colorSpace = THREE.SRGBColorSpace;
    bank.textures.set(entry.id, { map });
  } else {
    const map = await loaders.texture(texUrl(entry.id, 'diff', res));
    map.colorSpace = THREE.SRGBColorSpace;
    const [normalMap, roughnessMap, aoMap] = await Promise.all([
      optional(loaders.texture(texUrl(entry.id, 'nor_gl', res))),
      optional(loaders.texture(texUrl(entry.id, 'rough', res))),
      optional(loaders.texture(texUrl(entry.id, 'ao', res)))
    ]);
    bank.textures.set(entry.id, { map, normalMap, roughnessMap, aoMap });
  }
}

/** Loads every entry; failures are recorded in `missing` and never reject. */
export async function loadAll(
  manifest: AssetEntry[],
  res: Res,
  onProgress?: (done: number, total: number) => void,
  loaders: Loaders = realLoaders(),
  bank: AssetBank = emptyBank()
): Promise<AssetBank> {
  let done = 0;
  const total = manifest.length;
  await Promise.all(
    manifest.map(async (entry) => {
      try {
        await loadEntry(entry, res, loaders, bank);
      } catch {
        console.warn('[assets] missing', entry.id);
        bank.missing.push(entry.id);
      }
      done += 1;
      onProgress?.(done, total);
    })
  );
  return bank;
}
