import { describe, expect, it } from 'vitest';
import {
  reportProjects,
  updateReportProjects,
  updateReportFilters,
} from './report-project-filter';
describe('report project selection', () => {
  it('reads legacy links and canonical repeated IDs', () => {
    expect(reportProjects(new URLSearchParams('projectId=old'))).toEqual([
      'old',
    ]);
    expect(
      reportProjects(
        new URLSearchParams(
          'projectId=old&projectIds=b&projectIds=a&projectIds=b',
        ),
      ),
    ).toEqual(['a', 'b']);
  });
  it('writes canonical arrays, drops stale detail/cursor and preserves unrelated filters', () => {
    const next = updateReportProjects(
      new URLSearchParams(
        'projectId=old&cursor=x&record=r&recordTab=details&includeArchived=true&fromDate=2026-10-01',
      ),
      ['b', 'a', 'b'],
    );
    expect(next.getAll('projectIds')).toEqual(['a', 'b']);
    expect(next.has('projectId')).toBe(false);
    expect(next.has('record')).toBe(false);
    expect(next.has('recordTab')).toBe(false);
    expect(next.has('cursor')).toBe(false);
    expect(next.get('includeArchived')).toBe('true');
    expect(next.get('fromDate')).toBe('2026-10-01');
    expect(reportProjects(updateReportProjects(next, []))).toEqual([]);
  });
  it('clears both project URL forms and dates', () => {
    const next = updateReportFilters(
      new URLSearchParams(
        'projectId=old&projectIds=a&projectIds=b&fromDate=2026-10-01&toDate=2026-10-02&cursor=x',
      ),
      'clear',
      '',
    );
    expect(next.toString()).toBe('');
  });
});
