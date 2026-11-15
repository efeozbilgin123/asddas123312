import { LOOKS, sanitizeName } from '@kahvehane/shared';

export interface JoinChoice { name: string; look: string }

function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

/** Join screen: name + look. Resolves when the player presses "İçeri gir". */
export function showJoin(root: HTMLElement, message = ''): Promise<JoinChoice> {
  return new Promise((resolve) => {
    let look = remembered('kh.look') ?? LOOKS[0].id;
    if (!LOOKS.some((l) => l.id === look)) look = LOOKS[0].id;
    const wrap = document.createElement('div');
    wrap.className = 'join';
    const card = document.createElement('form');
    card.className = 'join__card';
    const title = document.createElement('h1');
    title.textContent = 'Kahvehaneye hoş geldin';
    const note = document.createElement('p');
    note.className = 'join__note';
    note.textContent = message;
    const input = document.createElement('input');
    input.className = 'join__name';
    input.placeholder = 'Adın';
    input.maxLength = 40;
    input.setAttribute('autocomplete', 'nickname');
    input.value = remembered('kh.name') ?? '';
    const swatches = document.createElement('div');
    swatches.className = 'join__looks';
    for (const l of LOOKS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'join__look';
      b.style.setProperty('--c', l.color);
      b.title = l.label;
      b.setAttribute('aria-label', l.label);
      b.classList.toggle('on', l.id === look);
      b.addEventListener('click', () => {
        look = l.id;
        swatches.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      });
      swatches.append(b);
    }
    const go = document.createElement('button');
    go.type = 'submit';
    go.className = 'hud-btn join__go';
    go.textContent = 'İçeri gir';
    card.append(title, note, input, swatches, go);
    card.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = sanitizeName(input.value);
      if (!name) {
        note.textContent = 'Bir isim yaz';
        input.focus();
        return;
      }
      remember('kh.name', name);
      remember('kh.look', look);
      wrap.remove();
      resolve({ name, look });
    });
    wrap.append(card);
    root.append(wrap);
    input.focus();
  });
}
