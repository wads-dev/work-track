import { describe, expect, it, vi } from 'vitest';
import type { WorkRepository } from '../../modules/registration/domain/work-model.js';
import request from 'supertest';
import { InvalidGrantError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { createApp } from './app.js';
import { WorkTrackOAuth } from '../auth/application/oauth-provider.js';
import type { OAuthStore } from '../auth/domain/oauth-store.js';
import { digest } from '../auth/domain/oauth-security.js';

class MemoryStore implements OAuthStore {
  values = new Map<string, unknown>();
  get<T>(collection: string, id: string): Promise<T | undefined> {
    return Promise.resolve(this.values.get(collection + id) as T | undefined);
  }
  put<T>(collection: string, id: string, value: T): Promise<void> {
    this.values.set(collection + id, value);
    return Promise.resolve();
  }
  consume<T>(
    collection: string,
    id: string,
    validate: (value: T) => void,
  ): Promise<T> {
    const value = this.values.get(collection + id) as T | undefined;
    if (!value)
      return Promise.reject(new InvalidGrantError('Missing credential'));
    validate(value);
    this.values.delete(collection + id);
    return Promise.resolve(value);
  }
  remove(collection: string, id: string): Promise<void> {
    this.values.delete(collection + id);
    return Promise.resolve();
  }
}
const base = 'https://wadsworktrack.web.app';
const identity = {
  uid: 'alice',
  email: 'alice@wads.dev',
  emailVerified: true,
  provider: 'google.com',
  validAfter: 0,
};
const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
function setup(repository?: WorkRepository) {
  const identities = {
    verify: (token: string) =>
      Promise.resolve(
        token === 'outside'
          ? { ...identity, email: 'alice@gmail.com' }
          : identity,
      ),
    get: () => Promise.resolve(identity),
  };
  const provider = new WorkTrackOAuth(new MemoryStore(), identities, base);
  return createApp(provider, repository);
}

describe('remote MCP OAuth', () => {
  it('serves public health with security headers and no user data', async () => {
    const response = await request(setup()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'work-track' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects insecure client redirects and untrusted consent requests', async () => {
    const app = setup();
    expect(
      (
        await request(app)
          .post('/register')
          .send({
            redirect_uris: ['http://attacker.example/callback'],
            token_endpoint_auth_method: 'none',
          })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/complete')
          .set('Origin', 'https://attacker.example')
          .send({ flow: 'a'.repeat(43), idToken: 'valid', consent: true })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/complete')
          .set('Origin', base)
          .send({ flow: 'a'.repeat(43), idToken: 'valid', consent: false })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer invalid')
          .send({})
      ).status,
    ).toBe(401);
  });

  it('advertises discovery and rejects anonymous MCP', async () => {
    const app = setup();
    const denied = await request(app).post('/mcp').send({});
    expect(denied.status).toBe(401);
    expect(denied.headers['www-authenticate']).toContain(
      '/.well-known/oauth-protected-resource/mcp',
    );
    const metadata = await request(app).get(
      '/.well-known/oauth-authorization-server',
    );
    expect(metadata.body).toMatchObject({
      code_challenge_methods_supported: ['S256'],
      registration_endpoint: base + '/register',
    });
  });
  it('supports consent, PKCE, one-use code, MCP initialize and refresh rotation', async () => {
    const register = vi
      .fn<WorkRepository['register']>()
      .mockResolvedValue({ id: 'record-1', uid: identity.uid });
    const repository: WorkRepository = {
      listProjects: vi.fn().mockResolvedValue([]),
      createProject: vi.fn(),
      createTopic: vi.fn(),
      register,
    };
    const app = setup(repository);
    const registered = await request(app)
      .post('/register')
      .send({
        client_name: 'test client',
        redirect_uris: ['http://localhost:3334/oauth/callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      });
    expect(registered.status).toBe(201);
    const client = registered.body as { client_id: string };
    const authorized = await request(app)
      .get('/authorize')
      .query({
        client_id: client.client_id,
        response_type: 'code',
        redirect_uri: 'http://localhost:3334/oauth/callback',
        code_challenge: digest(verifier),
        code_challenge_method: 'S256',
        state: 'test-state',
        resource: base + '/mcp',
      });
    expect(authorized.status).toBe(302);
    const flow = new URL(
      authorized.headers.location as string,
    ).searchParams.get('flow');
    const denied = await request(app)
      .post('/complete')
      .set('Origin', base)
      .send({ flow, idToken: 'outside', consent: true });
    expect(denied.status).toBe(403);
    const complete = await request(app)
      .post('/complete')
      .set('Origin', base)
      .send({ flow, idToken: 'valid', consent: true });
    expect(complete.status).toBe(200);
    const callback = new URL((complete.body as { redirect: string }).redirect);
    expect(callback.searchParams.get('state')).toBe('test-state');
    const form = {
      client_id: client.client_id,
      grant_type: 'authorization_code',
      code: callback.searchParams.get('code'),
      code_verifier: verifier,
      redirect_uri: 'http://localhost:3334/oauth/callback',
      resource: base + '/mcp',
    };
    expect(
      (
        await request(app)
          .post('/token')
          .type('form')
          .send({ ...form, code_verifier: 'wrong' })
      ).status,
    ).toBe(400);
    for (const override of [
      { redirect_uri: 'http://localhost:3334/wrong' },
      { resource: 'https://attacker.example/mcp' },
    ]) {
      expect(
        (
          await request(app)
            .post('/token')
            .type('form')
            .send({ ...form, ...override })
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await request(app)
          .post('/complete')
          .set('Origin', base)
          .send({ flow, idToken: 'valid', consent: true })
      ).status,
    ).toBe(403);
    const tokens = await request(app).post('/token').type('form').send(form);
    expect(tokens.status).toBe(200);
    const pair = tokens.body as { access_token: string; refresh_token: string };
    expect(
      (await request(app).post('/token').type('form').send(form)).status,
    ).toBe(400);
    const initialized = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer ' + pair.access_token)
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      });
    expect(initialized.status).toBe(200);
    expect(initialized.body).toMatchObject({
      result: { serverInfo: { name: 'work-track' } },
    });
    const mcp = (method: string, params?: unknown) =>
      request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer ' + pair.access_token)
        .set('Accept', 'application/json, text/event-stream')
        .send({ jsonrpc: '2.0', id: 2, method, params });
    const listed = await mcp('tools/list');
    expect(listed.status).toBe(200);
    const listedBody = listed.body as { result: { tools: { name: string }[] } };
    // Reports must stay internal until project-wide authorization is defined.
    expect(
      listedBody.result.tools.map((tool: { name: string }) => tool.name).sort(),
    ).toEqual(
      [
        'whoami',
        'get_instructions',
        'search_projects',
        'create_project',
        'create_topic',
        'register',
      ].sort(),
    );
    const whoami = await mcp('tools/call', { name: 'whoami', arguments: {} });
    expect(whoami.status).toBe(200);
    const whoamiBody = whoami.body as {
      result: { content: { type: 'text'; text: string }[] };
    };
    expect(whoamiBody.result.content[0]?.type).toBe('text');
    expect(JSON.parse(whoamiBody.result.content[0]!.text) as unknown).toEqual({
      uid: identity.uid,
      email: identity.email,
    });
    const input = {
      projectId: 'project-1',
      startedAt: '2026-10-08T21:00:00-03:00',
      timeZone: 'America/Sao_Paulo',
      originalText: 'Comecei agora',
      interpretation: 'Início sem fim',
      requestId: 'request-1',
    };
    const saved = await mcp('tools/call', {
      name: 'register',
      arguments: { ...input, uid: 'attacker' },
    });
    expect(saved.status).toBe(200);
    const savedBody = saved.body as { result: { isError?: boolean } };
    expect(savedBody.result.isError).not.toBe(true);
    expect(register).toHaveBeenCalledExactlyOnceWith(input, identity.uid);
    const unsupported = await request(app)
      .get('/mcp')
      .set('Authorization', 'Bearer ' + pair.access_token);
    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.allow).toBe('POST');
    const refresh = {
      client_id: client.client_id,
      grant_type: 'refresh_token',
      refresh_token: pair.refresh_token,
      resource: base + '/mcp',
    };
    expect(
      (await request(app).post('/token').type('form').send(refresh)).status,
    ).toBe(200);
    expect(
      (await request(app).post('/token').type('form').send(refresh)).status,
    ).toBe(400);
  });
});
