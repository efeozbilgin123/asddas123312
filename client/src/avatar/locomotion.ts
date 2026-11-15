import * as THREE from 'three';

/** Speed at which the walk / run clips look right when played at normal tempo (m/s). */
const WALK_NATURAL = 1.45;
const RUN_NATURAL = 3.6;
const WALK_FULL = 1.6;
const RUN_FULL = 3.2;
const IDLE_END = 0.7;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

export interface Locomotion { idle: number; walk: number; run: number; walkScale: number; runScale: number }

/** Blend weights for idle/walk/run at a speed, plus clip tempos matched to the ground speed. */
export function locomotion(speed: number): Locomotion {
  const v = Math.max(0, speed);
  let idle = 0;
  let walk = 0;
  let run = 0;
  if (v <= IDLE_END) {
    const t = smooth(v / IDLE_END);
    idle = 1 - t;
    walk = t;
  } else if (v <= WALK_FULL) {
    walk = 1;
  } else {
    const t = smooth(clamp((v - WALK_FULL) / (RUN_FULL - WALK_FULL), 0, 1));
    walk = 1 - t;
    run = t;
  }
  return {
    idle,
    walk,
    run,
    walkScale: clamp(v / WALK_NATURAL, 0.55, 1.6),
    runScale: clamp(v / RUN_NATURAL, 0.7, 1.3)
  };
}


/** Plays idle/walk/run together and blends them by speed (shared by every avatar kind). */
export class LocomotionMixer {
  private readonly actions: Partial<Record<'idle' | 'walk' | 'run', THREE.AnimationAction>> = {};
  private w = { idle: 1, walk: 0, run: 0 };

  constructor(readonly mixer: THREE.AnimationMixer, clips: Partial<Record<'idle' | 'walk' | 'run', THREE.AnimationClip>>) {
    for (const key of ['idle', 'walk', 'run'] as const) {
      const c = clips[key];
      if (!c) continue;
      const a = mixer.clipAction(c);
      a.setEffectiveWeight(key === 'idle' ? 1 : 0);
      a.play();
      this.actions[key] = a;
    }
  }

  update(speed: number, sitting: boolean, dt: number): void {
    const target = sitting ? { ...locomotion(0) } : locomotion(speed);
    if (!this.actions.run) {
      target.walk += target.run;
      target.run = 0;
    }
    const k = 1 - Math.exp(-dt * 10); // ease weight changes
    for (const key of ['idle', 'walk', 'run'] as const) {
      this.w[key] += (target[key] - this.w[key]) * k;
      this.actions[key]?.setEffectiveWeight(this.w[key]);
    }
    if (this.actions.walk) this.actions.walk.timeScale = target.walkScale;
    if (this.actions.run) this.actions.run.timeScale = target.runScale;
    this.mixer.update(dt);
  }
}

/** Smoothly follows a target position/yaw; big jumps (sitting down, standing up) glide over ~0.4 s. */
export class DisplaySmoother {
  x = NaN;
  z = NaN;
  yaw = 0;

  update(x: number, z: number, yaw: number, dt: number): void {
    if (Number.isNaN(this.x)) {
      this.x = x;
      this.z = z;
      this.yaw = yaw;
      return;
    }
    const far = Math.hypot(x - this.x, z - this.z) > 0.25;
    const k = 1 - Math.exp(-dt * (far ? 7 : 18));
    this.x += (x - this.x) * k;
    this.z += (z - this.z) * k;
    let d = (yaw - this.yaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * (1 - Math.exp(-dt * 12));
  }
}
