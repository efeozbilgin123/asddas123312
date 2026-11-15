import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const MAX_AVATAR_BYTES = 30 * 1024 * 1024;
const HASH = /^[0-9a-f]{64}$/;

export type SaveResult = { id: string; hash: string } | { error: 'not-vrm' | 'too-big' };

/** Uploaded VRM avatars on disk, named by their sha256; oldest files are evicted past maxFiles. */
export class AvatarStore {
  private readonly maxFiles: number;

  constructor(private readonly dir: string, opts: { maxFiles?: number } = {}) {
    this.maxFiles = opts.maxFiles ?? 200;
    mkdirSync(dir, { recursive: true });
  }

  save(buf: Buffer): SaveResult {
    if (buf.length > MAX_AVATAR_BYTES) return { error: 'too-big' };
    if (buf.length < 20 || buf.toString('ascii', 0, 4) !== 'glTF') return { error: 'not-vrm' };
    const hash = createHash('sha256').update(buf).digest('hex');
    const file = this.file(hash)!;
    if (!existsSync(file)) {
      writeFileSync(file, buf);
      this.evict();
    }
    return { id: `custom:${hash}`, hash };
  }

  has(hash: string): boolean {
    const f = this.file(hash);
    return f !== null && existsSync(f);
  }

  /** Absolute path for a valid hash, else null (never builds paths from untrusted input). */
  file(hash: string): string | null {
    return HASH.test(hash) ? path.join(this.dir, `${hash}.vrm`) : null;
  }

  count(): number {
    return readdirSync(this.dir).filter((f) => f.endsWith('.vrm')).length;
  }

  private evict(): void {
    const files = readdirSync(this.dir)
      .filter((f) => f.endsWith('.vrm'))
      .map((f) => ({ f, t: statSync(path.join(this.dir, f)).mtimeMs }))
      .sort((a, b) => a.t - b.t);
    while (files.length > this.maxFiles) unlinkSync(path.join(this.dir, files.shift()!.f));
  }
}
