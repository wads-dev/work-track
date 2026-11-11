import { expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { readHolidays, updateHolidays } from './firestore-holidays.js';
function fixture() {
  const values = new Map<string, Record<string, unknown>>();
  type Ref = {
    path: string;
    collection: (name: string) => { doc: (id: string) => Ref };
    get: () => Promise<{
      exists: boolean;
      data: () => Record<string, unknown> | undefined;
    }>;
  };
  const ref = (path: string): Ref => ({
    path,
    collection: (name) => ({ doc: (id) => ref(path + '/' + name + '/' + id) }),
    get: () =>
      Promise.resolve({
        exists: values.has(path),
        data: () => values.get(path),
      }),
  });
  const db = {
    doc: ref,
    runTransaction: async (callback: (tx: unknown) => unknown) =>
      await callback({
        get: (r: Ref) => r.get(),
        set: (r: Ref, value: Record<string, unknown>) =>
          values.set(r.path, value),
        create: (r: Ref, value: Record<string, unknown>) =>
          values.set(r.path, value),
      }),
  } as unknown as Firestore;
  return { db, values };
}
it('audits holiday changes, retries idempotently and rejects stale calendars', async () => {
  const { db, values } = fixture();
  expect(await readHolidays(db)).toEqual({
    holidays: [],
    expectedHolidays: null,
  });
  const input = {
    holidays: [
      { date: '2026-11-02', name: 'Finados' },
      {
        date: '2026-12-25',
        type: 'every_year_same_date' as const,
        name: 'Natal anual',
      },
    ],
    expectedHolidays: null,
    requestId: 'r',
    reason: 'Cadastrar',
  };
  const result = await updateHolidays(db, input, 'alice');
  expect(await updateHolidays(db, input, 'alice')).toEqual(result);
  expect(values.has('calendarSettings/holidays/audit/r')).toBe(true);
  await expect(
    updateHolidays(db, { ...input, requestId: 'stale' }, 'alice'),
  ).rejects.toThrow('Recarregue');
  await expect(updateHolidays(db, input, 'bob')).rejects.toThrow('requestId');
  expect((await readHolidays(db)).holidays).toEqual(input.holidays);
});
