import { expect, it } from 'vitest';
import { ClientPersonalReportRepository } from './personal-report-repository';
import { executePersonalReport } from '../../backend/src/modules/reports/application/get-personal-report';
const base = {
  uid: 'alice',
  startedAt: '2026-10-08T12:00:00Z',
  endedAt: '2026-10-08T13:30:00Z',
  timeZone: 'UTC',
  topics: [],
};
it('preserves full budget context and excludes inaccessible, deleted and foreign records', async () => {
  const repo = new ClientPersonalReportRepository(
    'alice',
    [
      { ...base, id: 'a', projectId: 'work' },
      { ...base, id: 'b', projectId: 'personal' },
      { ...base, id: 'c', projectId: 'foreign' },
      { ...base, id: 'd', projectId: 'missing' },
      { ...base, id: 'e', projectId: 'work', uid: 'bob' },
      {
        ...base,
        id: 'f',
        projectId: 'work',
        deletedAt: '2026-10-09',
      } as typeof base & { id: string; projectId: string },
    ],
    new Map([
      ['work', { topics: [] }],
      [
        'personal',
        { type: 'personal', createdBy: 'alice', archived: true, topics: [] },
      ],
      ['foreign', { type: 'personal', createdBy: 'bob', topics: [] }],
    ]),
  );
  expect((await repo.loadContext(['alice'])).map((r) => r.id)).toEqual([
    'a',
    'b',
  ]);
  const report = await executePersonalReport(
    repo,
    { timeZone: 'UTC' },
    'alice',
    Date.parse('2026-10-09T00:00:00Z'),
  );
  expect(report.totalMinutes).toBe(90);
  expect(report.byProject).toEqual([{ projectId: 'work', minutes: 90 }]);
  await expect(repo.loadContext(['bob'])).rejects.toThrow(
    'authenticated owner',
  );
  await expect(repo.readTopics(['work'], 'bob')).rejects.toThrow(
    'authenticated owner',
  );
});
it('uses consistent cursor ordering for mixed-case document IDs', async () => {
  const ids = ['a', 'Z', '_', 'B', 'z'];
  const repo = new ClientPersonalReportRepository(
    'alice',
    ids.map((id) => ({ ...base, id, projectId: 'work' })),
    new Map([['work', { topics: [] }]]),
  );
  const seen: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await repo.readPage('alice', 2, cursor);
    seen.push(...page.records.map((r) => r.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  expect(seen).toEqual(['B', 'Z', '_', 'a', 'z']);
});
it('reads selected page without dropping other-project budget context', async () => {
  const repo = new ClientPersonalReportRepository(
    'alice',
    [
      { ...base, id: 'budget', projectId: 'other' },
      { ...base, id: 'selected', projectId: 'work' },
    ],
    new Map([
      ['work', { topics: [] }],
      ['other', { topics: [] }],
    ]),
    new Set(['selected']),
  );
  expect((await repo.readPage('alice', 100)).records.map((r) => r.id)).toEqual([
    'selected',
  ]);
  expect((await repo.loadContext(['alice'])).map((r) => r.id)).toEqual([
    'budget',
    'selected',
  ]);
});
it('refuses to silently truncate the context', async () => {
  const repo = new ClientPersonalReportRepository(
    'alice',
    Array.from({ length: 2001 }, (_, i) => ({
      ...base,
      id: String(i),
      projectId: 'work',
    })),
    new Map([['work', { topics: [] }]]),
  );
  await expect(repo.loadContext(['alice'])).rejects.toThrow('2000 registros');
});
