import { afterEach, expect, it, vi } from 'vitest';
import { traceFirestore } from './firestore-diagnostics';
import { readDocumentMetrics } from './firestore-document-metrics';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('diagnostics never break rendering when storage is unavailable', () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('storage unavailable');
    },
  });
  expect(() =>
    traceFirestore('cache.read', { collection: 'records', count: 3 }),
  ).not.toThrow();
});
it('diagnostics are opt-in and export only supplied scalar metadata', () => {
  const windowValue: {
    __workTrackFirestoreDebug?: {
      events: unknown[];
      counts: Record<string, number>;
      exportLog: () => string;
      clear: () => void;
    };
  } = {};
  vi.stubGlobal('window', windowValue);
  vi.stubGlobal('localStorage', { getItem: () => '0' });
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  traceFirestore('cache.read', { collection: 'records', count: 3 });
  expect(log).not.toHaveBeenCalled();
  vi.stubGlobal('localStorage', { getItem: () => '1' });
  traceFirestore('cache.result', {
    collection: 'records',
    count: 3,
    source: 'persistent-local',
  });
  expect(windowValue.__workTrackFirestoreDebug!.counts['cache.result']).toBe(1);
  expect(windowValue.__workTrackFirestoreDebug!.exportLog()).toContain(
    'persistent-local',
  );
  expect(log).toHaveBeenCalledOnce();
  windowValue.__workTrackFirestoreDebug!.clear();
  expect(windowValue.__workTrackFirestoreDebug!.events).toHaveLength(0);
});

it('historical counters accumulate with debug off without duplicate cache/listener/result bookkeeping', () => {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, v: string) => store.set(key, v),
  });
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  traceFirestore('cache.result', { count: 430 });
  traceFirestore('cache.filtered', { count: 401 });
  traceFirestore('local.report.read', { count: 401 });
  traceFirestore('listen.cache.event', { count: 430 });
  traceFirestore('listen.event', {
    source: 'local',
    count: 430,
    changed: 430,
    documentsRead: 430,
  });
  traceFirestore('listen.event', {
    source: 'remote',
    count: 430,
    changed: 0,
    documentsRead: 0,
  });
  traceFirestore('listen.event', {
    source: 'remote',
    count: 430,
    changed: 4,
    documentsRead: 3,
  });
  traceFirestore('server.result', { count: 2 });
  traceFirestore('transaction.result', { count: 1 });
  traceFirestore('transaction.read', {});
  traceFirestore('transaction.commit', { count: 2 });
  traceFirestore('write.confirmed', { count: 1 });
  traceFirestore('callable.result', { count: 100 });
  expect(readDocumentMetrics()).toEqual({
    localReads: 430,
    remoteReads: 6,
    writes: 3,
  });
  expect(log).not.toHaveBeenCalled();
});

it('debug ring rollover and clear never reset historical totals', () => {
  const store = new Map<string, string>([['work-track:firestore-debug', '1']]);
  const browser: {
    __workTrackFirestoreDebug?: { events: unknown[]; clear: () => void };
  } = {};
  vi.stubGlobal('window', browser);
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, v: string) => store.set(key, v),
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  for (let i = 0; i < 1100; i++) traceFirestore('cache.result', { count: 1 });
  expect(browser.__workTrackFirestoreDebug!.events).toHaveLength(1000);
  expect(readDocumentMetrics()?.localReads).toBe(1100);
  browser.__workTrackFirestoreDebug!.clear();
  expect(readDocumentMetrics()?.localReads).toBe(1100);
  store.delete('work-track:firestore-debug');
  traceFirestore('cache.result', { count: 3 });
  expect(readDocumentMetrics()?.localReads).toBe(1103);
});
