import { BUILTIN_AVATARS, LOOKS, sanitizeName } from '@kahvehane/shared';
import { AVATAR_LABELS } from '../avatar/library';
import { modelBytes } from './avatarFile';

export interface JoinChoice { name: string; look: string; avatar: string }

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

/** Uploads a .vrm/.glb (or the model inside a .zip) to the game server; resolves to its avatar id or throws a Turkish message. */
export async function uploadAvatar(file: File, serverHttp: string): Promise<string> {
  const bytes = await modelBytes(file);
  if (bytes.length > 30 * 1024 * 1024) throw new Error('Model 30 MB’tan büyük.');
  let res: Response;
  try {
    res = await fetch(`${serverHttp}/avatars`, { method: 'POST', body: new Blob([bytes as BlobPart]), headers: { 'content-type': 'application/octet-stream' } });
  } catch {
    throw new Error('Sunucuya ulaşılamadı (çevrimdışı).');
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !body.id) throw new Error(body.error ?? 'Yükleme başarısız.');
  return body.id;
}

/** Join screen: name, avatar (anime VRMs, mannequin, own upload) and colour. */
export function showJoin(root: HTMLElement, message = '', serverHttp = ''): Promise<JoinChoice> {
  return new Promise((resolve) => {
    let look = remembered('kh.look') ?? LOOKS[0].id;
    if (!LOOKS.some((l) => l.id === look)) look = LOOKS[0].id;
    let avatar = remembered('kh.avatar') ?? 'twist';
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
    input.maxLength = 20;
    input.setAttribute('autocomplete', 'nickname');
    input.value = remembered('kh.name') ?? '';

    const avatarsLabel = document.createElement('h3');
    avatarsLabel.textContent = 'Karakter';
    const avatars = document.createElement('div');
    avatars.className = 'join__avatars';
    const select = (id: string) => {
      avatar = id;
      avatars.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
    };
    const addCard = (id: string, label: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'join__avatar';
      b.dataset.id = id;
      b.textContent = label;
      b.addEventListener('click', () => select(id));
      avatars.insertBefore(b, avatars.querySelector('.join__upload'));
      return b;
    };
    const upload = document.createElement('label');
    upload.className = 'join__avatar join__upload';
    upload.textContent = 'Kendi modelin… (.vrm / .glb / .zip)';
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.vrm,.glb,.zip';
    file.hidden = true;
    upload.append(file);
    avatars.append(upload);
    for (const id of BUILTIN_AVATARS) addCard(id, AVATAR_LABELS[id] ?? id);
    if (avatar.startsWith('custom:')) addCard(avatar, 'Benim avatarım');
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      note.textContent = 'Yükleniyor…';
      try {
        const id = await uploadAvatar(f, serverHttp);
        avatars.querySelectorAll('[data-id^="custom:"]').forEach((el) => el.remove());
        addCard(id, 'Benim avatarım');
        select(id);
        note.textContent = 'Avatarın yüklendi.';
      } catch (err) {
        note.textContent = err instanceof Error ? err.message : 'Yükleme başarısız.';
      }
      file.value = '';
    });
    if (![...avatars.querySelectorAll<HTMLButtonElement>('button')].some((b) => b.dataset.id === avatar)) avatar = 'twist';
    select(avatar);

    const looksLabel = document.createElement('h3');
    looksLabel.textContent = 'Renk (isim etiketi ve manken)';
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
    const credit = document.createElement('p');
    credit.className = 'join__credit';
    credit.textContent = 'Aiko: pixiv VRM örnek modeli';
    card.append(title, note, input, avatarsLabel, avatars, looksLabel, swatches, go, credit);
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
      remember('kh.avatar', avatar);
      wrap.remove();
      resolve({ name, look, avatar });
    });
    wrap.append(card);
    root.append(wrap);
    input.focus();
  });
}
