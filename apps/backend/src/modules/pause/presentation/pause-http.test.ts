import { expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../core/http/app.js';
import { WorkTrackOAuth } from '../../../core/auth/application/oauth-provider.js';
import type { OAuthStore } from '../../../core/auth/domain/oauth-store.js';
import { workInstructions } from '../../registration/presentation/instructions.js';
it('exposes pause over authenticated MCP HTTP, preserves daily wiring, rejects UID injection', async () => {
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
  const registerPause = vi.fn().mockResolvedValue({ sourceRecordId: 's' });
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
    { registerPause },
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
  expect(listed.result.tools.map((t) => t.name)).toContain('register_pause');
  expect(listed.result.tools.map((t) => t.name)).toContain('get_daily_hours');
  expect(
    listed.result.tools.find((t) => t.name === 'register_pause')!.description,
  ).toContain('Vou pausar');
  const args = {
    resumedAt: '2026-10-09T15:00:00Z',
    durationMinutes: 30,
    requestId: 'r',
    reason: 'Almoço',
    originalUtterance: 'Pausei30min',
  };
  await mcp('tools/call', {
    name: 'register_pause',
    arguments: { ...args, uid: 'bob' },
  });
  expect(registerPause).not.toHaveBeenCalled();
  await mcp('tools/call', { name: 'register_pause', arguments: args });
  expect(registerPause).toHaveBeenCalledWith(args, 'alice');
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
  expect(missing.result.tools.some((t) => t.name === 'register_pause')).toBe(
    false,
  );
  expect(workInstructions).toContain('Frase futura');
  expect(workInstructions).toContain('update_record');
});
