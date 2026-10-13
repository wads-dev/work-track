import { afterEach, expect, it, vi } from 'vitest';
import { traceFirestore } from './firestore-diagnostics';
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
