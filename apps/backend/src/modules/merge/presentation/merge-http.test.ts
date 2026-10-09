import { expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../core/http/app.js';
import { WorkTrackOAuth } from '../../../core/auth/application/oauth-provider.js';
import type { OAuthStore } from '../../../core/auth/domain/oauth-store.js';
import { workInstructions } from '../../registration/presentation/instructions.js';
it('exposes merge over authenticated MCP HTTP, preserves daily wiring, rejects UID injection', async () => {
  const identity = {
    uid: 'alice',
    email: 'alice@wads.dev',
    emailVerified: true,
    provider: 'google.com',
    validAfter: 0,
  };
  const provider = new WorkTrackOAuth(
    {} as OAuthStore,
    {
      verify: () => Promise.resolve(identity),
      get: () => Promise.resolve(identity),
    },
    'https://wadsworktrack.web.app',
  );
  vi.spyOn(provider, 'verifyAccessToken').mockResolvedValue({
    token: 'valid',
    clientId: 'client',
    scopes: ['mcp'],
    expiresAt: Date.now() / 1000 + 3600,
    resource: new URL('https://wadsworktrack.web.app/mcp'),
    extra: { uid: 'alice' },
  });
  const mergeRecords = vi.fn().mockResolvedValue({ recordId: 's' });
  const app = createApp(
    provider,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      loadOwnHistory: () =>
        Promise.resolve({ records: [], projects: new Map() }),
    },
    undefined,
    undefined,
    undefined,
    undefined,
    { mergeRecords },
  );
  const mcp = (method: string, params?: unknown) =>
    request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer valid')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method, params });
  expect((await request(app).post('/mcp').send({})).status).toBe(401);
  const listed = (await mcp('tools/list')).body as {
    result: { tools: { name: string; description: string }[] };
  };
  expect(listed.result.tools.map((t) => t.name)).toContain('merge_records');
  expect(listed.result.tools.map((t) => t.name)).toContain('get_daily_hours');
  expect(
    listed.result.tools.find((t) => t.name === 'merge_records')!.description,
  ).toContain('confirmação humana');
  const args = {
    sourceRecordId: 's',
    targetRecordId: 't',
    requestId: 'r',
    reason: 'Unir atividade contínua',
  };
  await mcp('tools/call', {
    name: 'merge_records',
    arguments: { ...args, uid: 'bob' },
  });
  expect(mergeRecords).not.toHaveBeenCalled();
  await mcp('tools/call', { name: 'merge_records', arguments: args });
  expect(mergeRecords).toHaveBeenCalledWith(
    { ...args, confirmed: false },
    'alice',
  );
  mergeRecords.mockClear();
  await mcp('tools/call', {
    name: 'merge_records',
    arguments: { ...args, confirmed: true },
  });
  expect(mergeRecords).not.toHaveBeenCalled();
  await mcp('tools/call', {
    name: 'merge_records',
    arguments: { ...args, confirmed: true, previewToken: '0'.repeat(64) },
  });
  expect(mergeRecords).toHaveBeenCalledWith(
    { ...args, confirmed: true, previewToken: '0'.repeat(64) },
    'alice',
  );
  vi.spyOn(provider, 'verifyAccessToken').mockResolvedValue({
    token: 'valid',
    clientId: 'client',
    scopes: ['mcp'],
    expiresAt: Date.now() / 1000 + 3600,
    resource: new URL('https://wadsworktrack.web.app/mcp'),
    extra: { uid: '' },
  });
  const missing = (await mcp('tools/list')).body as {
    result: { tools: { name: string }[] };
  };
  expect(missing.result.tools.some((t) => t.name === 'merge_records')).toBe(
    false,
  );
  expect(workInstructions).toContain('Frase futura');
  expect(workInstructions).toContain('update_record');
});
