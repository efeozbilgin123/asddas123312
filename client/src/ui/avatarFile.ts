import { unzipSync } from 'fflate';

const isGlb = (b: Uint8Array) => b.length >= 20 && b[0] === 0x67 && b[1] === 0x6c && b[2] === 0x54 && b[3] === 0x46;

/** The model inside a zip: the first binary .vrm, else the first binary .glb; null if none. */
export function modelFromZip(zip: Uint8Array): { name: string; bytes: Uint8Array } | null {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip, { filter: (f) => /\.(vrm|glb)$/i.test(f.name) });
  } catch {
    return null;
  }
  const names = Object.keys(files).sort();
  for (const ext of ['.vrm', '.glb']) {
    const hit = names.find((n) => n.toLowerCase().endsWith(ext) && isGlb(files[n]!));
    if (hit) return { name: hit, bytes: files[hit]! };
  }
  return null;
}

/** Turns a picked file (.vrm, .glb or .zip) into the model bytes to upload, or throws a Turkish message. */
export async function modelBytes(file: File): Promise<Uint8Array> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (/\.zip$/i.test(file.name)) {
    const m = modelFromZip(buf);
    if (!m) throw new Error('Zip içinde .vrm ya da .glb bulunamadı.');
    return m.bytes;
  }
  if (/\.7z(\.\d+)?$/i.test(file.name)) throw new Error('7z desteklenmiyor; .zip, .glb ya da .vrm yükle.');
  if (!isGlb(buf)) throw new Error('Bu bir .vrm/.glb dosyası değil.');
  return buf;
}
