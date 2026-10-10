import { expect, it } from 'vitest';
import {
  getTopicReportHandler,
  type TopicReportRepository,
} from './get-topic-report.js';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';
const auth = {
  uid: 'alice',
  token: {
    email: 'alice@wads.dev',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  },
};
const record = (uid: string, id: string): ReportSourceRecord => ({
  uid,
  id,
  projectId: 'w',
  startedAt: '2026-10-02T12:00:00Z',
  endedAt: '2026-10-02T14:00:00Z',
  timeZone: 'America/Sao_Paulo',
  topics: [{ topicId: 'x' }],
});
function fixture(records: ReportSourceRecord[] = []) {
  let personal = false,
    topics = [
      { id: 'x', title: 'X' },
      { id: 'other', title: 'Other' },
    ];
  const repo: TopicReportRepository = {
    readPage: () =>
      Promise.resolve({
        records,
        topics,
        personal,
        archived: false,
        topicLabels: {},
        nextCursor: null,
      }),
    loadContext: () => Promise.resolve(records),
    userLabels: () => Promise.resolve({ alice: 'Alice', bob: 'Bob' }),
    revalidate: (records, uid, own) =>
      Promise.resolve(own ? records.filter((r) => r.uid === uid) : records),
  };
  return {
    repo,
    setPersonal: () => {
      personal = true;
    },
    setTopics: (v: typeof topics) => {
      topics = v;
    },
  };
}
const request = { projectId: 'w', topicId: 'x' };
it('full facts actualstarts min/max inclzero future open; distinctUIDsameID andattributed shares not fullminutes', async () => {
  const f = fixture([
    {
      ...record('alice', 'same'),
      topics: [
        { topicId: 'x', percentage: 25 },
        { topicId: 'other', percentage: 75 },
      ],
    },
    {
      ...record('bob', 'same'),
      topics: [
        { topicId: 'x', percentage: 50 },
        { topicId: 'other', percentage: 50 },
      ],
    },
    {
      ...record('alice', 'zero'),
      startedAt: '2020-01-03T12:00:00Z',
      endedAt: '2020-01-03T12:00:00Z',
    },
    {
      ...record('bob', 'future'),
      startedAt: '2030-01-03T12:00:00Z',
      endedAt: undefined,
    },
  ]);
  const result = await getTopicReportHandler(
    f.repo,
    request,
    auth,
    Date.parse('2026-10-03T00:00:00Z'),
  );
  expect(result).toMatchObject({
    policy: 'topic-report-v3',
    mode: 'global',
    occurrenceCount: 4,
    firstRecordStartedAt: '2020-01-03T12:00:00.000Z',
    lastRecordStartedAt: '2030-01-03T12:00:00.000Z',
    totalMinutes: 90,
    closedMinutes: 90,
    estimatedMinutes: 0,
    fullRecordMinutes: 240,
    unassignedMinutes: 0,
    page: { partial: false },
  });
  expect(result.intervals).toHaveLength(2);
  expect(
    result.intervals.map((r) => [
      r.uid,
      r.minutes,
      r.assignedMinutes,
      r.readOnly,
    ]),
  ).toEqual([
    ['alice', 120, 30, false],
    ['bob', 120, 60, true],
  ]);
  expect(result.participants).toMatchObject([
    { uid: 'alice', occurrenceCount: 2, assignedMinutes: 30 },
    { uid: 'bob', occurrenceCount: 2, assignedMinutes: 60 },
  ]);
  expect(JSON.stringify(result)).not.toContain('@');
});
it('ambiguousmulti membershipcounts butunassigned fullminutes explicit, unusedtopics truthful empty metadata', async () => {
  const f = fixture([
    {
      ...record('alice', 'a'),
      topics: [{ topicId: 'x' }, { topicId: 'other' }],
    },
  ]);
  const result = await getTopicReportHandler(f.repo, request, auth);
  expect(result).toMatchObject({
    occurrenceCount: 1,
    totalMinutes: 0,
    fullRecordMinutes: 120,
    unassignedMinutes: 120,
  });
  expect(result.intervals[0]).not.toHaveProperty('assignedMinutes');
  const empty = fixture();
  expect(await getTopicReportHandler(empty.repo, request, auth)).toMatchObject({
    topicLabel: 'X',
    occurrenceCount: 0,
    firstRecordStartedAt: null,
    lastRecordStartedAt: null,
    totalMinutes: 0,
    participants: [],
    intervals: [],
  });
});
it('authorization strictschema ownprivacy finalemptycatalog archive context andphysicalcaps nohiddenpartial', async () => {
  const f = fixture([record('alice', 'a')]);
  for (const [data, identity, code] of [
    [request, undefined, 'unauthenticated'],
    [
      request,
      { ...auth, token: { ...auth.token, email: 'alice@evil.dev' } },
      'permission-denied',
    ],
    [{ ...request, from: '2020-01-01' }, auth, 'invalid-argument'],
  ] as const)
    await expect(
      getTopicReportHandler(f.repo, data, identity),
    ).rejects.toMatchObject({ code });
  f.repo.readPage = () => Promise.resolve(null);
  await expect(
    getTopicReportHandler(f.repo, request, auth),
  ).rejects.toMatchObject({ code: 'not-found' });
  let n = 0;
  f.repo.readPage = () =>
    Promise.resolve({
      records: [],
      topics: [{ id: 'x', title: 'X' }],
      personal: false,
      topicLabels: {},
      nextCursor: 'page' + ++n,
    });
  await expect(
    getTopicReportHandler(f.repo, request, auth),
  ).rejects.toMatchObject({ code: 'resource-exhausted' });
  expect(n).toBe(20);
  const empty = fixture();
  let read = 0;
  const original = empty.repo.readPage.bind(empty.repo);
  empty.repo.readPage = (...args) =>
    ++read > 1 ? Promise.resolve(null) : original(...args);
  await expect(
    getTopicReportHandler(empty.repo, request, auth),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
  const cap = fixture([record('alice', 'a')]);
  cap.repo.loadContext = () =>
    Promise.reject(new (class extends Error {})('contextunavailable'));
  await expect(
    getTopicReportHandler(cap.repo, request, auth),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
});
it('canonical aliases converge cycle fails finalmerge race fails archive explicit owneronly fallback noUID', async () => {
  const f = fixture([
    { ...record('alice', 'a'), topics: [{ topicId: 'alias' }] },
  ]);
  f.repo.readPage = () =>
    Promise.resolve({
      records: [{ ...record('alice', 'a'), topics: [{ topicId: 'alias' }] }],
      topics: [
        { id: 'alias', title: 'Old', mergedIntoTopicId: 'x' },
        { id: 'x', title: 'X' },
      ],
      personal: true,
      archived: true,
      topicLabels: {},
      nextCursor: null,
    });
  await expect(
    getTopicReportHandler(f.repo, { ...request, topicId: 'alias' }, auth),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
  f.repo.userLabels = () => Promise.resolve({});
  const result = await getTopicReportHandler(
    f.repo,
    { ...request, topicId: 'alias', includeArchived: true },
    auth,
  );
  expect(result).toMatchObject({
    mode: 'own',
    topicId: 'x',
    requestedTopicId: 'alias',
    topicLabel: 'X',
    totalMinutes: 120,
    participants: [{ label: 'Participante sem nome' }],
  });
  const cycle = fixture();
  cycle.repo.readPage = () =>
    Promise.resolve({
      records: [],
      topics: [{ id: 'x', title: 'X', mergedIntoTopicId: 'x' }],
      personal: false,
      topicLabels: {},
      nextCursor: null,
    });
  await expect(
    getTopicReportHandler(cycle.repo, request, auth),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
  const race = fixture();
  let n = 0;
  race.repo.readPage = () =>
    Promise.resolve({
      records: [],
      topics: [{ id: 'x', title: ++n === 1 ? 'Before' : 'After' }],
      personal: false,
      topicLabels: {},
      nextCursor: null,
    });
  await expect(
    getTopicReportHandler(race.repo, request, auth),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
});
it('authorfullglobalcontext estimates independent of closed facts duplicateidentical sources dedupe; malformedotherprojectcontext failclosed notextraestimation', async () => {
  const own = { ...record('alice', 'open'), endedAt: undefined },
    bob = { ...record('bob', 'open'), endedAt: undefined };
  const f = fixture([own, bob, own]);
  f.repo.loadContext = () =>
    Promise.resolve([
      own,
      bob,
      {
        ...record('alice', 'closed'),
        projectId: 'otherProject',
        startedAt: '2026-10-02T06:00:00Z',
        endedAt: '2026-10-02T12:00:00Z',
        topics: [],
      },
    ]);
  const result = await getTopicReportHandler(
    f.repo,
    request,
    auth,
    Date.parse('2026-10-03T01:00:00Z'),
  );
  expect(result).toMatchObject({
    occurrenceCount: 2,
    hoursPolicy: 'company-v3',
    estimatedMinutes: 720,
    participants: [
      { uid: 'alice', assignedMinutes: 360 },
      { uid: 'bob', assignedMinutes: 360 },
    ],
  });
  f.repo.loadContext = () =>
    Promise.resolve([
      own,
      bob,
      {
        ...record('alice', 'malformed'),
        projectId: 'otherProject',
        startedAt: '2026-10-02T10:00:00Z',
        endedAt: '2026-10-02T08:00:00Z',
      },
    ]);
  await expect(
    getTopicReportHandler(
      f.repo,
      request,
      auth,
      Date.parse('2026-10-03T01:00:00Z'),
    ),
  ).rejects.toMatchObject({ code: 'resource-exhausted' });
  const g = fixture([record('alice', 'a')]);
  g.repo.revalidate = () => Promise.resolve([]);
  await expect(
    getTopicReportHandler(g.repo, request, auth),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
  const h = fixture(
    Array.from({ length: 101 }, (_, i) => record('person' + i, 'r')),
  );
  await expect(
    getTopicReportHandler(h.repo, request, auth),
  ).rejects.toMatchObject({ code: 'resource-exhausted' });
  const cap = fixture(
    Array.from({ length: 2001 }, (_, i) => record('alice', 'r' + i)),
  );
  await expect(
    getTopicReportHandler(cap.repo, request, auth),
  ).rejects.toMatchObject({ code: 'resource-exhausted' });
});
it('finalsource read afterengine deletion/topicmove andfinalcatalogempty privacy/archive race failclosed', async () => {
  const source = fixture([record('alice', 'a')]);
  let calls = 0;
  source.repo.revalidate = (records) =>
    Promise.resolve(++calls === 1 ? records : []);
  await expect(
    getTopicReportHandler(source.repo, request, auth),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(calls).toBe(2);
  for (const change of [{ personal: true }, { archived: true }]) {
    const empty = fixture();
    let reads = 0;
    empty.repo.readPage = () =>
      Promise.resolve({
        records: [],
        topics: [{ id: 'x', title: 'X' }],
        topicLabels: {},
        nextCursor: null,
        personal: false,
        archived: false,
        ...(++reads > 1 ? change : {}),
      });
    await expect(
      getTopicReportHandler(empty.repo, request, auth),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  }
});
