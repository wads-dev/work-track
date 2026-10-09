import { it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSplitTool } from './split-tool.js';
import { SplitError } from '../domain/split.js';
it('registers split_record preview-safe instructions and injects only trusted UID', async () => {
  const registerTool = vi.fn();
  const splitRecord = vi
    .fn()
    .mockResolvedValue({ confirmed: false, parts: [] });
  registerSplitTool(
    { registerTool } as unknown as McpServer,
    { splitRecord },
    'trusted',
  );
  expect(registerTool.mock.calls[0]![0]).toBe('split_record');
  const descriptor = registerTool.mock.calls[0]![1] as { description: string };
  expect(descriptor.description).toContain('confirmação humana');
  const callback = registerTool.mock.calls[0]![2] as (
    input: unknown,
  ) => Promise<unknown>;
  const input = { recordId: 'own' };
  await callback(input);
  expect(splitRecord).toHaveBeenCalledWith(input, 'trusted');
  splitRecord.mockRejectedValueOnce(
    new SplitError('aborted', 'Prévia desatualizada'),
  );
  expect(await callback(input)).toMatchObject({
    isError: true,
    content: [
      {
        text: JSON.stringify({
          error: 'aborted',
          message: 'Prévia desatualizada',
        }),
      },
    ],
  });
});
