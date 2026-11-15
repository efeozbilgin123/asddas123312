import * as THREE from 'three';
import { ROOM, WINDOW } from '@kahvehane/shared';
import type { QualityPreset } from './quality';

export interface Weather {
  object: THREE.Object3D;
  update(dt: number): void;
}

/** Snow falling outside the back-wall window. */
export function createSnow(q: QualityPreset): Weather {
  const n = q.snowCount;
  const pos = new Float32Array(n * 3);
  const speed = new Float32Array(n);
  const x0 = WINDOW.x - WINDOW.width * 1.5, x1 = WINDOW.x + WINDOW.width * 1.5;
  const y0 = 0, y1 = ROOM.height + 1;
  const z0 = -ROOM.depth / 2 - 0.3, z1 = -ROOM.depth / 2 - 3;
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x0 + Math.random() * (x1 - x0);
    pos[i * 3 + 1] = y0 + Math.random() * (y1 - y0);
    pos[i * 3 + 2] = z0 + Math.random() * (z1 - z0);
    speed[i] = 0.35 + Math.random() * 0.45;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: '#ffffff', size: 0.035, transparent: true, opacity: 0.9, depthWrite: false })
  );
  let t = 0;
  return {
    object: points,
    update(dt: number) {
      t += dt;
      for (let i = 0; i < n; i++) {
        pos[i * 3 + 1]! -= speed[i]! * dt;
        pos[i * 3]! += Math.sin(t * 0.8 + i) * 0.05 * dt;
        if (pos[i * 3 + 1]! < y0) pos[i * 3 + 1] = y1;
      }
      geo.attributes.position!.needsUpdate = true;
    }
  };
}
