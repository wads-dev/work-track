import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('exports only canonical topic callable after legacy retirement', () => {
  const entry = readFileSync(
    new URL('../../index.ts', import.meta.url),
    'utf8',
  );
  const tools = readFileSync(
    new URL(
      '../../modules/registration/presentation/record-movement.ts',
      import.meta.url,
    ),
    'utf8',
  );
  expect(entry).not.toContain('export const moveSubject');
  expect(entry).not.toContain('export const api');
  expect(entry).toContain('export const mcp');
  expect(tools).toContain("'move_topic'");
  expect(tools).not.toContain("'move_subject'");
});
