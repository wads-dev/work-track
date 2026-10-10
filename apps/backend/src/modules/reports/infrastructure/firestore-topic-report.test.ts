import { expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { FirestoreTopicReportRepository } from './firestore-topic-report.js';

it.each([undefined, null, '2026-10-08T11:00:00Z'])(
  'revalidates normalized canonical end %s',
  async (endedAt) => {
    const raw = {
      uid: 'alice',
      projectId: 'p',
      startedAt: '2026-10-08T10:00:00Z',
      endedAt,
      timeZone: 'UTC',
      topics: [],
    };
    const record = { ...raw, endedAt: endedAt ?? undefined, id: 'r' };
    const db = {
      collection: (name: string) => ({
        doc: (id: string) => ({
          name,
          id,
          collection: () => ({ doc: () => ({ name: 'records' }) }),
        }),
      }),
      getAll: (...refs: { name: string }[]) =>
        Promise.resolve(
          refs.map((ref) => ({
            id: 'p',
            exists: true,
            data: () =>
              ref.name === 'projects' ? { type: 'work', topics: [] } : raw,
          })),
        ),
    } as unknown as Firestore;
    const repo = new FirestoreTopicReportRepository(db, {} as Auth);
    expect(await repo.revalidate([record], 'alice', false)).toEqual([record]);
    raw.endedAt = '2026-10-08T12:00:00Z';
    expect(await repo.revalidate([record], 'alice', false)).toEqual([]);
  },
);
