import { expect, it, vi } from 'vitest';
import { executeCalendarReport } from '../application/get-calendar-report.js';
import {
  getCalendarReportHandler,
  type CalendarRepository,
} from './get-calendar-report.js';
import {
  selectReportRecords,
  type ReportProjectMetadata,
} from '../infrastructure/project-catalog.js';
import type { ReportSourceRecord } from '../domain/project-report.js';
import { ReportContextError } from '../domain/global-estimates.js';
const auth = {
  uid: 'alice',
  token: {
    email: 'alice@wads.dev',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  },
};
const input = {
  from: '2026-10-01T00:00:00Z',
  to: '2026-10-08T00:00:00Z',
  timeZone: 'America/Sao_Paulo',
};
const record = (
  uid: string,
  id: string,
  projectId = 'w',
): ReportSourceRecord => ({
  uid,
  id,
  projectId,
  startedAt: '2026-10-02T12:00:00Z',
  endedAt: '2026-10-02T13:00:00Z',
  timeZone: input.timeZone,
  topics: [],
});
function fixture() {
  const catalog = new Map<string, ReportProjectMetadata>([
    ['w', { type: 'work', topics: [] }],
    ['p', { type: 'personal', createdBy: 'alice', topics: [] }],
    ['foreign', { type: 'personal', createdBy: 'bob', topics: [] }],
  ]);
  let records = [
    record('alice', 'a'),
    record('alice', 'p', 'p'),
    record('bob', 'b'),
    record('bob', 'private', 'foreign'),
  ];
  const visible = (uid: string, mode: 'own' | 'global') =>
    selectReportRecords(
      mode === 'own' ? records.filter((r) => r.uid === uid) : records,
      catalog,
      mode === 'own' ? { viewerUid: uid } : { companyOnly: true },
    );
  const userLabels = vi.fn((ids: string[]) =>
    Promise.resolve(
      Object.fromEntries(
        ids.map((uid) => [uid, uid === 'alice' ? 'Alice' : 'Bob']),
      ),
    ),
  );
  const repo: CalendarRepository = {
    own: {
      readPage: (uid) =>
        Promise.resolve({
          records: visible(uid, 'own'),
          scannedCount: records.length,
          nextCursor: null,
        }),
      loadContext: () => Promise.resolve(visible('alice', 'own')),
      archivedProjectIds: () => Promise.resolve([]),
      readTopics: () => Promise.resolve({}),
    },
    company: {
      readPage: () =>
        Promise.resolve({
          records: visible('alice', 'global'),
          scannedCount: records.length,
          nextCursor: null,
        }),
      loadContext: (uids) =>
        Promise.resolve(
          visible('alice', 'global').filter((r) => uids.includes(r.uid)),
        ),
      archivedProjectIds: () =>
        Promise.resolve(
          [...catalog].filter(([, p]) => p.archived).map(([id]) => id),
        ),
      readTopics: () => Promise.resolve({}),
      userLabels,
    },
    revalidate: (rs, uid, mode) =>
      Promise.resolve(
        selectReportRecords(
          mode === 'own' ? rs.filter((r) => r.uid === uid) : rs,
          catalog,
          mode === 'own' ? { viewerUid: uid } : { companyOnly: true },
        ),
      ),
  };
  return {
    repo,
    catalog,
    userLabels,
    setRecords: (r: ReportSourceRecord[]) => {
      records = r;
    },
  };
}
it('keeps open zero-duration starts visible without adding hours or exposing private records', async () => {
  const f = fixture();
  const start = '2026-10-02T12:00:00Z';
  f.setRecords([
    { ...record('alice', 'open'), endedAt: undefined },
    { ...record('alice', 'closed-zero'), endedAt: start },
    { ...record('bob', 'private', 'foreign'), endedAt: undefined },
  ]);
  const result = await executeCalendarReport(
    f.repo,
    {
      ...input,
      mode: 'own',
      allWeeks: false,
      includeArchived: false,
    },
    'alice',
    Date.parse(start),
  );
  expect(result.totalMinutes).toBe(0);
  expect(result.intervals).toHaveLength(1);
  expect(result.intervals[0]).toMatchObject({
    id: 'open',
    uid: 'alice',
    estimated: true,
    minutes: 0,
    effectiveStartedAt: start.replace('Z', '.000Z'),
    effectiveEndedAt: start.replace('Z', '.000Z'),
  });
  expect(result.intervals[0]).not.toHaveProperty('endedAt');
  const outside = await executeCalendarReport(
    f.repo,
    {
      ...input,
      from: '2026-10-03T00:00:00Z',
      mode: 'own',
      allWeeks: false,
      includeArchived: false,
    },
    'alice',
    Date.parse(start),
  );
  expect(outside.intervals).toEqual([]);
});

it('defaults own includes ownpersonal only; Global explicit org never foreignpersonal', async () => {
  const f = fixture();
  const own = await getCalendarReportHandler(f.repo, input, auth);
  expect(own).toMatchObject({
    mode: 'own',
    policy: 'calendar-v3',
    hoursPolicy: 'personal-v3',
    totalMinutes: 120,
    page: { partial: false, nextCursor: null },
  });
  expect(own.intervals.map((r) => r.uid)).toEqual(['alice', 'alice']);
  expect(own.participants).toEqual([
    { uid: 'alice', label: 'Alice' },
    { uid: 'bob', label: 'Bob' },
  ]);
  expect(own.intervals.every((r) => !r.readOnly)).toBe(true);
  await expect(
    getCalendarReportHandler(f.repo, { ...input, userIds: ['bob'] }, auth),
  ).rejects.toMatchObject({ code: 'permission-denied' });
  const global = await getCalendarReportHandler(
    f.repo,
    { ...input, mode: 'global' },
    auth,
  );
  expect(global.totalMinutes).toBe(120);
  expect(global.intervals.map((r) => r.id)).toEqual(['a', 'b']);
  expect(global.intervals.find((r) => r.uid === 'bob')).toMatchObject({
    id: 'b',
    readOnly: true,
  });
  expect(JSON.stringify(global)).not.toContain('private');
  expect(JSON.stringify(global)).not.toContain('@');
  expect(global.warnings.join(' ')).toContain('Internet');
});
it('person filter intervals not safe picker; strict auth IDs ranges mode noUIDinjection', async () => {
  const f = fixture();
  const result = await getCalendarReportHandler(
    f.repo,
    { ...input, mode: 'global', userIds: ['bob'] },
    auth,
  );
  expect(result.totalMinutes).toBe(60);
  expect(result.intervals.map((r) => r.uid)).toEqual(['bob']);
  expect(result.participants).toHaveLength(2);
  await expect(getCalendarReportHandler(f.repo, input)).rejects.toMatchObject({
    code: 'unauthenticated',
  });
  for (const patch of [
    { uid: 'bob' },
    { mode: 'public' },
    { userIds: ['../x'] },
    { userIds: ['bob', 'bob'] },
    { timeZone: 'invalid' },
    { to: '2027-01-15T00:00:00Z' },
    { from: input.to, to: input.from },
  ])
    await expect(
      getCalendarReportHandler(f.repo, { ...input, ...patch }, auth),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
});
it('scopeconversion deletion move and archive affect next request; privacy midflight fails', async () => {
  const f = fixture();
  f.catalog.set('w', { type: 'personal', createdBy: 'bob', topics: [] });
  const converted = await getCalendarReportHandler(
    f.repo,
    { ...input, mode: 'global' },
    auth,
  );
  expect(converted.intervals).toEqual([]);
  expect(converted.participants).toEqual([]);
  expect(f.userLabels).toHaveBeenLastCalledWith([]);
  f.catalog.set('w', { type: 'work', archived: true, topics: [] });
  expect(
    (await getCalendarReportHandler(f.repo, { ...input, mode: 'global' }, auth))
      .totalMinutes,
  ).toBe(0);
  expect(
    (
      await getCalendarReportHandler(
        f.repo,
        { ...input, mode: 'global', includeArchived: true },
        auth,
      )
    ).totalMinutes,
  ).toBe(120);
  f.catalog.set('w', { type: 'work', topics: [] });
  f.setRecords([
    { ...record('bob', 'b'), deletedAt: false } as ReportSourceRecord,
    { ...record('alice', 'a'), projectId: 'p' },
  ]);
  expect(
    (await getCalendarReportHandler(f.repo, { ...input, mode: 'global' }, auth))
      .totalMinutes,
  ).toBe(0);
  const g = fixture();
  g.repo.company.loadContext = (uids) => {
    g.catalog.set('w', { type: 'personal', createdBy: 'bob', topics: [] });
    return Promise.resolve(
      uids.map((uid) => record(uid, uid === 'alice' ? 'a' : 'b')),
    );
  };
  await expect(
    getCalendarReportHandler(g.repo, { ...input, mode: 'global' }, auth),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
});
it('max10 selected despite picker>10; physical scans bounded no hidden partial', async () => {
  const f = fixture();
  f.setRecords(
    Array.from({ length: 11 }, (_, i) => record('person' + i, 'r' + i)),
  );
  await expect(
    getCalendarReportHandler(f.repo, { ...input, mode: 'global' }, auth),
  ).rejects.toMatchObject({ code: 'resource-exhausted' });
  const filtered = await getCalendarReportHandler(
    f.repo,
    { ...input, mode: 'global', userIds: ['person1'] },
    auth,
  );
  expect(filtered.participants).toHaveLength(11);
  expect(filtered.totalMinutes).toBe(60);
  const g = fixture();
  let count = 0;
  g.repo.company.readPage = () =>
    Promise.resolve({
      records: [],
      scannedCount: 0,
      nextCursor: 'cursor' + ++count,
    });
  await expect(
    getCalendarReportHandler(g.repo, { ...input, mode: 'global' }, auth),
  ).rejects.toMatchObject({ code: 'resource-exhausted' });
  expect(count).toBe(20);
  g.repo.company.readPage = () =>
    Promise.resolve({ records: [], scannedCount: 0, nextCursor: 'same' });
  await expect(
    getCalendarReportHandler(g.repo, { ...input, mode: 'global' }, auth),
  ).rejects.toMatchObject({ code: 'resource-exhausted' });
});
it('closed facts clip only view opens estimates explicit contextcap propagated', async () => {
  const f = fixture();
  f.setRecords([
    { ...record('alice', 'closed'), endedAt: '2026-10-02T14:00:00Z' },
    {
      ...record('alice', 'open'),
      startedAt: '2026-10-03T12:00:00Z',
      endedAt: undefined,
    },
  ]);
  const result = await getCalendarReportHandler(
    f.repo,
    { ...input, from: '2026-10-02T12:30:00Z' },
    auth,
    Date.parse('2026-10-04T00:00:00Z'),
  );
  expect(result.intervals.find((r) => r.id === 'closed')).toMatchObject({
    startedAt: '2026-10-02T12:00:00Z',
    endedAt: '2026-10-02T14:00:00Z',
    effectiveStartedAt: '2026-10-02T12:30:00.000Z',
    minutes: 90,
    estimated: false,
  });
  expect(result.intervals.find((r) => r.id === 'open')).toMatchObject({
    estimated: true,
  });
  f.repo.own.loadContext = () =>
    Promise.reject(new ReportContextError('full context limit'));
  await expect(
    getCalendarReportHandler(f.repo, input, auth),
  ).rejects.toMatchObject({ code: 'resource-exhausted' });
});
it('Global viewer discovery supports11participants, duplicate record IDs keep author UID, fallback noUID; own safe directory excludes private names', async () => {
  const f = fixture();
  f.setRecords([
    record('alice', 'same'),
    ...Array.from({ length: 10 }, (_, i) => record('person' + i, 'same')),
    record('privateperson', 'secret', 'foreign'),
  ]);
  f.repo.company.userLabels = () => Promise.resolve({});
  const result = await getCalendarReportHandler(
    f.repo,
    { ...input, mode: 'global', userIds: ['alice'] },
    auth,
  );
  expect(result.participants).toHaveLength(11);
  expect(result.intervals).toHaveLength(1);
  expect(result.intervals[0]).toMatchObject({
    uid: 'alice',
    id: 'same',
    readOnly: false,
  });
  expect(
    result.participants.every((p) => p.label === 'Participante sem nome'),
  ).toBe(true);
  expect(JSON.stringify(result)).not.toContain('privateperson');
  await expect(
    getCalendarReportHandler(f.repo, { ...input, mode: 'global' }, auth),
  ).rejects.toMatchObject({ code: 'resource-exhausted' });
  const own = await getCalendarReportHandler(f.repo, input, auth);
  expect(own.participants).toHaveLength(11);
  expect(own.intervals.every((r) => r.uid === 'alice')).toBe(true);
  const collisions = await getCalendarReportHandler(
    f.repo,
    { ...input, mode: 'global', userIds: ['alice', 'person0'] },
    auth,
  );
  expect(collisions.intervals.map((r) => [r.uid, r.id])).toEqual([
    ['alice', 'same'],
    ['person0', 'same'],
  ]);
  expect(collisions.totalMinutes).toBe(120);
});
it('archive change midcontext fails closed for selection and directory; includeArchived explicit permits', async () => {
  const f = fixture();
  f.repo.own.loadContext = () => {
    f.catalog.set('w', { type: 'work', archived: true, topics: [] });
    return Promise.resolve([record('alice', 'a'), record('alice', 'p', 'p')]);
  };
  await expect(
    getCalendarReportHandler(f.repo, input, auth),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
  const g = fixture();
  g.repo.company.loadContext = (uids) => {
    g.catalog.set('w', { type: 'work', archived: true, topics: [] });
    return Promise.resolve(
      uids.map((uid) => record(uid, uid === 'alice' ? 'a' : 'b')),
    );
  };
  await expect(
    getCalendarReportHandler(g.repo, { ...input, mode: 'global' }, auth),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(
    (
      await getCalendarReportHandler(
        g.repo,
        { ...input, mode: 'global', includeArchived: true },
        auth,
      )
    ).totalMinutes,
  ).toBe(120);
});
it('optional own directory scan exceeding2000 physical pages or100people degrades truthfully not own hours; own cap/auth/privacy still fail', async () => {
  const f = fixture();
  f.setRecords([record('alice', 'a')]);
  let n = 0;
  f.repo.company.readPage = () =>
    Promise.resolve({ records: [], scannedCount: 0, nextCursor: 'page' + ++n });
  const own = await getCalendarReportHandler(f.repo, input, auth);
  expect(n).toBe(20);
  expect(own).toMatchObject({
    totalMinutes: 60,
    participantsUnavailable: true,
    participants: [{ uid: 'alice', label: 'Alice' }],
    page: { partial: false },
  });
  expect(own.warnings.join(' ')).toContain(
    'Horas próprias permanecem completas',
  );
  await expect(
    getCalendarReportHandler(
      f.repo,
      { ...input, mode: 'global', userIds: ['alice'] },
      auth,
    ),
  ).rejects.toMatchObject({ code: 'resource-exhausted' });
  const g = fixture();
  g.setRecords([
    record('alice', 'a'),
    ...Array.from({ length: 101 }, (_, i) => record('person' + i, 'r' + i)),
  ]);
  const capped = await getCalendarReportHandler(g.repo, input, auth);
  expect(capped).toMatchObject({
    totalMinutes: 60,
    participantsUnavailable: true,
    participants: [{ uid: 'alice', label: 'Alice' }],
  });
  expect(JSON.stringify(capped)).not.toContain('person100');
  const h = fixture();
  h.repo.own.readPage = () =>
    Promise.resolve({
      records: Array.from({ length: 2001 }, (_, i) => record('alice', 'r' + i)),
      scannedCount: 2001,
      nextCursor: null,
    });
  await expect(
    getCalendarReportHandler(h.repo, input, auth),
  ).rejects.toMatchObject({ code: 'resource-exhausted' });
  const j = fixture();
  j.repo.company.readPage = () =>
    Promise.reject(new Error('privacy read failure'));
  await expect(
    getCalendarReportHandler(j.repo, input, auth),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
});
it('allWeeks true oldhistory gaps canonical aliases multishares preservefullinterval and subjects requireproject no dates', async () => {
  const f = fixture();
  f.setRecords([
    {
      ...record('alice', 'old'),
      startedAt: '2023-01-02T12:00:00Z',
      endedAt: '2023-01-02T14:00:00Z',
      topics: [
        { topicId: 'alias', percentage: 25 },
        { topicId: 'other', percentage: 75 },
      ],
    },
    {
      ...record('alice', 'recent'),
      startedAt: '2026-10-02T12:00:00Z',
      endedAt: '2026-10-02T13:00:00Z',
      topics: [{ topicId: 'target' }, { topicId: 'other' }],
    },
  ]);
  const catalog = {
    w: [
      { id: 'alias', title: 'Old', mergedIntoTopicId: 'target' },
      { id: 'target', title: 'Canonical' },
      { id: 'other', title: 'Other' },
    ],
  };
  f.repo.own.readTopics = () => Promise.resolve(catalog);
  f.repo.company.readTopics = () => Promise.resolve(catalog);
  const result = await getCalendarReportHandler(
    f.repo,
    {
      timeZone: input.timeZone,
      allWeeks: true,
      projectId: 'w',
      topicId: 'alias',
    },
    auth,
  );
  expect(result).toMatchObject({
    allWeeks: true,
    totalMinutes: 180,
    occupiedWeeks: ['2023-01-02', '2026-09-28'],
    page: { partial: false },
  });
  expect(result).not.toHaveProperty('from');
  expect(result).not.toHaveProperty('to');
  expect(result.intervals[0]).toMatchObject({
    id: 'old',
    minutes: 120,
    subjectAssignedMinutes: 30,
    topics: [
      { topicId: 'target', label: 'Canonical', assignedMinutes: 30 },
      { topicId: 'other', label: 'Other', assignedMinutes: 90 },
    ],
  });
  expect(result.intervals[1]!.topics).toHaveLength(2);
  expect(result.intervals[1]).not.toHaveProperty('subjectAssignedMinutes');
  for (const bad of [
    { allWeeks: true },
    { allWeeks: true, projectId: 'w', ...input },
    { ...input, topicId: 'target' },
    { projectId: 'w', timeZone: input.timeZone },
    { projectId: 'w', timeZone: input.timeZone, from: input.from },
  ])
    await expect(
      getCalendarReportHandler(f.repo, bad, auth),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
});
it('topic filtering afterengine preserves six-hour estimates without daily cap and fails unsafe aliases or midread merges', async () => {
  const f = fixture();
  f.setRecords([
    {
      ...record('alice', 'first'),
      endedAt: undefined,
      topics: [{ topicId: 'other' }],
    },
    {
      ...record('alice', 'second'),
      startedAt: '2026-10-02T16:00:00Z',
      endedAt: undefined,
      topics: [{ topicId: 'wanted' }],
    },
  ]);
  f.repo.own.readTopics = () =>
    Promise.resolve({
      w: [
        { id: 'wanted', title: 'Wanted' },
        { id: 'other', title: 'Other' },
      ],
    });
  const full = await getCalendarReportHandler(
    f.repo,
    input,
    auth,
    Date.parse('2026-10-03T01:00:00Z'),
  );
  const filtered = await getCalendarReportHandler(
    f.repo,
    { ...input, projectId: 'w', topicId: 'wanted' },
    auth,
    Date.parse('2026-10-03T01:00:00Z'),
  );
  expect(filtered.intervals).toEqual(
    full.intervals
      .filter((r) => r.id === 'second')
      .map((r) => ({ ...r, subjectAssignedMinutes: r.minutes })),
  );
  expect(filtered.totalMinutes).toBe(360);
  f.repo.own.readTopics = () =>
    Promise.resolve({
      w: [{ id: 'wanted', title: 'Bad', mergedIntoTopicId: 'wanted' }],
    });
  await expect(
    getCalendarReportHandler(
      f.repo,
      { ...input, projectId: 'w', topicId: 'wanted' },
      auth,
    ),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
  let n = 0;
  f.repo.own.readTopics = () =>
    Promise.resolve({
      w: [{ id: 'wanted', title: ++n === 1 ? 'Before' : 'After' }],
    });
  await expect(
    getCalendarReportHandler(
      f.repo,
      { ...input, projectId: 'w', topicId: 'wanted' },
      auth,
    ),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
});
it('zero-duration valid record occupies realstart week withoccurrence count nofabricated interval; malformed excluded', async () => {
  const f = fixture();
  f.setRecords([
    {
      ...record('alice', 'zero'),
      startedAt: '2022-01-03T12:00:00Z',
      endedAt: '2022-01-03T12:00:00Z',
      topics: [{ topicId: 'x' }],
    },
  ]);
  f.repo.own.readTopics = () =>
    Promise.resolve({ w: [{ id: 'x', title: 'X' }] });
  const result = await getCalendarReportHandler(
    f.repo,
    { allWeeks: true, projectId: 'w', topicId: 'x', timeZone: input.timeZone },
    auth,
  );
  expect(result).toMatchObject({
    occupiedWeeks: ['2022-01-03'],
    weekOccurrences: [{ week: '2022-01-03', occurrenceCount: 1 }],
    intervals: [],
    totalMinutes: 0,
    estimatedCount: 0,
  });
  const empty = await getCalendarReportHandler(
    f.repo,
    { ...input, projectId: 'w', topicId: 'x' },
    auth,
  );
  expect(empty.occupiedWeeks).toEqual([]);
  expect(empty.weekOccurrences).toEqual([]);
  f.setRecords([
    {
      ...record('alice', 'bad'),
      startedAt: '2022-01-10T12:00:00Z',
      endedAt: '2022-01-09T12:00:00Z',
      topics: [{ topicId: 'x' }],
    },
  ]);
  await expect(
    getCalendarReportHandler(
      f.repo,
      {
        allWeeks: true,
        projectId: 'w',
        topicId: 'x',
        timeZone: input.timeZone,
      },
      auth,
    ),
  ).rejects.toMatchObject({ code: 'resource-exhausted' });
});
