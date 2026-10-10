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
  ).rejects.toThrow('Limite operacional');
});

it('loads every UID above10 sequentially without a Firestore in query or truncation', async () => {
  const reads: string[] = [];
  const db = {
    collection: () => ({
      doc: (uid: string) => ({
        collection: () => ({
          orderBy: () => ({ limit: () => ({ uid }) }),
        }),
      }),
    }),
    runTransaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        get: ({ uid }: { uid: string }) => {
          reads.push(uid);
          return Promise.resolve({
            docs: [
              {
                id: 'record',
                data: () => ({
                  projectId: 'project',
                  startedAt: '2026-10-08T00:00:00Z',
                  timeZone: 'UTC',
                  topics: [],
                }),
              },
            ],
          });
        },
      }),
  } as unknown as Firestore;
  const uids = Array.from({ length: 31 }, (_, i) => 'person' + i);
  const records = await loadGlobalContext(db, uids);
  expect(reads).toEqual(uids);
  expect(records.map((r) => r.uid)).toEqual(uids);
});
