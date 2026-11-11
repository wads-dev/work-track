import {
  collection,
  doc,
  getFirestore,
  runTransaction,
  documentId,
  query,
  where,
  getDocsFromCache,
  type Firestore,
} from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { canonical } from '../../infrastructure/firebase/web-transaction-adapter';
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
  const holidays = holidaysSchema.parse(input.holidays);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.requestId) || !input.reason.trim())
    throw new Error('Auditoria obrigatória.');
  const user = getAuth(functions.app).currentUser;
  if (!user) throw new Error('Autenticação necessária.');
  const db = getFirestore(functions.app);
  const ref = doc(db, 'calendarSettings', 'holidays');
  const audit = doc(ref, 'audit', input.requestId);
  return runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref),
      prior = await tx.get(audit);
    if (prior.exists()) {
      if (
        prior.data().authorUid !== user.uid ||
        prior.data().request !== JSON.stringify(input)
      )
        throw new Error('requestId já utilizado.');
      return;
    }
    const previous = snapshot.exists()
      ? holidaysSchema.parse(snapshot.data().holidays)
      : null;
    if (canonical(previous) !== canonical(input.expectedHolidays))
      throw new Error('Feriados alterados. Recarregue antes de salvar.');
    const updatedAt = new Date().toISOString();
    tx.set(ref, {
      holidays,
      updatedBy: user.uid,
      updatedAt,
      auditId: input.requestId,
    });
    tx.set(audit, {
      authorUid: user.uid,
      reason: input.reason,
      request: JSON.stringify(input),
      before: previous,
      result: { holidays, expectedHolidays: holidays },
      recordedAt: updatedAt,
    });
  });
}
