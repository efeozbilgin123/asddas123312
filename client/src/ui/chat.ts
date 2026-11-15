import { EMOTES } from '@kahvehane/shared';

export interface ChatCallbacks {
  onSend(text: string): void;
  onEmote(id: string): void;
}

const MAX_LINES = 50;

/** Collapsible chat panel with an emote bar. Messages are rendered as text only. */
export class ChatPanel {
  readonly input: HTMLInputElement;
  private readonly log: HTMLDivElement;
  private readonly panel: HTMLDivElement;

  constructor(root: HTMLElement, cb: ChatCallbacks) {
    this.panel = document.createElement('div');
    this.panel.className = 'chat';
    const toggle = document.createElement('button');
    toggle.className = 'chat__toggle';
    toggle.textContent = 'Sohbet';
    toggle.addEventListener('click', () => this.panel.classList.toggle('closed'));
    this.log = document.createElement('div');
    this.log.className = 'chat__log';
    const form = document.createElement('form');
    form.className = 'chat__form';
    this.input = document.createElement('input');
    this.input.className = 'chat__input';
    this.input.placeholder = 'Bir şey yaz… (Enter)';
    this.input.maxLength = 400;
    form.append(this.input);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (text) cb.onSend(text);
      this.input.value = '';
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.input.blur();
      e.stopPropagation(); // typing never moves the avatar or triggers E
    });
    const emotes = document.createElement('div');
    emotes.className = 'chat__emotes';
    for (const em of EMOTES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = em.emoji;
      b.title = em.label;
      b.setAttribute('aria-label', em.label);
      b.addEventListener('click', () => cb.onEmote(em.id));
      emotes.append(b);
    }
    this.panel.append(toggle, this.log, form, emotes);
    root.append(this.panel);
    addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.activeElement !== this.input && !(document.activeElement instanceof HTMLInputElement)) {
        this.panel.classList.remove('closed');
        this.input.focus();
        e.preventDefault();
      }
    });
  }

  add(msg: { name: string; text: string; self: boolean }): void {
    const line = document.createElement('div');
    line.className = msg.self ? 'chat__line self' : 'chat__line';
    const who = document.createElement('b');
    who.textContent = `${msg.name}: `;
    const what = document.createElement('span');
    what.textContent = msg.text;
    line.append(who, what);
    this.push(line);
  }

  system(text: string): void {
    const line = document.createElement('div');
    line.className = 'chat__line system';
    line.textContent = text;
    this.push(line);
  }

  /** All visible text (used by tests). */
  text(): string {
    return this.log.textContent ?? '';
  }

  private push(line: HTMLElement): void {
    this.log.append(line);
    while (this.log.children.length > MAX_LINES) this.log.firstChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }
}
