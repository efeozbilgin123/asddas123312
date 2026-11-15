import { expect, test } from 'vitest';
import { PLACEMENTS } from '@kahvehane/shared';
import { MANIFEST } from '../src/world/manifest';

test('every placement asset id exists in MANIFEST', () => {
  const ids = new Set(MANIFEST.map((m) => m.id));
  for (const p of PLACEMENTS) expect(ids.has(p.asset), p.asset).toBe(true);
});
