import { describe, it, expect } from 'vitest';
import { calendarRequest, updateCalendarPerson } from './calendar-people';
import {
  calendarTopics,
  updateCalendarFilters,
  validateOccupiedWeeks,
} from './calendar-history';
describe('calendar actual historical weeks and subjects', () => {
  it('changing person resets historical viewport while preserving project subject archive', () => {
    const n = updateCalendarPerson(
      new URLSearchParams(
        'projectId=p&subject=t&allWeeks=true&includeArchived=true&historyPage=4',
      ),
      'other',
    );
    expect(n.get('historyPage')).toBeNull();
    expect(n.get('subject')).toBe('t');
    expect(n.get('allWeeks')).toBe('true');
  });
  it('all history genuinely omits dates at SDK boundary and preserves subject/person/archive', () => {
    const r = calendarRequest(
      new URLSearchParams('projectId=p&subject=t&uid=other&allWeeks=true'),
      'me',
      '2026from',
      '2026to',
      'America/Sao_Paulo',
      true,
    );
    expect(Object.hasOwn(r, 'from')).toBe(false);
    expect(Object.hasOwn(r, 'to')).toBe(false);
    expect(r).toMatchObject({
      allWeeks: true,
      projectId: 'p',
      topicId: 't',
      mode: 'global',
      userIds: ['other'],
      includeArchived: true,
    });
    expect(Object.values(r).some((value) => value === undefined)).toBe(false);
  });
  it('project required for topic or historical request malicious URL', () => {
    for (const p of ['subject=t', 'allWeeks=true'])
      expect(() =>
        calendarRequest(new URLSearchParams(p), 'me', '', '', 'UTC', false),
      ).toThrow();
  });
  it('changing project always clears subject drawer cursor but preserves author', () => {
    const n = updateCalendarFilters(
      new URLSearchParams(
        'projectId=a&subject=t&uid=other&allWeeks=true&record=r&cursor=c',
      ),
      'projectId',
      'b',
    );
    expect(n.get('subject')).toBeNull();
    expect(n.get('uid')).toBe('other');
    expect(n.get('allWeeks')).toBe('true');
    expect(n.get('record')).toBeNull();
    expect(
      updateCalendarFilters(n, 'projectId', '').get('allWeeks'),
    ).toBeNull();
  });
  it('no date is invented and dated return is explicit default current period', () => {
    const p = updateCalendarFilters(
      new URLSearchParams('projectId=p&date=2000-01-01'),
      'allWeeks',
      'true',
    );
    expect(p.get('date')).toBeNull();
    expect(p.get('view')).toBe('week');
    expect(updateCalendarFilters(p, 'allWeeks', '').get('allWeeks')).toBeNull();
  });
  it('historical keys allow old Monday weeks empty actual history but reject fake malformed duplicate or unordered', () => {
    expect(validateOccupiedWeeks(['1999-01-04', '2026-10-05'])).toHaveLength(2);
    expect(validateOccupiedWeeks([])).toEqual([]);
    for (const weeks of [
      ['2026-10-06'],
      ['2026-10-05', '2026-10-05'],
      ['2026-10-05', '1999-01-04'],
      ['bogus'],
    ])
      expect(() => validateOccupiedWeeks(weeks)).toThrow();
  });
  it('only selected catalog active nonmerged topic is exposed', () => {
    expect(
      calendarTopics(
        {
          topics: [
            { id: 'a', title: 'A' },
            { id: 'b', archived: true },
            { id: 'c', mergedIntoTopicId: 'a' },
          ],
        },
        false,
        false,
      ),
    ).toEqual([{ id: 'a', label: 'A' }]);
    expect(calendarTopics(undefined, false, true)).toEqual([]);
  });
});
