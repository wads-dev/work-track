import { describe, expect, it } from 'vitest';
import {
  businessHoursSchema,
  calendarDateSchema,
  holidaysSchema,
  localCalendarDate,
  monthBusinessHours,
} from './business-hours.js';
const periods = [{ startDate: '2026-11-01', endDate: null, hoursPerDay: 8 }];
describe('business hours contracts', () => {
  it('counts the whole current day at local midnight, excluding weekends and holidays', () => {
    const result = monthBusinessHours(
      '2026-11',
      periods,
      [{ date: '2026-11-02', name: 'Finados' }],
      '2026-11-03',
    );
    expect(result.expected).toBe(8);
    expect(result.total).toBe(160);
    expect(result.days[0]!.hours).toBe(0);
  });
  it('calculates multiple contract periods and gaps day by day', () => {
    const result = monthBusinessHours(
      '2026-11',
      [
        { startDate: '2026-11-02', endDate: '2026-11-06', hoursPerDay: 4 },
        { startDate: '2026-11-09', endDate: null, hoursPerDay: 8 },
      ],
      [],
      '2026-11-09',
    );
    expect(result.expected).toBe(28);
    expect(result.total).toBe(148);
  });
  it('rejects invalid dates, duplicate holidays and inclusive overlap', () => {
    expect(calendarDateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(
      businessHoursSchema.safeParse([
        ...periods,
        { startDate: '2026-11-11', endDate: null, hoursPerDay: 4 },
      ]).success,
    ).toBe(false);
    expect(
      holidaysSchema.safeParse([
        { date: '2026-11-02', name: 'A' },
        { date: '2026-11-02', name: 'B' },
      ]).success,
    ).toBe(false);
  });
  it('handles leap years, no contract, past and future months', () => {
    expect(
      monthBusinessHours(
        '2024-02',
        [{ startDate: '2024-02-29', endDate: '2024-02-29', hoursPerDay: 6 }],
        [],
        '2024-02-29',
      ).total,
    ).toBe(6);
    expect(monthBusinessHours('2026-11', [], [], '2026-11-11').total).toBe(0);
    expect(
      monthBusinessHours('2026-11', periods, [], '2026-10-31').expected,
    ).toBe(0);
    const past = monthBusinessHours('2026-11', periods, [], '2026-12-01');
    expect(past.expected).toBe(past.total);
  });
  it('uses Sao Paulo calendar date rather than UTC', () => {
    expect(localCalendarDate(new Date('2026-11-04T02:59:59Z'))).toBe(
      '2026-11-03',
    );
    expect(localCalendarDate(new Date('2026-11-04T03:00:00Z'))).toBe(
      '2026-11-04',
    );
  });
});
