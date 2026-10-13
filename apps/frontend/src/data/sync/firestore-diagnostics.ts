type Detail = Record<string, string | number | boolean | null>;
type Entry = { at: number; event: string; detail: Detail };
const events: Entry[] = [];
const counts: Record<string, number> = {};
export function traceFirestore(event: string, detail: Detail = {}) {
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
