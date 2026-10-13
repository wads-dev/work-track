import { expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../core/http/app.js';
import { WorkTrackOAuth } from '../../../core/auth/application/oauth-provider.js';
import type { OAuthStore } from '../../../core/auth/domain/oauth-store.js';
import { workInstructions } from '../presentation/instructions.js';
it('exposes movement over authenticated MCP HTTP, preserves daily wiring, rejects UID injection', async () => {
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
  const moveRecord = vi.fn().mockResolvedValue({ recordId: 's' });
  const app = createApp(
    provider,
    {
      searchRepositoryContext: vi.fn().mockResolvedValue({
        matches: [
          { projectId: 'p', topicId: 't', matchType: 'exact_repository' },
        ],
      }),
      listProjects: vi.fn().mockResolvedValue([
        {
          id: 'p',
          title: 'SH',
          description: 'Projeto',
          createdBy: 'alice',
          createdAt: '2026-10-11',
          type: 'work',
          topics: [
            {
              id: 't',
              title: 'Work Track',
              description: 'Contexto',
              githubUrl: 'https://github.com/wads-dev/work-track',
            },
          ],
        },
      ]),
      listRecentRecords: vi.fn().mockResolvedValue({
        records: [
          {
            id: 'r',
            project: { id: 'p', title: 'SH' },
            topics: [{ id: 't', title: 'Work Track' }],
            title: 'Resumo',
            startedAt: '2026-10-11T00:00:00Z',
            endedAt: null,
          },
        ],
        hasMore: false,
        nextCursor: null,
      }),
      createProject: vi.fn(),
      createTopic: vi.fn(),
      register: vi.fn(),
    },
    { updateRecord: vi.fn(), listOpenRecords: vi.fn() },
    undefined,
    undefined,
    {
      loadOwnHistory: () =>
        Promise.resolve({
          records: [],
          selectedRecords: [],
          projects: new Map(),
        }),
    },
    undefined,
    undefined,
    undefined,
    { moveRecord, moveTopic: vi.fn().mockResolvedValue({ mode: 'preview' }) },
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
  expect(listed.result.tools.map((t) => t.name)).toContain('update_record');
  expect(listed.result.tools.map((t) => t.name)).toContain('move_topic');
  const instructions = (
    await mcp('tools/call', { name: 'get_instructions', arguments: {} })
  ).body as { result: { content: Array<{ text: string }> } };
  expect(JSON.parse(instructions.result.content[1]!.text)).toMatchObject({
    recentRecords: { records: [{ id: 'r', endedAt: null }] },
  });
  const recent = (
    await mcp('tools/call', { name: 'list_recent_records', arguments: {} })
  ).body as { result: { content: Array<{ text: string }> } };
  expect(JSON.parse(recent.result.content[0]!.text)).toMatchObject({
    hasMore: false,
  });
  const context = (
    await mcp('tools/call', {
      name: 'search_repository_context',
      arguments: { repository: 'git@github.com:wads-dev/work-track.git' },
    })
  ).body as { result: { content: Array<{ text: string }> } };
  expect(JSON.parse(context.result.content[0]!.text)).toMatchObject({
    matches: [{ projectId: 'p', topicId: 't', matchType: 'exact_repository' }],
  });
  expect(listed.result.tools.map((t) => t.name)).not.toContain('move_subject');
  expect(listed.result.tools.map((t) => t.name)).toContain('get_daily_hours');
  expect(
    listed.result.tools.find((t) => t.name === 'update_record')!.description,
  ).toContain('auditoria');
  expect(listed.result.tools.map((t) => t.name)).not.toContain('move_record');
  const args = {
    recordId: 's',
    project_target: 'target',
    requestId: 'r',
    reason: 'Remover registro incorreto',
  };
  await mcp('tools/call', {
    name: 'update_record',
    arguments: { ...args, uid: 'bob' },
  });
  expect(moveRecord).not.toHaveBeenCalled();
  await mcp('tools/call', { name: 'update_record', arguments: args });
  expect(moveRecord).toHaveBeenCalledWith(
    { ...args, confirmed: false },
    'alice',
  );
  moveRecord.mockClear();
  await mcp('tools/call', {
    name: 'update_record',
    arguments: { ...args, confirmed: true },
  });
  expect(moveRecord).not.toHaveBeenCalled();
  await mcp('tools/call', {
    name: 'update_record',
    arguments: { ...args, confirmed: true, previewToken: '0'.repeat(64) },
  });
  expect(moveRecord).toHaveBeenCalledWith(
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
  expect(missing.result.tools.some((t) => t.name === 'update_record')).toBe(
    false,
  );
  expect(workInstructions).toContain('Frase futura');
  expect(workInstructions).toContain('update_record');
});
