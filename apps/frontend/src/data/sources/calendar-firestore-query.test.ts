import { expect, it } from 'vitest';
import { calendarQueryBounds } from './calendar-firestore-query';
it('pads offset ISO bounds and rejects invalid intervals', () => {
  expect(
    calendarQueryBounds({
      from: '2026-10-09T00:00:00-03:00',
      to: '2026-10-10T00:00:00-03:00',
    }),
  ).toEqual({ lower: '2026-10-07', upper: '2026-10-12' });
  expect(() =>
    calendarQueryBounds({ from: 'invalid', to: 'invalid' }),
  ).toThrow();
});
it('clamps year9999 upper envelopes to lexical sentinel rather than dropping valid facts', () => {
  expect(
    calendarQueryBounds({
      from: '9999-12-29T00:00:00Z',
      to: '9999-12-31T00:00:00Z',
    }).upper,
  ).toBe('\uf8ff');
});
