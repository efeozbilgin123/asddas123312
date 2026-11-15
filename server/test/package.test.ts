import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('server declares everything it imports at runtime (npm start must work on a clean install)', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const dep of ['@colyseus/core', '@colyseus/ws-transport', '@colyseus/schema', 'express', 'tsx', '@kahvehane/shared']) {
    expect(pkg.dependencies?.[dep], dep).toBeTruthy();
  }
});
