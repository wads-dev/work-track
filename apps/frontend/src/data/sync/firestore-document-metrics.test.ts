import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  accumulateDocumentMetrics,
  FIRESTORE_DOCUMENT_METRIC_KEYS,
  readDocumentMetrics,
} from './firestore-document-metrics';
const storage = new Map<string, string>();
const getItem = vi.fn((key: string) => storage.get(key) ?? null);
const setItem = vi.fn((key: string, value: string) => {
  storage.set(key, value);
});
const flush = async () => {
  await (
    window as unknown as {
      __workTrackFirestoreMetrics: { flush: () => Promise<void> };
    }
  ).__workTrackFirestoreMetrics.flush();
};
beforeEach(() => {
  storage.clear();
  getItem.mockClear();
  setItem.mockClear();
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', { getItem, setItem });
  vi.stubGlobal('navigator', {});
});
afterEach(() => vi.unstubAllGlobals());
it('creates exactly3 numeric keys and accumulates totals instead of resetting', () => {
  accumulateDocumentMetrics({ localReads: 401, remoteReads: 29, writes: 2 });
  accumulateDocumentMetrics({ localReads: 401 });
  expect(readDocumentMetrics()).toEqual({
    localReads: 802,
    remoteReads: 29,
    writes: 2,
  });
  expect([...storage.keys()].sort()).toEqual(
    Object.values(FIRESTORE_DOCUMENT_METRIC_KEYS).sort(),
  );
  expect(
    [...storage.values()].every((s) => Number.isSafeInteger(Number(s))),
  ).toBe(true);
});
it('preserves existing totals across module/browser reload and debug clearing', async () => {
  accumulateDocumentMetrics({ localReads: 100, remoteReads: 10, writes: 1 });
  vi.resetModules();
  const metrics = await import('./firestore-document-metrics');
  metrics.accumulateDocumentMetrics({ localReads: 50 });
  expect(metrics.readDocumentMetrics()).toEqual({
    localReads: 150,
    remoteReads: 10,
    writes: 1,
  });
});
it('serializes read-modify-write using a shared Web Lock', async () => {
  let lockQueue = Promise.resolve();
  const request = vi.fn((_name: string, fn: () => void) => {
    const task = lockQueue.then(async () => {
      await Promise.resolve();
      fn();
    });
    lockQueue = task;
    return task;
  });
  vi.stubGlobal('navigator', { locks: { request } });
  await Promise.all(
    Array.from({ length: 30 }, async () => {
      accumulateDocumentMetrics({ localReads: 1, remoteReads: 2, writes: 1 });
    }),
  );
  await flush();
  expect(readDocumentMetrics()).toEqual({
    localReads: 30,
    remoteReads: 60,
    writes: 30,
  });
  expect(
    request.mock.calls.every(
      (c) => c[0] === 'work-track:firestore-document-metrics',
    ),
  ).toBe(true);
});
it('ignores invalid increments and repairs corrupt stored values without NaN or negatives', () => {
  storage.set(FIRESTORE_DOCUMENT_METRIC_KEYS.localReads, 'bad');
  storage.set(FIRESTORE_DOCUMENT_METRIC_KEYS.remoteReads, '-9');
  storage.set(FIRESTORE_DOCUMENT_METRIC_KEYS.writes, 'Infinity');
  accumulateDocumentMetrics({ localReads: 4, remoteReads: -2, writes: NaN });
  expect(readDocumentMetrics()).toEqual({
    localReads: 4,
    remoteReads: 0,
    writes: 0,
  });
});
it('saturates numeric totals safely and never stores identifiers or document data', () => {
  storage.set(
    FIRESTORE_DOCUMENT_METRIC_KEYS.localReads,
    String(Number.MAX_SAFE_INTEGER - 1),
  );
  accumulateDocumentMetrics({ localReads: 100 });
  expect(readDocumentMetrics()?.localReads).toBe(Number.MAX_SAFE_INTEGER);
  expect(storage.size).toBe(3);
});
it('storage denial never breaks app operations and does not claim persisted totals', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw Error('blocked');
    },
    setItem: () => {
      throw Error('quota');
    },
  });
  expect(() => accumulateDocumentMetrics({ localReads: 10 })).not.toThrow();
  expect(readDocumentMetrics()).toBeNull();
});
it('works without Web Locks and is safe outside the browser', () => {
  vi.stubGlobal('navigator', undefined);
  accumulateDocumentMetrics({ writes: 1 });
  expect(readDocumentMetrics()?.writes).toBe(1);
  vi.stubGlobal('window', undefined);
  expect(() => accumulateDocumentMetrics({ localReads: 100 })).not.toThrow();
  expect(readDocumentMetrics()?.localReads).toBe(0);
});

it('two independent module lifetimes share a lock and do not overwrite each other', async () => {
  let queue = Promise.resolve();
  vi.stubGlobal('navigator', {
    locks: {
      request: (_name: string, fn: () => void) => {
        const task = queue.then(async () => {
          await Promise.resolve();
          fn();
        });
        queue = task;
        return task;
      },
    },
  });
  vi.resetModules();
  const first = await import('./firestore-document-metrics');
  vi.resetModules();
  const second = await import('./firestore-document-metrics');
  const windows = [{}, {}];
  const waits: Promise<void>[] = [];
  for (let i = 0; i < 50; i++) {
    vi.stubGlobal('window', windows[0]);
    first.accumulateDocumentMetrics({ localReads: 1, remoteReads: 1 });
    waits.push(
      (
        windows[0] as {
          __workTrackFirestoreMetrics: { flush: () => Promise<void> };
        }
      ).__workTrackFirestoreMetrics.flush(),
    );
    vi.stubGlobal('window', windows[1]);
    second.accumulateDocumentMetrics({ localReads: 2, writes: 1 });
    waits.push(
      (
        windows[1] as {
          __workTrackFirestoreMetrics: { flush: () => Promise<void> };
        }
      ).__workTrackFirestoreMetrics.flush(),
    );
  }
  await Promise.all(waits);
  expect(first.readDocumentMetrics()).toEqual({
    localReads: 150,
    remoteReads: 50,
    writes: 50,
  });
  expect(second.readDocumentMetrics()).toEqual(first.readDocumentMetrics());
});
