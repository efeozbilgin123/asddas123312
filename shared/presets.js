export const PRESET_AVATAR_COUNT = 16;

export const BOT_NAME_POOL = Object.freeze([
  'Serhat',
  'Arhan',
  'Hasan',
  'Eray',
  'Arda Baz',
  'Kubilay',
  'Samet',
  'Gay Durukan',
  'Emir Yılmaz',
  'Emre Mencik',
  'Zeynep'
]);

export function isPresetAvatar(val) {
  const s = String(val || '').trim();
  const match = /^avatar-(\d+)$/.exec(s);
  if (!match) return false;
  const num = Number(match[1]);
  return Number.isInteger(num) && num >= 1 && num <= PRESET_AVATAR_COUNT;
}

export function normalizePresetAvatar(val, fallbackIdx = 0) {
  const s = String(val || '').trim();
  if (isPresetAvatar(s)) return s;
  return `avatar-${(fallbackIdx % PRESET_AVATAR_COUNT) + 1}`;
}

export function pickRandomBotName(excludeNames = [], rng = Math.random) {
  const taken = new Set(
    excludeNames
      .filter(Boolean)
      .map((name) => String(name).trim().toLocaleLowerCase('tr-TR'))
  );
  const available = BOT_NAME_POOL.filter(
    (name) => !taken.has(name.toLocaleLowerCase('tr-TR'))
  );
  const candidates = available.length > 0 ? available : BOT_NAME_POOL;
  const idx = Math.floor(rng() * candidates.length) % candidates.length;
  return candidates[idx];
}

export function pickRandomBotAvatar(excludeAvatars = [], rng = Math.random) {
  const taken = new Set(excludeAvatars.filter(Boolean).map((a) => String(a).trim()));
  const all = [];
  for (let i = 1; i <= PRESET_AVATAR_COUNT; i += 1) {
    all.push(`avatar-${i}`);
  }
  const available = all.filter((id) => !taken.has(id));
  const candidates = available.length > 0 ? available : all;
  const idx = Math.floor(rng() * candidates.length) % candidates.length;
  return candidates[idx];
}
