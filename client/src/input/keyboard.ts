import type { MoveInput } from '@kahvehane/shared';

const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight']
};

/** WASD/arrows + Shift to run; E fires the interact callback. */
export class KeyboardInput {
  private readonly down = new Set<string>();
  private readonly interact: Array<() => void> = [];

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }

  private isTyping(): boolean {
    const el = document.activeElement;
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  }

  private onDown = (e: KeyboardEvent) => {
    if (this.isTyping()) return;
    if (e.code === 'KeyE' && !e.repeat) this.interact.forEach((cb) => cb());
    this.down.add(e.code);
  };

  private onUp = (e: KeyboardEvent) => this.down.delete(e.code);
  private onBlur = () => this.down.clear();

  private any(codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  onInteract(cb: () => void): void {
    this.interact.push(cb);
  }

  read(): MoveInput {
    const x = (this.any(KEYS.right) ? 1 : 0) - (this.any(KEYS.left) ? 1 : 0);
    const z = (this.any(KEYS.back) ? 1 : 0) - (this.any(KEYS.forward) ? 1 : 0);
    return { x, z, run: this.any(KEYS.run) };
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onDown);
    this.target.removeEventListener('keyup', this.onUp);
    this.target.removeEventListener('blur', this.onBlur);
  }
}
