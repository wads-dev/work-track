import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('retains the deployed callable alias without reintroducing the legacy MCP tool', () => {
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
  expect(entry).toContain('export const moveSubject = moveTopic;');
  expect(tools).toContain("'move_topic'");
  expect(tools).not.toContain("'move_subject'");
});
