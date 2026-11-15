// Downloads every Poly Haven asset listed in client/src/world/manifest.ts into
// client/public/assets and regenerates CREDITS.md. Re-runs skip existing files.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(root, 'client/public/assets');
const RESOLUTIONS = ['1k', '2k'];
const TEXTURE_MAPS = { Diffuse: 'diff', nor_gl: 'nor_gl', Rough: 'rough', AO: 'ao' };

async function readManifest() {
  const src = await readFile(path.join(root, 'client/src/world/manifest.ts'), 'utf8');
  const entries = [];
  for (const m of src.matchAll(/model\('([^']+)'/g)) entries.push({ id: m[1], kind: 'model' });
  for (const m of src.matchAll(/texture\('([^']+)'\)/g)) entries.push({ id: m[1], kind: 'texture' });
  for (const m of src.matchAll(/\{ id: '([^']+)', kind: 'hdri', source: 'polyhaven' \}/g)) entries.push({ id: m[1], kind: 'hdri' });
  return entries;
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

let downloaded = 0;
async function download(url, file) {
  if (await exists(file)) return;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      downloaded += 1;
      return;
    } catch (err) {
      if (attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

async function fetchEntry(entry) {
  const files = await getJson(`https://api.polyhaven.com/files/${entry.id}`);
  for (const res of RESOLUTIONS) {
    if (entry.kind === 'model') {
      const g = files.gltf[res].gltf;
      const dir = path.join(assetsDir, 'models', entry.id);
      await download(g.url, path.join(dir, `${entry.id}_${res}.gltf`));
      for (const [rel, inc] of Object.entries(g.include ?? {})) {
        await download(inc.url, path.join(dir, rel));
      }
    } else if (entry.kind === 'texture') {
      for (const [key, short] of Object.entries(TEXTURE_MAPS)) {
        const f = files[key]?.[res]?.jpg;
        if (f) await download(f.url, path.join(assetsDir, 'textures', entry.id, `${entry.id}_${short}_${res}.jpg`));
      }
    } else {
      await download(files.hdri[res].hdr.url, path.join(assetsDir, 'hdri', `${entry.id}_${res}.hdr.bin`));
    }
  }
  const info = await getJson(`https://api.polyhaven.com/info/${entry.id}`);
  return `| ${info.name} | ${Object.keys(info.authors).join(', ')} | https://polyhaven.com/a/${entry.id} | CC0 |`;
}

const entries = await readManifest();
const rows = [];
for (const entry of entries) {
  process.stdout.write(`${entry.kind.padEnd(8)} ${entry.id}\n`);
  rows.push(await fetchEntry(entry));
}
rows.sort();
const own = ['| Kilim dokusu | Kahvehane (kendi çalışmamız) | scripts/make-kilim.mjs | CC0 |'];
await writeFile(
  path.join(root, 'CREDITS.md'),
  `# Varlık atıfları\n\n| Varlık | Yazar | Kaynak | Lisans |\n|---|---|---|---|\n${[...rows, ...own].join('\n')}\n`
);
console.log(`done: ${entries.length} assets, ${downloaded} files downloaded`);
