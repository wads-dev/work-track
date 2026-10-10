import { it, expect, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreRemovalRepository } from './firestore-removal.js';
import { removalInput } from '@work-track/core/removal/domain/removal';
import { FirestoreWorkRepository } from '../../registration/infrastructure/firestore-work.js';
import { FirestoreRecordEditingRepository } from '../../registration/infrastructure/firestore-record-editing.js';
import { FirestoreSplitRepository } from '../../split/infrastructure/firestore-split.js';
import { FirestorePauseRepository } from '../../pause/infrastructure/firestore-pause.js';
const now = Date.parse('2026-10-09T18:00:00Z');
const input = removalInput.parse({
  recordId: 'source',
  requestId: 'remove-1',
  reason: 'Remover lançamento incorreto',
});
interface Ref {
  path: string;
  id: string;
  collection(n: string): { doc(id: string): Ref };
}
function fixture() {
  const data = new Map<string, Record<string, unknown>>();
  const source: Record<string, unknown> = {
    uid: 'alice',
    projectId: 'orphan',
    startedAt: '2026-10-09T12:00:00Z',
    timeZone: 'UTC',
    originalText: 'Evidence',
    interpretation: 'Context',
    requestId: 'original',
    fingerprint: 'kept',
    topics: [],
  };
  data.set('users/alice/records/source', source);
  const ref = (path: string): Ref => ({
    path,
    id: path.split('/').at(-1)!,
    collection: (n) => collection(path + '/' + n),
  });
  const collection = (path: string) => ({
    doc: (id: string) => ref(path + '/' + id),
  });
  let writes = 0,
    fail = false;
  const db = {
    collection,
    runTransaction: async (work: (t: unknown) => Promise<unknown>) => {
      const pending: (() => void)[] = [];
      const tx = {
        get: (r: Ref) =>
          Promise.resolve({
            exists: data.has(r.path),
            id: r.id,
            updateTime: { toMillis: () => 1, nanoseconds: 1 },
            data: () => data.get(r.path),
          }),
        update: (r: Ref, v: Record<string, unknown>) =>
          pending.push(() =>
            data.set(r.path, { ...data.get(r.path), ...structuredClone(v) }),
          ),
        create: (r: Ref, v: Record<string, unknown>) => {
          if (data.has(r.path)) throw Error('collision');
          pending.push(() => data.set(r.path, structuredClone(v)));
        },
      };
      const result = await work(tx);
      if (fail && pending.length) throw Error('injected rollback');
      pending.forEach((f) => {
        f();
        writes++;
      });
      return result;
    },
  } as unknown as Firestore;
  return {
    data,
    db,
    source,
    repo: new FirestoreRemovalRepository(db),
    writes: () => writes,
    fail: () => {
      fail = true;
    },
  };
}
it.each([undefined, '2026-10-09T15:00:00Z'])(
  'previews no writes and confirms open/closed own orphan with full audit and stable replay (%s)',
  async (endedAt) => {
    const f = fixture();
    if (endedAt) f.source.endedAt = endedAt;
    const p = await f.repo.removeRecord(input, 'alice', now);
    expect(f.writes()).toBe(0);
    expect(p.record.deletedAt).toBeUndefined();
    const confirm = { ...input, confirmed: true, previewToken: p.previewToken };
    const result = await f.repo.removeRecord(confirm, 'alice', now);
    expect(f.writes()).toBe(3);
    expect(result.record).toMatchObject({
      ...f.source,
      deletedAt: new Date(now).toISOString(),
      deletedBy: 'alice',
      deleteReason: input.reason,
      deleteOperationId: result.operationId,
    });
    expect(result.record.requestId).toBe('original');
    expect(result.record.fingerprint).toBe('kept');
    expect(result.record.endedAt).toBe(endedAt);
    const audit = f.data.get(
      'users/alice/removalAudits/' + result.operationId,
    )!;
    expect(audit.before).toEqual(f.source);
    expect(audit.after).toEqual(result.record);
    expect(await f.repo.removeRecord(confirm, 'alice', now + 1)).toEqual(
      result,
    );
    expect(f.writes()).toBe(3);
    await expect(
      f.repo.removeRecord(
        { ...confirm, reason: 'different intent' },
        'alice',
        now,
      ),
    ).rejects.toThrow('requestId');
    await expect(
      f.repo.removeRecord(
        { ...confirm, previewToken: '0'.repeat(64) },
        'alice',
        now,
      ),
    ).rejects.toThrow('Retry');
    f.data.get('users/alice/records/source')!.originalText = 'changed';
    await expect(f.repo.removeRecord(confirm, 'alice', now)).rejects.toThrow(
      'alterado',
    );
    expect(f.writes()).toBe(3);
  },
);
it('rejects missing/foreign/malformed UID and source mismatch without exposing content', async () => {
  const f = fixture();
  await expect(f.repo.removeRecord(input, 'bob', now)).rejects.toThrow(
    'não encontrado',
  );
  await expect(f.repo.removeRecord(input, 'bad/uid', now)).rejects.toThrow(
    'não encontrado',
  );
  f.source.uid = 'bob';
  await expect(f.repo.removeRecord(input, 'alice', now)).rejects.toThrow(
    'não encontrado',
  );
  expect(f.writes()).toBe(0);
});
it('rejects stale/missing token, already deleted and oversized audits with zero writes', async () => {
  const f = fixture(),
    p = await f.repo.removeRecord(input, 'alice', now);
  f.source.originalText = 'changed';
  await expect(
    f.repo.removeRecord(
      { ...input, confirmed: true, previewToken: p.previewToken },
      'alice',
      now,
    ),
  ).rejects.toThrow('desatualizada');
  await expect(
    f.repo.removeRecord({ ...input, confirmed: true }, 'alice', now),
  ).rejects.toThrow();
  Object.assign(f.source, { deletedAt: 0 });
  await expect(f.repo.removeRecord(input, 'alice', now)).rejects.toThrow(
    'já removido',
  );
  delete f.source.deletedAt;
  f.source.originalText = 'x'.repeat(710000);
  await expect(f.repo.removeRecord(input, 'alice', now)).rejects.toThrow(
    'tamanho',
  );
  expect(f.writes()).toBe(0);
});
it('transaction failure leaves factual source and both audits untouched', async () => {
  const f = fixture(),
    p = await f.repo.removeRecord(input, 'alice', now);
  f.fail();
  await expect(
    f.repo.removeRecord(
      { ...input, confirmed: true, previewToken: p.previewToken },
      'alice',
      now,
    ),
  ).rejects.toThrow('rollback');
  expect(f.data.size).toBe(1);
  expect(f.data.get('users/alice/records/source')).toEqual(f.source);
});
it('deleted record cannot edit, pause or split through repository paths', async () => {
  const f = fixture(),
    p = await f.repo.removeRecord(input, 'alice', now);
  await f.repo.removeRecord(
    { ...input, confirmed: true, previewToken: p.previewToken },
    'alice',
    now,
  );
  await expect(
    new FirestoreRecordEditingRepository(f.db).updateRecord(
      { recordId: 'source', reason: 'edit', endedAt: null },
      'alice',
    ),
  ).rejects.toThrow('removido');
  await expect(
    new FirestoreSplitRepository(f.db).splitRecord(
      {
        recordId: 'source',
        segmentStartedAt: '2026-10-09T13:00:00Z',
        segmentEndedAt: '2026-10-09T14:00:00Z',
        destinationProjectId: 'dest',
        destinationTopics: [],
        requestId: 'split',
        reason: 'split reason',
        confirmed: false,
        acknowledgeSharedDestination: false,
      },
      'alice',
      now,
    ),
  ).rejects.toThrow('removido');
  await expect(
    new FirestorePauseRepository(f.db).registerPause(
      {
        recordId: 'source',
        resumedAt: '2026-10-09T15:00:00Z',
        durationMinutes: 30,
        requestId: 'pause',
        reason: 'pause reason',
        originalUtterance: 'pause',
      },
      'alice',
      now,
    ),
  ).rejects.toThrow();
  expect(f.writes()).toBe(3);
});
it('registration retry returns failure rather than tombstone activity or resurrection', async () => {
  const tx = {
    get: vi
      .fn()
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ uid: 'alice', deletedAt: 'now', fingerprint: 'old' }),
      })
      .mockResolvedValueOnce({ exists: true, data: () => ({ type: 'work' }) }),
    set: vi.fn(),
  };
  const ref = { doc: () => ref, collection: () => ref };
  const db = {
    collection: () => ref,
    runTransaction: (f: (t: unknown) => unknown) => f(tx),
  } as unknown as Firestore;
  await expect(
    new FirestoreWorkRepository(db).register(
      {
        projectId: 'p',
        startedAt: '2026-10-09T12:00:00Z',
        timeZone: 'UTC',
        requestId: 'old',
        originalText: 'evidence',
        interpretation: 'context',
      },
      'alice',
    ),
  ).rejects.toThrow('removido');
  expect(tx.set).not.toHaveBeenCalled();
});
