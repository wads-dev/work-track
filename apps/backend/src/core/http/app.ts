import express from 'express';
import type { RecordEditingRepository } from '../../modules/registration/domain/record-edit.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import type { WorkTrackOAuth } from '../auth/application/oauth-provider.js';
import { z } from 'zod';
import type { WorkRepository } from '../../modules/registration/domain/work-model.js';
import { registerWorkTools } from '../../modules/registration/presentation/work-tools.js';

export function createApp(
  provider: WorkTrackOAuth,
  repository?: WorkRepository,
  editingRepository?: RecordEditingRepository,
) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '32kb' }));
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: new URL(provider.baseUrl),
      resourceServerUrl: new URL(provider.resource),
      scopesSupported: ['mcp'],
      resourceName: 'Work Track',
    }),
  );
  app.get('/flow', async (req, res) => {
    if (typeof req.query.flow !== 'string') {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      res.json(await provider.describeFlow(req.query.flow));
    } catch {
      res.status(400).json({ error: 'invalid_grant' });
    }
  });
  const completeSchema = z.object({
    flow: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    idToken: z.string().min(1).max(16000),
    consent: z.literal(true),
  });
  app.post('/complete', async (req, res) => {
    // Browser must come from our login page, not a third-party site.
    if (req.get('origin') !== new URL(provider.baseUrl).origin) {
      res.status(403).json({ error: 'invalid_origin' });
      return;
    }
    const body = completeSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      res.json({
        redirect: await provider.complete(body.data.flow, body.data.idToken),
      });
    } catch {
      res.status(403).json({
        error: 'access_denied',
        message:
          'Use uma conta Google verificada @wads.dev. A solicitação pode ter expirado.',
      });
    }
  });
  app.all(
    '/mcp',
    requireBearerAuth({
      verifier: provider,
      requiredScopes: ['mcp'],
      expectedResource: new URL(provider.resource),
      resourceMetadataUrl:
        provider.baseUrl + '/.well-known/oauth-protected-resource/mcp',
    }),
    async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).set('Allow', 'POST').end();
        return;
      }
      const server = new McpServer({ name: 'work-track', version: '0.1.0' });
      // Temporary diagnostic tool proves the authenticated identity end-to-end.
      server.registerTool(
        'whoami',
        {
          description:
            'Mostra a identidade autenticada nesta conexão. Não registra trabalho.',
          inputSchema: {},
        },
        () => ({
          content: [{ type: 'text', text: JSON.stringify(req.auth?.extra) }],
        }),
      );
      const uid = req.auth?.extra?.uid;
      if (repository && typeof uid === 'string')
        registerWorkTools(server, repository, uid, editingRepository);
      const transport = new StreamableHTTPServerTransport({
        enableJsonResponse: true,
      });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    },
  );
  app.get('/health', (_req, res) =>
    res.json({ status: 'ok', service: 'work-track' }),
  );
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(
        'Request failed',
        err instanceof Error ? err.name : 'UnknownError',
      );
      if (!res.headersSent) res.status(500).json({ error: 'server_error' });
    },
  );
  return app;
}
