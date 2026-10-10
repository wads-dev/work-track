import { defineConfig } from 'vitest/config';

// Keep workspace code inside the runner so hoisted mocks and spies intercept
// intra-package imports. Node deployment still uses declarations + built JS.
export default defineConfig({
  resolve: { conditions: ['node', 'development'] },
  ssr: {
    resolve: { conditions: ['node', 'development'] },
    noExternal: [/^@work-track\//],
  },
  test: { server: { deps: { inline: [/^@work-track\//] } } },
});
