import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const source = readFileSync(
  new URL('./Dashboard.tsx', import.meta.url),
  'utf8',
);
it('passes all dataset selections and pagination to repository hooks without view filters', () => {
  for (const field of [
    'scope: projectScope',
    'archive: archiveFilter',
    'query: filter',
    'projectIds: recordProjects',
    'topic: topicFilter',
    'fromDate',
    'toDate',
    'zone',
    'page: activePage',
    'size: pageSize',
  ])
    expect(source).toContain(field);
  for (const selection of [
    '.filter(',
    '.slice(',
    '.find(',
    'filterRecords(',
    'recordPage(',
  ])
    expect(source).not.toContain(selection);
  expect(source).toContain('rawRecords.total');
  expect(source).toContain('rawRecords.openRows');
  expect(source).toContain("id: projectId ?? '__no-detail__'");
});
