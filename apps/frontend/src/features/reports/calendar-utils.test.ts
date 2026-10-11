import { expect, it } from 'vitest';
import { calendarDays, moveReference, range } from './calendar-utils';

it('shows the reference day and its two previous days across year boundaries', () => {
  expect(calendarDays('2026-01-01', 'three-days')).toEqual([
    '2025-12-30',
    '2025-12-31',
    '2026-01-01',
  ]);
  expect(range('2026-01-01', 'three-days', 'America/Sao_Paulo')).toEqual({
    first: '2025-12-30',
    count: 3,
    from: '2025-12-30T03:00:00.000Z',
    to: '2026-01-02T03:00:00.000Z',
  });
});

it('navigates in three-day blocks without skipping days', () => {
  expect(moveReference('2026-01-01', 'three-days', -1)).toBe('2025-12-29');
  expect(moveReference('2026-01-01', 'three-days', 1)).toBe('2026-01-04');
});
