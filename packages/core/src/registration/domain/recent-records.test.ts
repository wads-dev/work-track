import { expect, it } from 'vitest';
import { compactRecentRecords, recentRecordsInput } from './recent-records.js';
import type { Project } from './work-model.js';
const project: Project = {
  id: 'p',
  title: 'Projeto',
  description: 'Teste',
  createdBy: 'alice',
  createdAt: '2026-10-11',
  type: 'personal',
  topics: [{ id: 't', title: 'Tópico', description: 'Teste' }],
};
it('includes old open records and recent overlapping records without full texts', () => {
  const records = [
    {
      id: 'old',
      uid: 'alice',
      projectId: 'p',
      startedAt: '2026-10-01T00:00:00Z',
      interpretation: 'x'.repeat(100),
      topics: [{ topicId: 't' }],
    },
    {
      id: 'recent',
      uid: 'alice',
      projectId: 'p',
      startedAt: '2026-10-09T00:00:00Z',
      endedAt: '2026-10-11T00:00:00Z',
    },
    {
      id: 'closed',
      uid: 'alice',
      projectId: 'p',
      startedAt: '2026-10-01T00:00:00Z',
      endedAt: '2026-10-02T00:00:00Z',
    },
  ];
  const result = compactRecentRecords(
    records,
    [project],
    'alice',
    recentRecordsInput.parse({}),
    new Date('2026-10-11T03:00:00Z'),
  );
  expect(result.records).toHaveLength(2);
  expect(result.records.find((r) => r.id === 'old')).toMatchObject({
    title: 'x'.repeat(70),
    endedAt: null,
    topics: [{ id: 't', title: 'Tópico' }],
  });
  expect(result.records[0]).not.toHaveProperty('interpretation');
});
it('paginates explicitly and isolates owners', () => {
  const records = [
    {
      id: 'a',
      uid: 'alice',
      projectId: 'p',
      startedAt: '2026-10-11T00:00:00Z',
    },
    {
      id: 'b',
      uid: 'alice',
      projectId: 'p',
      startedAt: '2026-10-10T00:00:00Z',
    },
  ];
  expect(
    compactRecentRecords(
      records,
      [project],
      'alice',
      recentRecordsInput.parse({ limit: 1 }),
      new Date('2026-10-11T03:00:00Z'),
    ),
  ).toMatchObject({ hasMore: true, nextCursor: 'a' });
  expect(
    compactRecentRecords(
      records,
      [project],
      'bob',
      recentRecordsInput.parse({}),
      new Date('2026-10-11T03:00:00Z'),
    ).records,
  ).toEqual([]);
});
