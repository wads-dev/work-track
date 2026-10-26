import { expect, it } from 'vitest';
import {
  resolveTimeMultiplier,
  timeMultipliersSchema,
} from './time-multipliers.js';
const history = [
  { multiplier: 0.25, effectiveFrom: null },
  { multiplier: 0.5, effectiveFrom: '2026-11-01T00:00:00-03:00' },
  { multiplier: 1, effectiveFrom: '2027-01-01T00:00:00-03:00' },
];
it('selects timeless base, exact boundary and latest applicable date regardless of order', () => {
  expect(resolveTimeMultiplier(history, '2026-10-01T12:00:00Z')).toBe(0.25);
  expect(resolveTimeMultiplier(history, '2026-11-01T03:00:00Z')).toBe(0.5);
  expect(
    resolveTimeMultiplier([...history].reverse(), '2026-12-30T00:00:00Z'),
  ).toBe(0.5);
  expect(resolveTimeMultiplier(history, '2027-02-01T00:00:00Z')).toBe(1);
});
it('uses original start even when record ends or report starts after a new effective date', () => {
  const record = {
    startedAt: '2026-10-31T23:00:00-03:00',
    endedAt: '2026-11-01T04:00:00-03:00',
  };
  expect(resolveTimeMultiplier(history, record.startedAt)).toBe(0.25);
});
it('defaults to one and accepts explicit zero without losing it', () => {
  expect(resolveTimeMultiplier(undefined, '2026-10-01T00:00:00Z')).toBe(1);
  expect(resolveTimeMultiplier(history.slice(1), '2026-10-01T00:00:00Z')).toBe(
    1,
  );
  expect(
    resolveTimeMultiplier(
      [{ multiplier: 0, effectiveFrom: null }],
      '2026-10-01T00:00:00Z',
    ),
  ).toBe(0);
});
it('rejects negative, nonfinite, offsetless and ambiguous histories', () => {
  for (const rules of [
    [{ multiplier: -1, effectiveFrom: null }],
    [{ multiplier: Infinity, effectiveFrom: null }],
    [{ multiplier: 1, effectiveFrom: '2026-11-01T00:00:00' }],
    [history[0], history[0]],
    [
      { multiplier: 1, effectiveFrom: '2026-11-01T00:00:00-03:00' },
      { multiplier: 2, effectiveFrom: '2026-11-01T03:00:00Z' },
    ],
  ])
    expect(timeMultipliersSchema.safeParse({ alice: rules }).success).toBe(
      false,
    );
  expect(() => resolveTimeMultiplier(history, 'invalid')).toThrow();
});
it('stores independent histories per project and person', () => {
  const x = timeMultipliersSchema.parse({
      alice: history,
      bob: [{ multiplier: 2, effectiveFrom: null }],
    }),
    y = timeMultipliersSchema.parse({
      alice: [{ multiplier: 1, effectiveFrom: null }],
    });
  expect(resolveTimeMultiplier(x.alice, '2026-10-01T00:00:00Z')).toBe(0.25);
  expect(resolveTimeMultiplier(x.bob, '2026-10-01T00:00:00Z')).toBe(2);
  expect(resolveTimeMultiplier(y.alice, '2026-10-01T00:00:00Z')).toBe(1);
});
