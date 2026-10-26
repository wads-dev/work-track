import { expect, it } from 'vitest';
import { calendarInput } from './calendar-input.js';
import { selectedProjectIds } from '../domain/personal-report.js';
const range = {
  from: '2026-10-01T00:00:00Z',
  to: '2026-10-02T00:00:00Z',
  timeZone: 'UTC',
};
it('supports legacy singular and plural native selections', () => {
  expect(calendarInput.parse({ ...range, projectId: 'a' }).projectId).toBe('a');
  expect(
    calendarInput.parse({
      ...range,
      projectIds: ['a', 'b'],
      userIds: ['alice', 'bob'],
    }).projectIds,
  ).toEqual(['a', 'b']);
});
it('rejects conflicting, duplicate, empty and oversized selectors', () => {
  for (const selectors of [
    { projectId: 'a', projectIds: ['a'] },
    { projectIds: [] },
    { projectIds: ['a', 'a'] },
    { userIds: [] },
    { userIds: ['a', 'a'] },
    { projectIds: Array.from({ length: 101 }, (_, i) => 'p' + i) },
    { userIds: Array.from({ length: 101 }, (_, i) => 'u' + i) },
  ])
    expect(calendarInput.safeParse({ ...range, ...selectors }).success).toBe(
      false,
    );
  expect(() => selectedProjectIds({ projectIds: ['a'] }, 'a')).toThrow(
    'Conflicting',
  );
  expect(() => selectedProjectIds({ projectId: 'b' }, 'a')).toThrow(
    'Conflicting',
  );
});
it('allows topic/all-weeks only for one project in either shape', () => {
  expect(
    calendarInput.safeParse({ ...range, projectIds: ['a'], topicId: 't' })
      .success,
  ).toBe(true);
  expect(
    calendarInput.safeParse({ ...range, projectIds: ['a', 'b'], topicId: 't' })
      .success,
  ).toBe(false);
  expect(
    calendarInput.safeParse({
      timeZone: 'UTC',
      allWeeks: true,
      projectIds: ['a'],
    }).success,
  ).toBe(true);
  expect(
    calendarInput.safeParse({
      timeZone: 'UTC',
      allWeeks: true,
      projectIds: ['a', 'b'],
    }).success,
  ).toBe(false);
});
