import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('delegates open/alert/deletion selection to repository without duplicate view selection', () => {
  const source = readFileSync(
    new URL('./PendingPage.tsx', import.meta.url),
    'utf8',
  );
  expect(source).toContain('openOnly: true');
  expect(source).toContain('alertOnly: true');
  expect(source).toContain('pending.total');
  expect(source).not.toContain('.filter(');
  expect(source).not.toContain('onSnapshot');
  expect(source).not.toContain('8 * 3600000');
});
