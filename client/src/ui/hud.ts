import './hud.css';
import type { QualityName } from '../world/quality';

export type CharacterId = 'soldier';

export interface HudCallbacks {
  onSitToggle(): void;
  onQuality(q: QualityName): void;
  onCharacter(c: CharacterId): void;
}

const QUALITY_LABEL: Record<QualityName, string> = { low: 'Düşük', medium: 'Orta', high: 'Yüksek' };
const CHARACTER_LABEL: Record<CharacterId, string> = { soldier: 'Geçici karakter' };

export function readSetting<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const v = localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : null;
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the setting lasts for this visit only */
  }
}

export class Hud {
  private readonly loading: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly label: HTMLDivElement;
  readonly sitButton: HTMLButtonElement;
  private readonly hint: HTMLDivElement;

  constructor(root: HTMLElement, touch: boolean, quality: QualityName, character: CharacterId, cb: HudCallbacks) {
    this.loading = document.createElement('div');
    this.loading.className = 'loading';
    this.loading.innerHTML =
      '<div><div class="loading__text">Kahvehane hazırlanıyor… %0</div><div class="loading__bar"><div class="loading__fill"></div></div></div>';
    this.label = this.loading.querySelector('.loading__text')!;
    this.fill = this.loading.querySelector('.loading__fill')!;

    this.sitButton = document.createElement('button');
    this.sitButton.className = 'hud-btn sit-btn';
    this.sitButton.hidden = true;
    this.sitButton.addEventListener('click', () => cb.onSitToggle());

    this.hint = document.createElement('div');
    this.hint.className = 'hint';
    this.hint.textContent = touch
      ? 'Sol alttan yürü · Otur düğmesi · Sağda sürükle: bak'
      : 'WASD ile yürü · Shift koş · E otur · Fareyle sürükle: bak';
    setTimeout(() => this.hint.classList.add('gone'), 9000);

    const gear = document.createElement('button');
    gear.className = 'hud-btn gear';
    gear.textContent = 'Ayarlar';
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.hidden = true;
    gear.addEventListener('click', () => (menu.hidden = !menu.hidden));
    menu.append(
      segment('Görüntü kalitesi', QUALITY_LABEL, quality, (q) => {
        writeSetting('kh.quality', q);
        cb.onQuality(q);
      }),
      segment('Karakter', CHARACTER_LABEL, character, (c) => {
        writeSetting('kh.character', c);
        cb.onCharacter(c);
      })
    );
    root.append(this.loading, this.sitButton, this.hint, gear, menu);
  }

  progress(done: number, total: number): void {
    const pct = Math.round((done / Math.max(1, total)) * 100);
    this.label.textContent = `Kahvehane hazırlanıyor… %${pct}`;
    this.fill.style.width = `${pct}%`;
  }

  ready(): void {
    this.loading.classList.add('done');
  }

  /** null: hidden; 'sit': near a free seat; 'stand': seated. */
  sitState(state: null | 'sit' | 'stand', touch: boolean): void {
    this.sitButton.hidden = state === null;
    if (state === 'sit') this.sitButton.textContent = touch ? 'Otur' : 'Otur (E)';
    if (state === 'stand') this.sitButton.textContent = touch ? 'Kalk' : 'Kalk (E)';
  }
}

function segment<T extends string>(title: string, labels: Record<T, string>, current: T, onPick: (v: T) => void): HTMLElement {
  const wrap = document.createElement('div');
  const h = document.createElement('h3');
  h.textContent = title;
  const seg = document.createElement('div');
  seg.className = 'seg';
  for (const key of Object.keys(labels) as T[]) {
    const b = document.createElement('button');
    b.textContent = labels[key];
    b.classList.toggle('on', key === current);
    b.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      onPick(key);
    });
    seg.append(b);
  }
  wrap.append(h, seg);
  return wrap;
}
