// Development-only config. Never used by the production frontend build.
export const demoConfig = Object.freeze({
  apiKey: 'fake-api-key',
  authDomain: 'demo-work-track.firebaseapp.com',
  projectId: 'demo-work-track',
  storageBucket: 'demo-work-track.appspot.com',
  appId: 'demo-work-track-dashboard',
});
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
export default {
  resolve: {
    conditions: ['module', 'browser', 'development'],
    alias: {
      '@': fileURLToPath(new URL('../../apps/frontend/src', import.meta.url)),
    },
  },
  optimizeDeps: { exclude: ['@work-track/core', '@work-track/data'] },
  ssr: {
    resolve: { conditions: ['node', 'development'] },
    noExternal: [/^@work-track\//],
  },
  server: {
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: Object.fromEntries(
      [
        'mcp',
        '.well-known',
        'register',
        'authorize',
        'token',
        'revoke',
        'flow',
        'complete',
      ].map((route) => [
        '^/' + route.replace('.', '\\.') + '(/|$|\\?)',
        {
          target:
            process.env.WORK_TRACK_MCP_PROXY_TARGET ||
            'http://localhost:5001/demo-work-track/southamerica-east1/mcp',
          changeOrigin: true,
        },
      ]),
    ),
    watch: { usePolling: true, interval: 200 },
  },
  plugins: [
    tailwindcss(),
    VitePWA({ injectRegister: false, devOptions: { enabled: false } }),
    {
      name: 'local-demo-firebase-bootstrap',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.split('?')[0] === '/__dev/firebase-production-config') {
            res.setHeader('Cache-Control', 'no-store');
            void fetch('https://wadsworktrack.web.app/__/firebase/init.json')
              .then(async (response) => {
                if (!response.ok)
                  throw new Error('Production bootstrap unavailable');
                res.setHeader('Content-Type', 'application/json');
                res.end(await response.text());
              })
              .catch(() => {
                res.statusCode = 502;
                res.end('Production bootstrap unavailable');
              });
            return;
          }
          if (req.url?.split('?')[0] === '/login') {
            req.url = req.url.replace('/login', '/login.html');
            return next();
          }
          if (req.url?.split('?')[0] !== '/__/firebase/init.json')
            return next();
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(
            JSON.stringify({
              ...demoConfig,
              emulatorPorts: {
                auth: Number(process.env.WORK_TRACK_AUTH_PORT || 9099),
                firestore: Number(
                  process.env.WORK_TRACK_FIRESTORE_PORT || 8081,
                ),
                functions: Number(
                  process.env.WORK_TRACK_FUNCTIONS_PORT || 5001,
                ),
              },
            }),
          );
        });
      },
    },
  ],
};
