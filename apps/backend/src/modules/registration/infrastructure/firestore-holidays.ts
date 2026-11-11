import { isDeepStrictEqual } from 'node:util';
import type { Firestore } from 'firebase-admin/firestore';
import { holidaysSchema } from '@work-track/core/registration/domain/business-hours';
import { safeId } from '@work-track/core/registration/domain/project-management';
import { z } from 'zod';
export const updateHolidaysInput = z
  .object({
    holidays: holidaysSchema,
    expectedHolidays: holidaysSchema.nullable(),
    requestId: safeId,
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
export async function readHolidays(db: Firestore) {
  const snapshot = await db.doc('calendarSettings/holidays').get();
  const holidays = holidaysSchema.parse(snapshot.data()?.holidays ?? []);
  return { holidays, expectedHolidays: snapshot.exists ? holidays : null };
}
export async function updateHolidays(db: Firestore, raw: unknown, uid: string) {
  const input = updateHolidaysInput.parse(raw);
  const ref = db.doc('calendarSettings/holidays');
  const audit = ref.collection('audit').doc(input.requestId);
  return db.runTransaction(async (tx) => {
    const before = await tx.get(ref),
      prior = await tx.get(audit);
    if (prior.exists) {
      if (
        prior.data()!.authorUid !== uid ||
        prior.data()!.request !== JSON.stringify(input)
      )
        throw new Error('requestId já utilizado.');
      return z
        .object({ holidays: holidaysSchema, expectedHolidays: holidaysSchema })
        .parse(prior.data()!.result);
    }
    const previous = before.exists
      ? holidaysSchema.parse(before.data()!.holidays ?? [])
      : null;
    if (!isDeepStrictEqual(previous, input.expectedHolidays))
      throw new Error('Feriados alterados. Recarregue antes de salvar.');
    const result = {
      holidays: input.holidays,
      expectedHolidays: input.holidays,
    };
    tx.set(ref, {
      holidays: input.holidays,
      updatedBy: uid,
      updatedAt: new Date().toISOString(),
    });
    tx.create(audit, {
      authorUid: uid,
      reason: input.reason,
      request: JSON.stringify(input),
      before: previous,
      result,
      recordedAt: new Date().toISOString(),
    });
    return result;
  });
}
