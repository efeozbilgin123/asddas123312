import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { LOOKS } from '@kahvehane/shared';
import { AvatarView, type AvatarLike } from './avatar';
import { retargetClip } from './retarget';
import { VrmAvatarView, type VrmClips } from './vrmAvatar';
import { GlbAvatarView } from './glbAvatar';

export const AVATAR_LABELS: Record<string, string> = { twist: 'Aiko', nine: 'Nine', ayicik: 'Ayıcık', kedi: 'Kedi', mannequin: 'Manken' };

/** Where an avatar id's file lives: bundled assets, or uploads on the game server. */
export function avatarUrl(id: string, serverHttp: string): string | null {
  if (['twist', 'nine', 'ayicik', 'kedi'].includes(id)) return `./assets/models/avatars/${id}.vrm`;
  const m = /^custom:([0-9a-f]{64})$/.exec(id);
  return m ? `${serverHttp}/avatars/${m[1]}.vrm` : null;
}

/**
 * Builds avatar views. Each VRM file is downloaded once; every player gets its own parsed VRM
 * (independent spring-bone physics). Clips are retargeted once per avatar id.
 */
export class AvatarLibrary {
  private readonly files = new Map<string, Promise<ArrayBuffer | null>>();
  private readonly clips = new Map<string, VrmClips>();
  private readonly loader = new GLTFLoader();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly mannequin: THREE.Object3D | undefined,
    private readonly serverHttp: string
  ) {
    this.loader.register((parser) => new VRMLoaderPlugin(parser));
  }

  /** The tinted mannequin (always available instantly). */
  mannequinView(look: string): AvatarLike | null {
    if (!this.mannequin) return null;
    const tint = LOOKS.find((l) => l.id === look)?.color;
    return new AvatarView(this.scene, SkeletonUtils.clone(this.mannequin), this.mannequin.animations, { idle: 'idle', walk: 'walk', run: 'run' }, { tint });
  }

  /** A VRM (or plain GLB) view for `id`, or null if it's the mannequin or fails to load. */
  async vrmView(id: string): Promise<AvatarLike | null> {
    const url = avatarUrl(id, this.serverHttp);
    if (!url) return null;
    let file = this.files.get(url);
    if (!file) {
      file = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
      this.files.set(url, file);
    }
    const buf = await file;
    if (!buf) return null;
    try {
      const gltf = await this.loader.parseAsync(buf.slice(0), '');
      const vrm = gltf.userData.vrm as VRM | undefined;
      if (!vrm) return new GlbAvatarView(this.scene, gltf.scene, gltf.animations); // plain .glb upload
      VRMUtils.removeUnnecessaryVertices(vrm.scene);
      VRMUtils.combineSkeletons(vrm.scene);
      VRMUtils.rotateVRM0(vrm); // VRM 0.x faces −z; ours face +z
      return new VrmAvatarView(this.scene, vrm, this.clipsFor(id, vrm));
    } catch (err) {
      console.warn('[avatar] could not load', id, err);
      return null;
    }
  }

  private clipsFor(id: string, vrm: VRM): VrmClips {
    let c = this.clips.get(id);
    if (c) return c;
    const src = this.mannequin;
    const find = (n: string) => src?.animations.find((a) => a.name === n);
    c = {};
    if (src) {
      for (const key of ['idle', 'walk', 'run'] as const) {
        const clip = find(key);
        if (clip) c[key] = retargetClip(clip, src, vrm);
      }
    }
    this.clips.set(id, c);
    return c;
  }
}
