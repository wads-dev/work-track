import { describe, expect, it } from 'vitest';
import {
  businessHoursSchema,
  calendarDateSchema,
  holidaysSchema,
  isHoliday,
  businessHoursForDate,
  localCalendarDate,
  monthBusinessHours,
} from './business-hours.js';
const periods = [{ startDate: '2026-11-01', endDate: null, hoursPerDay: 8 }];
describe('business hours contracts', () => {
  it('validates explicit recurrence types and preserves legacy expected values', () => {
    const legacy = { date: '2026-12-25', name: 'Natal específico' };
    expect(holidaysSchema.parse([legacy])).toEqual([legacy]);
    expect(isHoliday('2027-12-25', [legacy])).toBe(false);
    expect(
      isHoliday('2027-12-25', [{ ...legacy, type: 'specific_date' }]),
    ).toBe(false);
    expect(
      holidaysSchema.safeParse([{ ...legacy, type: 'annual' }]).success,
    ).toBe(false);
    expect(
      holidaysSchema.safeParse([{ ...legacy, annual: true }]).success,
    ).toBe(false);
    expect(
      holidaysSchema.safeParse([
        { date: '12-25', name: 'Natal', type: 'every_year_same_date' },
      ]).success,
    ).toBe(false);
    expect(
      holidaysSchema.safeParse([
        { ...legacy, type: 'every_year_same_date' },
        { ...legacy, date: '2027-12-25', type: 'every_year_same_date' },
      ]).success,
    ).toBe(false);
  });
  it('supports annual dates across years while preserving dated occurrences and leap day', () => {
    const holidays = holidaysSchema.parse([
      {
        date: '2026-12-25',
        type: 'every_year_same_date' as const,
        name: 'Natal',
      },
      { date: '2026-11-03', name: 'Especial' },
      {
        date: '2024-02-29',
        type: 'every_year_same_date' as const,
        name: 'Bissexto',
      },
    ]);
    expect(isHoliday('2026-12-25', holidays)).toBe(true);
    expect(isHoliday('2027-12-25', holidays)).toBe(true);
    expect(isHoliday('2027-11-03', holidays)).toBe(false);
    expect(isHoliday('2026-11-03', holidays)).toBe(true);
    expect(isHoliday('2028-02-29', holidays)).toBe(true);
    expect(isHoliday('2027-02-28', holidays)).toBe(false);
    for (const date of ['2-29', '13-01', '04-31', '02-30', '2027-02-29'])
      expect(
        holidaysSchema.safeParse([{ date, name: 'Inválido' }]).success,
      ).toBe(false);
    expect(
      holidaysSchema.safeParse([
        {
          date: '2026-12-25',
          type: 'every_year_same_date' as const,
          name: 'A',
        },
        {
          date: '2026-12-25',
          type: 'every_year_same_date' as const,
          name: 'B',
        },
      ]).success,
    ).toBe(false);
  });
  it('counts coincident annual and specific holidays only once in monthly targets', () => {
    const contract = [
      { startDate: '2020-01-01', endDate: null, hoursPerDay: 8 },
    ];
    const annual = [
      {
        date: '2026-12-25',
        type: 'every_year_same_date' as const,
        name: 'Natal',
      },
    ];
    const mixed = [...annual, { date: '2026-12-25', name: 'Natal específico' }];
    expect(
      monthBusinessHours('2026-12', contract, mixed, '2026-12-31').total,
    ).toBe(monthBusinessHours('2026-12', contract, annual, '2026-12-31').total);
    expect(businessHoursForDate('2026-12-25', contract, annual)).toBe(0);
    expect(
      monthBusinessHours('2026-12', contract, [], '2026-12-31').total -
        monthBusinessHours('2026-12', contract, annual, '2026-12-31').total,
    ).toBe(8);
  });
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
