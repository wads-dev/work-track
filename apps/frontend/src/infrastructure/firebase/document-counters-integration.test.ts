import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  DocumentReference,
  Firestore,
  Transaction,
} from 'firebase/firestore';
const sdk = vi.hoisted(() => ({ commitFailure: false, retry: false }));
vi.mock('firebase/firestore', () => ({
  runTransaction: async (
    _db: unknown,
    fn: (tx: Transaction) => Promise<unknown>,
  ) => {
    const transaction = () => {
      const tx = {
        get: async () => ({ exists: () => true }),
        set: () => tx,
        update: () => tx,
        delete: () => tx,
      };
      return tx as unknown as Transaction;
    };
    if (sdk.retry) await fn(transaction());
    const result = await fn(transaction());
    if (sdk.commitFailure) throw Error('native commit denied');
    return result;
  },
}));
import { runMeasuredTransaction } from './transaction-write';
import { readTransaction } from './transaction-read';
import { readDocumentMetrics } from '../../data/sync/firestore-document-metrics';
const db = {} as Firestore,
  ref = { path: 'projects/example' } as DocumentReference;
beforeEach(() => {
  sdk.commitFailure = false;
  sdk.retry = false;
  const storage = new Map<string, string>();
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());
it('successful retried transaction persists final writes once and every returned transaction read', async () => {
  sdk.retry = true;
  await runMeasuredTransaction(db, 'example', async (tx) => {
    await readTransaction(tx, ref, 'example');
    tx.update(ref, { value: 1 });
    tx.set(ref, { value: 2 });
    return 'done';
  });
  expect(readDocumentMetrics()).toEqual({
    localReads: 0,
    remoteReads: 2,
    writes: 2,
  });
});
it('denied native commit counts observed reads but never confirmed writes', async () => {
  sdk.commitFailure = true;
  await expect(
    runMeasuredTransaction(db, 'example', async (tx) => {
      await readTransaction(tx, ref, 'example');
      tx.set(ref, { value: 1 });
    }),
  ).rejects.toThrow('native commit denied');
  expect(readDocumentMetrics()).toEqual({
    localReads: 0,
    remoteReads: 1,
    writes: 0,
  });
});
it('read-only preview does not invent writes', async () => {
  await runMeasuredTransaction(db, 'preview', async (tx) => {
    await readTransaction(tx, ref, 'preview');
    return { preview: true };
  });
  expect(readDocumentMetrics()).toEqual({
    localReads: 0,
    remoteReads: 1,
    writes: 0,
  });
});
