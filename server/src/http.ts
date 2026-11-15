import express from 'express';
import { matchMaker } from '@colyseus/core';
import { RateLimiter, ROOM_NAME } from '@kahvehane/shared';
import { AvatarStore, MAX_AVATAR_BYTES } from './avatarStore';

export interface HttpOptions {
  store: AvatarStore;
  clientDist: string;
  uploadLimit?: { max: number; windowMs: number };
}

/** Express app: health, avatar upload/download, and the built client. */
export function createHttpApp({ store, clientDist, uploadLimit = { max: 5, windowMs: 10 * 60_000 } }: HttpOptions): express.Express {
  const app = express();
  app.set('trust proxy', 'loopback'); // Caddy in front of us sets X-Forwarded-For
  const limiters = new Map<string, RateLimiter>();

  app.get('/health', async (_req, res) => {
    let players = 0;
    try {
      const rooms = await matchMaker.query({ name: ROOM_NAME });
      players = rooms.reduce((n, r) => n + r.clients, 0);
    } catch {
      /* matchmaker not running (tests) */
    }
    res.json({ ok: true, players });
  });

  app.post('/avatars', express.raw({ type: () => true, limit: MAX_AVATAR_BYTES + 1 }), (req, res) => {
    const ip = req.ip ?? 'unknown';
    let limiter = limiters.get(ip);
    if (!limiter) limiters.set(ip, (limiter = new RateLimiter(uploadLimit.max, uploadLimit.windowMs)));
    if (!limiter.allow(Date.now())) return void res.status(429).json({ error: 'Çok fazla yükleme, biraz sonra dene.' });
    const result = store.save(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
    if ('error' in result) {
      return void res
        .status(result.error === 'too-big' ? 413 : 400)
        .json({ error: result.error === 'too-big' ? 'Dosya 30 MB’tan büyük.' : 'Bu bir VRM dosyası değil.' });
    }
    res.json({ id: result.id });
  });

  app.get('/avatars/:file', (req, res) => {
    const m = /^([0-9a-f]{64})\.vrm$/.exec(req.params.file ?? '');
    const file = m ? store.file(m[1]!) : null;
    if (!file || !store.has(m![1]!)) return void res.status(404).end();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('application/octet-stream').sendFile(file);
  });

  // body-parser's 413 for oversized uploads
  app.use((err: { status?: number }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.status === 413) return void res.status(413).json({ error: 'Dosya 30 MB’tan büyük.' });
    next(err);
  });

  app.use(express.static(clientDist));
  return app;
}
