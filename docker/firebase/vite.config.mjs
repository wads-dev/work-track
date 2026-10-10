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
