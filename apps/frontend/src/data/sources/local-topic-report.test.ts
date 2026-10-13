import { expect, it } from 'vitest';
import { getTopicReport } from '@work-track/core/reports/application/get-topic-report';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';
import type { ReportProjectMetadata } from '@work-track/data/codecs/report-project-metadata';
import { AuthorizedReportRepository } from '@work-track/data/repositories/snapshots/authorized-report-repository';
import { LocalTopicReportRepository } from './local-topic-report';
import { validateTopicReport } from '../../features/reports/topic-details';

const topics = [
  { id: 'x', title: 'X' },
  { id: 'old', title: 'Old', mergedIntoTopicId: 'x' },
  { id: 'other', title: 'Other' },
];
const record = (
  id: string,
  uid = 'alice',
  projectId = 'w',
): ReportSourceRecord => ({
  id,
  uid,
  projectId,
  startedAt: '2026-10-02T12:00:00Z',
  endedAt: '2026-10-02T14:00:00Z',
  timeZone: 'America/Sao_Paulo',
  topics: [{ topicId: 'x' }],
});
function fixture(
  records: ReportSourceRecord[],
  extras: [string, ReportProjectMetadata][] = [],
) {
  return new LocalTopicReportRepository(
    new AuthorizedReportRepository(
      'alice',
      records,
      new Map<string, ReportProjectMetadata>([
        ['w', { type: 'work', topics }],
        ['another', { type: 'work', archived: true, topics }],
        ['mine', { type: 'personal', createdBy: 'alice', topics }],
        ['private', { type: 'personal', createdBy: 'bob', topics }],
        ['invalid', { type: 'bad', topics }],
        ...extras,
      ]),
      new Set(),
    ),
  );
}
const request = { projectId: 'w', topicId: 'old', includeArchived: true };
const asOf = Date.parse('2026-10-03T00:00:00Z');

it('reads complete history despite selected keys, preserving UID-qualified pagination and aliases', async () => {
  const repo = fixture([
    record('same', 'bob'),
    record('same'),
    record('deleted'),
  ]);
  const first = await repo.readPage('w', 1, undefined, 'alice');
  expect(first?.records.map((r) => r.uid)).toEqual(['alice']);
  const second = await repo.readPage('w', 1, first!.nextCursor!, 'alice');
  expect(second?.records.map((r) => r.uid)).toEqual(['alice']);
  const result = await getTopicReport(repo, request, 'alice', asOf);
  expect(validateTopicReport(result, 'alice', 'w', 'old', 'x')).toBe(result);
  expect(result).toMatchObject({
    occurrenceCount: 3,
    totalMinutes: 360,
    topicId: 'x',
    requestedTopicId: 'old',
    page: { partial: false, nextCursor: null },
  });
  expect(result.participants.map((p) => [p.uid, p.label])).toEqual([
    ['alice', 'Você'],
    ['bob', 'bob'],
  ]);
});

it('filters deleted, missing, invalid and other-owner personal sources; rejects a different viewer', async () => {
  const deleted = { ...record('deleted'), deletedAt: '2026-10-03T00:00:00Z' };
  const repo = fixture([
    record('ok'),
    deleted,
    record('foreign', 'bob', 'mine'),
    record('private', 'bob', 'private'),
    record('bad', 'alice', 'invalid'),
    record('missing', 'alice', 'missing'),
  ]);
  expect((await repo.readPage('w', 100, undefined, 'alice'))?.records).toEqual([
    record('ok'),
  ]);
  expect(await repo.readPage('private', 100, undefined, 'alice')).toBeNull();
  expect(await repo.readPage('invalid', 100, undefined, 'alice')).toBeNull();
  expect(await repo.readPage('w', 100, undefined, 'bob')).toBeNull();
  expect(await repo.loadContext(['alice'])).toEqual([record('ok')]);
  expect(
    await repo.revalidate(
      [record('ok'), deleted, { ...record('ok'), endedAt: undefined }],
      'alice',
      false,
    ),
  ).toEqual([record('ok')]);
  await expect(repo.revalidate([], 'bob', false)).rejects.toThrow(
    'Visualizador',
  );
  await expect(repo.loadContext(['bob'], 'bob')).rejects.toThrow(
    'Visualizador',
  );
});

it('personal report keeps own full global context (including work) while excluding other people', async () => {
  const repo = fixture([
    record('own', 'alice', 'mine'),
    record('work'),
    record('foreign', 'bob', 'mine'),
    record('bob', 'bob'),
  ]);
  const result = await getTopicReport(
    repo,
    { ...request, projectId: 'mine', topicId: 'x' },
    'alice',
    asOf,
  );
  expect(result).toMatchObject({
    mode: 'own',
    occurrenceCount: 1,
    totalMinutes: 120,
  });
  expect((await repo.loadContext(['alice'], 'alice')).map((r) => r.id)).toEqual(
    ['own', 'work'],
  );
  expect(
    await repo.revalidate([record('foreign', 'bob', 'mine')], 'alice', true),
  ).toEqual([]);
});

it('global context retains archived activity without introducing a daily cap', async () => {
  const open = { ...record('open'), endedAt: undefined };
  const context = {
    ...record('context', 'alice', 'another'),
    endedAt: '2026-10-02T20:00:00Z',
  };
  const result = await getTopicReport(
    fixture([open, context]),
    { ...request, topicId: 'x' },
    'alice',
    asOf,
  );
  expect(result).toMatchObject({
    occurrenceCount: 1,
    estimatedMinutes: 360,
    totalMinutes: 360,
  });
  expect(
    (await fixture([open, context]).loadContext(['alice'])).map((r) => r.id),
  ).toEqual(['open', 'context']);
});

it('estimates before topic membership filtering and reads every local history page', async () => {
  const open = { ...record('open'), endedAt: undefined };
  const nonmember = {
    ...record('next'),
    startedAt: '2026-10-02T13:00:00Z',
    topics: [{ topicId: 'other' }],
  };
  const result = await getTopicReport(
    fixture([open, nonmember]),
    request,
    'alice',
    asOf,
  );
  expect(result).toMatchObject({
    occurrenceCount: 1,
    estimatedMinutes: 60,
    totalMinutes: 60,
  });
  const history = Array.from({ length: 205 }, (_, i) => record(String(i)));
  const complete = await getTopicReport(
    fixture(history),
    request,
    'alice',
    asOf,
  );
  expect(complete).toMatchObject({
    occurrenceCount: 205,
    totalMinutes: 24600,
    page: { partial: false, nextCursor: null },
  });
});

it('archived history requires explicit inclusion and alias cycles fail closed', async () => {
  const archived = fixture(
    [record('r')],
    [['w', { type: 'work', archived: true, topics }]],
  );
  await expect(
    getTopicReport(
      archived,
      { ...request, includeArchived: false },
      'alice',
      asOf,
    ),
  ).rejects.toThrow();
  expect(
    (await getTopicReport(archived, request, 'alice', asOf)).occurrenceCount,
  ).toBe(1);
  const cycle = fixture(
    [],
    [
      [
        'w',
        {
          topics: [
            { id: 'x', title: 'X', mergedIntoTopicId: 'old' },
            { id: 'old', title: 'Old', mergedIntoTopicId: 'x' },
          ],
        },
      ],
    ],
  );
  await expect(getTopicReport(cycle, request, 'alice', asOf)).rejects.toThrow();
});

it('never returns silently partial reports when global context exceeds its budget', async () => {
  const records = Array.from({ length: 2001 }, (_, i) =>
    record(String(i), 'alice', 'another'),
  );
  const repo = fixture([record('selected'), ...records]);
  await expect(getTopicReport(repo, request, 'alice', asOf)).rejects.toThrow(
    /2000/,
  );
});
