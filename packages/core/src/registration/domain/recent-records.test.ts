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
it('sorts offset dates by instant and ties by stable ASCII document ID across pages', () => {
  const records = [
    { id: 'lexically-later', startedAt: '2026-10-11T02:00:00+02:00' },
    { id: 'z', startedAt: '2026-10-10T23:30:00-02:00' },
    { id: 'Z', startedAt: '2026-10-11T01:30:00Z' },
    { id: 'a', startedAt: '2026-10-11T01:30:00Z' },
  ].map((record) => ({ ...record, uid: 'alice', projectId: 'p' }));
  const now = new Date('2026-10-11T03:00:00Z');
  const first = compactRecentRecords(
    records,
    [project],
    'alice',
    recentRecordsInput.parse({ limit: 2 }),
    now,
  );
  expect(first.records.map((record) => record.id)).toEqual(['Z', 'a']);
  expect(first).toMatchObject({ hasMore: true, nextCursor: 'a' });
  const second = compactRecentRecords(
    records,
    [project],
    'alice',
    recentRecordsInput.parse({ limit: 2, cursor: 'a' }),
    now,
  );
  expect(second.records.map((record) => record.id)).toEqual([
    'z',
    'lexically-later',
  ]);
  expect(second).toMatchObject({ hasMore: false, nextCursor: null });
});
it('orders equal-instant Unicode historical IDs by UTF-8, not UTF-16 or locale', () => {
  const records = ['𐀀', '', 'a', 'Z'].map((id) => ({
    id,
    uid: 'alice',
    projectId: 'p',
    startedAt: '2026-10-11T01:30:00Z',
  }));
  expect(
    compactRecentRecords(
      records,
      [project],
      'alice',
      recentRecordsInput.parse({}),
      new Date('2026-10-11T03:00:00Z'),
    ).records.map((record) => record.id),
  ).toEqual(['Z', 'a', '', '𐀀']);
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
