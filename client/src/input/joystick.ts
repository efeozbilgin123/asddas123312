import type { MoveInput } from '../avatar/controller';

/** Drag offset in pixels → movement vector (screen right = +x, screen down = +z). */
export function joystickVector(dx: number, dy: number, radius: number, deadzone = 0.15): MoveInput {
  const len = Math.hypot(dx, dy) / radius;
  if (len < deadzone) return { x: 0, z: 0, run: false };
  const m = Math.min(1, len);
  const k = m / (len * radius);
  return { x: dx * k, z: dy * k, run: m > 0.9 };
}

/**
 * Rotates screen-space input into world space. `cameraYaw` is the orbit yaw:
 * the camera sits at target + (sin yaw, cos yaw) · distance, so "forward" is −(sin yaw, cos yaw).
 */
export function cameraRelative(input: MoveInput, cameraYaw: number): MoveInput {
  const c = Math.cos(cameraYaw);
  const s = Math.sin(cameraYaw);
  return { x: input.x * c + input.z * s, z: -input.x * s + input.z * c, run: input.run };
}

const BASE = 120;

/** On-screen joystick for touch devices (bottom-left). */
export class TouchJoystick {
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private pointer: number | null = null;
  private origin = { x: 0, y: 0 };
  private value: MoveInput = { x: 0, z: 0, run: false };

  constructor(container: HTMLElement) {
    this.base = document.createElement('div');
    this.base.className = 'joystick';
    this.knob = document.createElement('div');
    this.knob.className = 'joystick__knob';
    this.base.append(this.knob);
    container.append(this.base);
    this.base.hidden = !matchMedia('(pointer: coarse)').matches;
    this.base.addEventListener('pointerdown', this.down);
    addEventListener('pointermove', this.move);
    addEventListener('pointerup', this.up);
    addEventListener('pointercancel', this.up);
  }

  private down = (e: PointerEvent) => {
    e.preventDefault();
    this.pointer = e.pointerId;
    const r = this.base.getBoundingClientRect();
    this.origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    this.move(e);
  };

  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pointer) return;
    const dx = e.clientX - this.origin.x;
    const dy = e.clientY - this.origin.y;
    const radius = BASE / 2;
    this.value = joystickVector(dx, dy, radius);
    const len = Math.hypot(dx, dy);
    const k = len > radius ? radius / len : 1;
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  };

  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointer) return;
    this.pointer = null;
    this.value = { x: 0, z: 0, run: false };
    this.knob.style.transform = '';
  };

  get visible(): boolean {
    return !this.base.hidden;
  }

  read(): MoveInput {
    return this.value;
  }

  dispose(): void {
    removeEventListener('pointermove', this.move);
    removeEventListener('pointerup', this.up);
    removeEventListener('pointercancel', this.up);
    this.base.remove();
  }
}
