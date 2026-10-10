import { it, expect } from 'vitest';
import { safeRecord } from '../../shared/ui/privacy';
import {
  filterRecords,
  recordPage,
  sortRecords,
  resolveRecordTopic,
  type RecordFilters,
} from './record-filters';
it('safe projection text search cannot act as secret oracle', () => {
  const raw = {
    originalText: 'Secret original',
    interpretation: 'Secret interpretation',
    projectSnapshot: { title: 'Secret title' },
    topicSnapshots: [{ title: 'Secret topic' }],
  };
  expect(
    filterRecords([{ id: 'r', data: safeRecord(raw, true) }], {
      ...filters,
      query: 'Secret',
    }),
  ).toHaveLength(0);
  expect(
    filterRecords([{ id: 'r', data: safeRecord(raw, false) }], {
      ...filters,
      query: 'Secret',
    }),
  ).toHaveLength(1);
  expect(
    filterRecords([{ id: 'r', data: safeRecord(raw, true) }], {
      ...filters,
      query: 'Projeto reservado',
    }),
  ).toHaveLength(1);
});
const filters: RecordFilters = {
  project: '',
  topic: '',
  query: '',
  fromDate: '',
  toDate: '',
  zone: 'America/Sao_Paulo',
  status: 'all',
};
it('filters beyond100 and paginates only filtered history', () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({
    id: String(i),
    data: {
      projectId: i === 149 ? 'selected' : 'other',
      originalText: 'Revisão',
    },
  }));
  expect(
    filterRecords(rows, { ...filters, project: 'selected', query: 'revisao' }),
  ).toHaveLength(1);
  expect(recordPage(rows, 2)).toHaveLength(50);
  expect(recordPage(rows, 0)[0].id).toBe('0');
});
it('compares offset instants with civil exclusive end and open startpoint', () => {
  const rows = [
    {
      id: 'offset',
      data: { startedAt: '2026-10-09T01:00:00-03:00', endedAt: null },
    },
    { id: 'next', data: { startedAt: '2026-10-10T00:00:00-03:00' } },
    {
      id: 'overlap',
      data: {
        startedAt: '2026-10-08T22:00:00-03:00',
        endedAt: '2026-10-09T05:00:00Z',
      },
    },
  ];
  expect(
    filterRecords(rows, {
      ...filters,
      fromDate: '2026-10-09',
      toDate: '2026-10-09',
    }).map((r) => r.id),
  ).toEqual(['offset', 'overlap']);
});
it('filters topic/status and rejects incomplete/reversed periods', () => {
  const rows = [
    { id: 'a', data: { topics: [{ topicId: 't' }], endedAt: null } },
    { id: 'b', data: { endedAt: '2026-10-09T00:00:00Z' } },
  ];
  expect(
    filterRecords(rows, { ...filters, topic: 't', status: 'open' }).map(
      (r) => r.id,
    ),
  ).toEqual(['a']);
  expect(() =>
    filterRecords(rows, { ...filters, fromDate: '2026-10-10' }),
  ).toThrow();
  expect(() =>
    filterRecords(rows, {
      ...filters,
      fromDate: '2026-10-10',
      toDate: '2026-10-09',
    }),
  ).toThrow();
});
it('sorts valid instants descending ties by id invalid at end', () => {
  expect(
    sortRecords([
      { id: 'invalid', data: { startedAt: 'bad' } },
      { id: 'b', data: { startedAt: '2026-10-09T01:00:00-03:00' } },
      { id: 'a', data: { startedAt: '2026-10-09T04:00:00Z' } },
      { id: 'old', data: { startedAt: '2026-10-08T00:00:00Z' } },
    ]).map((r) => r.id),
  ).toEqual(['a', 'b', 'old', 'invalid']);
});
it('resolves merged chains without accepting cycles missing targets duplicates', () => {
  const catalog = [
    { id: 'old', mergedIntoTopicId: 'mid' },
    { id: 'mid', mergedIntoTopicId: 'new' },
    { id: 'new' },
  ];
  expect(
    filterRecords(
      [{ id: 'r', data: { projectId: 'p', topics: [{ topicId: 'old' }] } }],
      { ...filters, project: 'p', topic: 'new' },
      catalog,
    ),
  ).toHaveLength(1);
  expect(
    resolveRecordTopic([{ id: 'x', mergedIntoTopicId: 'x' }], 'x'),
  ).toBeUndefined();
  expect(
    resolveRecordTopic([{ id: 'x', mergedIntoTopicId: 'missing' }], 'x'),
  ).toBeUndefined();
  expect(resolveRecordTopic([{ id: 'x' }, { id: 'x' }], 'x')).toBeUndefined();
  expect(resolveRecordTopic([], 'historical')).toBe('historical');
});
