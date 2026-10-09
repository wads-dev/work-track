import { expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { loadGlobalContext } from './firestore-global-context.js';
it('fails closed for oversized context instead of estimating on first pages', async () => {
  let reads = 0;
  const query = { startAfter: () => query, limit: () => query };
  const db = {
    collection: () => ({
      doc: () => ({ collection: () => ({ orderBy: () => query }) }),
    }),
    runTransaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        get: () => {
          reads++;
          return Promise.resolve({
            docs: Array.from({ length: 501 }, (_, i) => ({
              id: String(reads * 1000 + i),
              data: () => ({
                projectId: 'project',
                startedAt: '2026-10-08T00:00:00Z',
                timeZone: 'UTC',
              }),
            })),
          });
        },
      }),
  } as unknown as Firestore;
  await expect(loadGlobalContext(db, ['alice'])).rejects.toThrow(
    'Limite operacional',
  );
  expect(reads).toBe(4);
  await expect(
    loadGlobalContext(
      db,
      Array.from({ length: 11 }, (_, i) => String(i)),
    ),
  ).rejects.toThrow('Mais de10');
});
