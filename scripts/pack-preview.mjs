// Builds preview/ from client/dist for static hosts that refuse .bin/.gltf/.glb/.hdr files:
// 1k assets only; those file types are base64-packed into JS chunks (< 15 MB each) that set
// window.__KH_PACK before the app starts (see installPackResolver in client/src/world/assets.ts).
import { cp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'client/dist');
const out = path.join(root, 'preview');
const PACKED = /\.(bin|gltf|glb|hdr)$/;
const CHUNK = 15e6;

await rm(out, { recursive: true, force: true });
await cp(dist, out, { recursive: true, filter: (src) => (!/_2k\./.test(src) || src.includes(`${path.sep}rug${path.sep}`)) && !src.includes(`${path.sep}legacy`) });

async function walk(dir) {
  const files = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(p)));
    else files.push(p);
  }
  return files;
}

const packed = (await walk(out)).filter((f) => PACKED.test(f));
const chunks = [];
let current = {};
let size = 0;
for (const file of packed) {
  const key = path.relative(out, file).split(path.sep).join('/');
  const b64 = (await readFile(file)).toString('base64');
  if (size + b64.length > CHUNK && size > 0) {
    chunks.push(current);
    current = {};
    size = 0;
  }
  current[key] = b64;
  size += b64.length;
  await rm(file);
}
if (size > 0) chunks.push(current);

const tags = [];
for (let i = 0; i < chunks.length; i++) {
  const name = `assets/pack-${i}.js`;
  await writeFile(path.join(out, name), `window.__KH_PACK=Object.assign(window.__KH_PACK||{},${JSON.stringify(chunks[i])});\n`);
  tags.push(`<script src="./${name}"></script>`);
}
const indexPath = path.join(out, 'index.html');
const html = await readFile(indexPath, 'utf8');
await writeFile(indexPath, html.replace('<script type="module"', `${tags.join('\n  ')}\n  <script type="module"`));

const all = await walk(out);
let total = 0;
for (const f of all) total += (await stat(f)).size;
console.log(`preview: ${all.length} files, ${(total / 1e6).toFixed(1)} MB, ${chunks.length} pack chunk(s), ${packed.length} files packed`);
