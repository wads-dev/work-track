import {
  collection,
  documentId,
  query,
  where,
  getDocsFromCache,
  type Firestore,
} from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import {
  holidaysSchema,
  type Holiday,
} from '@work-track/core/registration/domain/business-hours';
import { observeWorkspace } from '../sync/workspace-runtime';
export function observeHolidays(
  db: Firestore,
  uid: string,
  next: (value: {
    holidays: Holiday[];
    expectedHolidays: Holiday[] | null;
  }) => void,
  fail: (error: Error) => void,
) {
  let active = true,
    generation = 0;
  const stop = observeWorkspace(db, uid, (signal) => {
    const current = ++generation;
    if (signal.error) {
      fail(new Error(signal.error));
      return;
    }
    if (!signal.calendarReady) return;
    void getDocsFromCache(
      query(
        collection(db, 'calendarSettings'),
        where(documentId(), '==', 'holidays'),
      ),
    )
      .then((result) => {
        const snapshot = result.docs[0];
        const holidays = holidaysSchema.parse(snapshot?.data().holidays ?? []);
        if (active && current === generation)
          next({
            holidays,
            expectedHolidays: snapshot ? holidays : null,
          });
      })
      .catch((error) => {
        if (active && current === generation)
          fail(error instanceof Error ? error : new Error(String(error)));
      });
  });
  return () => {
    active = false;
    stop();
  };
}
export async function saveHolidays(
  functions: Functions,
  input: {
    holidays: Holiday[];
    expectedHolidays: Holiday[] | null;
    requestId: string;
    reason: string;
  },
) {
  holidaysSchema.parse(input.holidays);
  return httpsCallable(functions, 'updateCalendarHolidays')(input);
}
