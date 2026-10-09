import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../core/http/app.js';
import { WorkTrackOAuth } from '../../../core/auth/application/oauth-provider.js';
import type { OAuthStore } from '../../../core/auth/domain/oauth-store.js';
function setup(authUid = 'alice') {
  const store = {} as OAuthStore;
  const identity = {
    uid: authUid,
    email: 'alice@wads.dev',
    emailVerified: true,
    provider: 'google.com',
    validAfter: 0,
  };
  const provider = new WorkTrackOAuth(
    store,
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
    extra: { uid: authUid },
  });
  const loadOwnHistory = vi
    .fn()
    .mockResolvedValue({ records: [], projects: new Map() });
  const app = createApp(provider, undefined, undefined, undefined, undefined, {
    loadOwnHistory,
  });
  const mcp = (method: string, params?: unknown) =>
    request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer valid')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method, params });
  return { app, mcp, loadOwnHistory };
}
describe('authenticated read-only get_daily_hours MCP', () => {
  it('advertises defaults and read-only annotations with no UID parameter', async () => {
    const { mcp, app, loadOwnHistory } = setup();
    expect((await request(app).post('/mcp').send({})).status).toBe(401);
    const listed = await mcp('tools/list');
    expect(listed.status).toBe(200);
    const body = listed.body as {
      result: {
        tools: {
          name: string;
          inputSchema: { properties: Record<string, unknown> };
          annotations: unknown;
        }[];
      };
    };
    const tool = body.result.tools.find((t) => t.name === 'get_daily_hours')!;
    expect(tool.inputSchema.properties).not.toHaveProperty('uid');
    expect(tool.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    const result = (
      await mcp('tools/call', {
        name: 'get_daily_hours',
        arguments: { date: '2026-10-09' },
      })
    ).body as { result: { content: { text: string }[]; isError?: boolean } };
    expect(result.result.isError).not.toBe(true);
    expect(JSON.parse(result.result.content[0]!.text) as unknown).toMatchObject(
      {
        date: '2026-10-09',
        timeZone: 'America/Sao_Paulo',
        includeArchived: true,
        closedMinutes: 0,
        estimatedMinutes: 0,
      },
    );
    expect(loadOwnHistory).toHaveBeenCalledWith('alice', undefined);
  });
  it('rejects UID substitution and malformed dates before repository reads', async () => {
    const { mcp, loadOwnHistory } = setup();
    for (const args of [
      { date: '2026-10-09', uid: 'bob' },
      { date: '2026-02-30' },
      { date: '2026-10-09', timeZone: 'bad-zone' },
    ]) {
      const body = (
        await mcp('tools/call', { name: 'get_daily_hours', arguments: args })
      ).body as { result?: { isError?: boolean }; error?: unknown };
      expect(Boolean(body.error || body.result?.isError)).toBe(true);
    }
    expect(loadOwnHistory).not.toHaveBeenCalled();
  });
  it('does not register tool without valid authenticated UID', async () => {
    const { mcp } = setup('');
    const body = (await mcp('tools/list')).body as {
      result: { tools: { name: string }[] };
    };
    expect(body.result.tools.some((t) => t.name === 'get_daily_hours')).toBe(
      false,
    );
  });
});
