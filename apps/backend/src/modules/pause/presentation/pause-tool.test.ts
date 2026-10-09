import { expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPauseTool } from './pause-tool.js';
import { PauseError, pauseInput, type PauseInput } from '../domain/pause.js';
it('registers strict retrospective tool using trusted OAuth UID only', async () => {
  let callback: ((input: PauseInput) => Promise<unknown>) | undefined;
  const registerTool = vi.fn(
    (_name: string, _config: unknown, cb: typeof callback) => {
      callback = cb;
    },
  );
  const registerPause = vi.fn(() =>
    Promise.resolve({
      sourceRecordId: 's',
      successorRecordId: 'n',
      pausedAt: '2026-10-09T14:30:00Z',
      resumedAt: '2026-10-09T15:00:00Z',
      durationMinutes: 30,
      auditId: 'audit',
    }),
  );
  registerPauseTool(
    { registerTool } as unknown as McpServer,
    { registerPause },
    'trusted',
  );
  const input = pauseInput.parse({
    resumedAt: '2026-10-09T15:00:00Z',
    durationMinutes: 30,
    requestId: 'r',
    reason: 'Almoço',
    originalUtterance: 'Pausei30min',
  });
  await callback!(input);
  expect(registerPause).toHaveBeenCalledWith(input, 'trusted');
  expect(pauseInput.safeParse({ ...input, uid: 'foreign' }).success).toBe(
    false,
  );
  expect(registerTool.mock.calls[0]![0]).toBe('register_pause');
});
it('returns neutral ambiguity candidates and no internal exception data', async () => {
  let callback: ((input: PauseInput) => Promise<unknown>) | undefined;
  const registerTool = (
    _name: string,
    _config: unknown,
    cb: typeof callback,
  ) => {
    callback = cb;
  };
  const registerPause = vi.fn(() =>
    Promise.reject(
      new PauseError('failed-precondition', 'Escolha registro', [
        { recordId: 'a', startedAt: 'date' },
      ]),
    ),
  );
  registerPauseTool(
    { registerTool } as unknown as McpServer,
    { registerPause },
    'uid',
  );
  const result = await callback!({} as PauseInput);
  expect(JSON.stringify(result)).toContain('candidates');
  registerPause.mockImplementation(() =>
    Promise.reject(new Error('Secret DB details')),
  );
  expect(JSON.stringify(await callback!({} as PauseInput))).not.toContain(
    'Secret',
  );
});
