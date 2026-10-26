import { accumulateDocumentMetrics } from './firestore-document-metrics';
type Detail = Record<string, string | number | boolean | null>;
type Entry = { at: number; event: string; detail: Detail };
const events: Entry[] = [];
const counts: Record<string, number> = {};
let measurementSequence = 0;
/** Request-local, content-free timing; detailed logging remains opt-in. */
export function measureFirestoreStage(stage: string) {
  const started = performance.now();
  const requestId = ++measurementSequence;
  traceFirestore('performance.start', { stage, requestId });
  let finished = false;
  return (success = true) => {
    if (finished) return;
    finished = true;
    traceFirestore('performance.end', {
      stage,
      requestId,
      success,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
    });
  };
}
export function traceFirestore(event: string, detail: Detail = {}) {
  // Lifetime totals must not depend on debug output or the bounded log ring.
  accumulateDocumentMetrics({
    localReads: event === 'cache.result' ? Number(detail.count ?? 0) : 0,
    remoteReads:
      event === 'server.result' || event === 'transaction.result'
        ? Number(detail.count ?? 0)
        : event === 'listen.event' && detail.source === 'remote'
          ? Number(detail.documentsRead ?? 0)
          : 0,
    writes:
      event === 'transaction.commit' || event === 'write.confirmed'
        ? Number(detail.count ?? 0)
        : 0,
  });
  if (typeof window === 'undefined' || typeof localStorage === 'undefined')
    return;
  try {
    if (localStorage.getItem('work-track:firestore-debug') !== '1') return;
  } catch {
    return;
  }
  counts[event] = (counts[event] ?? 0) + 1;
  const entry = { at: Date.now(), event, detail };
  events.push(entry);
  if (events.length > 1000) events.shift();
  Object.assign(window, {
    __workTrackFirestoreDebug: {
      events,
      counts,
      exportLog: () =>
        events
          .map(
            (e) =>
              new Date(e.at).toISOString() +
              ' ' +
              e.event +
              ' ' +
              JSON.stringify(e.detail),
          )
          .join('\n'),
      clear: () => {
        events.length = 0;
        for (const key of Object.keys(counts)) delete counts[key];
      },
    },
  });
  console.log(
    '[work-track/firestore]',
    new Date(entry.at).toISOString(),
    event,
    JSON.stringify(detail),
  );
}
