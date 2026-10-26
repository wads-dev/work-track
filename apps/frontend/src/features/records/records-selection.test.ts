import { expect, it } from 'vitest';
import { recordProjectIds, writeRecordProjects } from './records-selection';

it('reads legacy singular selection and writes sorted unique repeated projectIds preserving other state', () => {
  const legacy = new URLSearchParams(
    'project=p&topic=t&record=r&fromDate=2026-10-01',
  );
  expect(recordProjectIds(legacy)).toEqual(['p']);
  const next = writeRecordProjects(legacy, [' b ', 'a', 'b']);
  expect(next.getAll('projectIds')).toEqual(['a', 'b']);
  expect(next.has('project')).toBe(false);
  expect(next.has('topic')).toBe(false);
  expect(next.get('record')).toBe('r');
  expect(next.get('fromDate')).toBe('2026-10-01');
  expect(writeRecordProjects(next, []).getAll('projectIds')).toEqual([]);
});
it('gives canonical arrays precedence and keeps topics only for unchanged single parent', () => {
  expect(
    recordProjectIds(
      new URLSearchParams('project=old&projectIds=b&projectIds=a&projectIds=b'),
    ),
  ).toEqual(['a', 'b']);
  const one = new URLSearchParams('project=p&topic=t');
  expect(writeRecordProjects(one, ['p']).get('topic')).toBe('t');
  expect(writeRecordProjects(one, ['q']).has('topic')).toBe(false);
  expect(
    writeRecordProjects(new URLSearchParams('topic=t'), []).has('topic'),
  ).toBe(false);
  const many = new URLSearchParams('projectIds=p&projectIds=q&topic=t');
  expect(writeRecordProjects(many, ['p']).has('topic')).toBe(false);
});
