import { z } from 'zod';

export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + 'T12:00:00Z');
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, 'Data inválida.');
export const businessHoursPeriodSchema = z
  .object({
    startDate: calendarDateSchema,
    endDate: calendarDateSchema.nullable(),
    hoursPerDay: z.number().finite().min(0).max(24),
  })
  .strict()
  .refine(
    (p) => p.endDate === null || p.endDate >= p.startDate,
    'Fim anterior ao início.',
  );
export const businessHoursSchema = z
  .array(businessHoursPeriodSchema)
  .max(200)
  .superRefine((periods, ctx) => {
    const sorted = [...periods].sort((a, b) =>
      a.startDate.localeCompare(b.startDate),
    );
    for (let i = 1; i < sorted.length; i++) {
      if (
        sorted[i - 1]!.endDate === null ||
        sorted[i]!.startDate <= sorted[i - 1]!.endDate!
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Períodos de contratação não podem se sobrepor.',
        });
    }
  });
export type BusinessHoursPeriod = z.infer<typeof businessHoursPeriodSchema>;
/** Dates stay complete; annual recurrence ignores only the year. */
export const holidayDateSchema = calendarDateSchema;
export const holidaySchema = z
  .object({
    date: holidayDateSchema,
    name: z.string().trim().min(1).max(160),
    type: z.enum(['every_year_same_date', 'specific_date']).optional(),
  })
  .strict();
export const holidaysSchema = z
  .array(holidaySchema)
  .max(2000)
  .superRefine((items, ctx) => {
    if (
      new Set(
        items.map((item) =>
          item.type === 'every_year_same_date'
            ? 'annual:' + item.date.substring(5)
            : 'date:' + item.date,
        ),
      ).size !== items.length
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Há feriados duplicados na mesma data.',
      });
  });
export type Holiday = z.infer<typeof holidaySchema>;
export function isHoliday(date: string, holidays: Holiday[]): boolean {
  calendarDateSchema.parse(date);
  return holidays.some((holiday) =>
    holiday.type === 'every_year_same_date'
      ? holiday.date.substring(5) === date.substring(5)
      : holiday.date === date,
  );
}
/** Resolve an embedded contract rule for domain calculation, not dataset retrieval. */
export function businessHoursContractForDate(
  date: string,
  periods: BusinessHoursPeriod[],
) {
  return periods.find(
    (period) =>
      period.startDate <= date &&
      (period.endDate === null || period.endDate >= date),
  );
}
export function businessHoursForDate(
  date: string,
  periods: BusinessHoursPeriod[],
  holidays: Holiday[],
): number {
  calendarDateSchema.parse(date);
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
  if (weekday === 0 || weekday === 6 || isHoliday(date, holidays)) return 0;
  return businessHoursContractForDate(date, periods)?.hoursPerDay ?? 0;
}
export function monthBusinessHours(
  month: string,
  periods: BusinessHoursPeriod[],
  holidays: Holiday[],
  today: string,
) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Mês inválido.');
  calendarDateSchema.parse(month + '-01');
  businessHoursSchema.parse(periods);
  holidaysSchema.parse(holidays);
  calendarDateSchema.parse(today);
  const cursor = new Date(month + '-01T12:00:00Z');
  let total = 0,
    expected = 0;
  const days: { date: string; hours: number }[] = [];
  while (cursor.toISOString().slice(0, 7) === month) {
    const date = cursor.toISOString().slice(0, 10);
    const hours = businessHoursForDate(date, periods, holidays);
    days.push({ date, hours });
    total += hours;
    if (date <= today) expected += hours;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { total, expected, days };
}
export function localCalendarDate(
  now: Date,
  timeZone = 'America/Sao_Paulo',
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return part('year') + '-' + part('month') + '-' + part('day');
}
