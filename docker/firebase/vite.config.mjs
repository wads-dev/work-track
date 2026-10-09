// Development-only config. Never used by the production frontend build.
export const demoConfig = Object.freeze({
  apiKey: 'fake-api-key',
  authDomain: 'demo-work-track.firebaseapp.com',
  projectId: 'demo-work-track',
  storageBucket: 'demo-work-track.appspot.com',
  appId: 'demo-work-track-dashboard',
});
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
export default {
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../apps/frontend/src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    watch: { usePolling: true, interval: 200 },
  },
  plugins: [
    tailwindcss(),
    {
      name: 'local-demo-firebase-bootstrap',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.split('?')[0] !== '/__/firebase/init.json')
            return next();
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(demoConfig));
        });
      },
    },
  ],
};
