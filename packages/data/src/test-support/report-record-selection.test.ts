import { describe, expect, it } from 'vitest';
import type { ReportRecordSelection } from '@work-track/core/reports/domain/personal-report';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';
import type { ReportProjectMetadata } from '../codecs/report-project-metadata.js';
import { ClientPersonalReportRepository } from './personal-report-repository.js';
import { AuthorizedReportRepository } from './authorized-report-repository.js';
import { personalProjectReportRepository } from './personal-project-report-repository.js';
import { ownCalendarRepository } from './own-calendar-repository.js';

const uid = 'alice';
const from = '2026-10-08T12:00:00Z';
const to = '2026-10-08T14:00:00Z';
const topics: ReportProjectMetadata['topics'] = [
  { id: 'target', title: 'Target' },
  { id: 'old', title: 'Old', mergedIntoTopicId: 'target' },
  { id: 'other', title: 'Other' },
];
const record = (
  id: string,
  options: Partial<ReportSourceRecord> = {},
): ReportSourceRecord => ({
  id,
  uid,
  projectId: 'project',
  startedAt: '2026-10-08T12:30:00Z',
  endedAt: '2026-10-08T13:30:00Z',
  timeZone: 'UTC',
  topics: [{ topicId: 'target' }],
  ...options,
});

const fixtures = [
  record('a-spanning', {
    startedAt: '2026-10-07T00:00:00Z',
    endedAt: '2026-10-09T00:00:00Z',
    topics: [{ topicId: 'old' }, { topicId: 'other' }],
  }),
  record('b-open', { startedAt: '2026-10-07T00:00:00Z', endedAt: undefined }),
  record('c-offset', {
    startedAt: '2026-10-08T08:30:00-04:00',
    endedAt: '2026-10-08T09:30:00-04:00',
    topics: [{ topicId: 'old', percentage: 0 }],
  }),
  record('d-before', {
    startedAt: '2026-10-08T08:00:00Z',
    endedAt: '2026-10-08T11:59:59Z',
  }),
  record('e-upper-boundary', {
    startedAt: to,
    endedAt: '2026-10-08T15:00:00Z',
  }),
  record('f-other-topic', { topics: [{ topicId: 'other' }] }),
  record('g-other-project', { projectId: 'other' }),
  record('h-other-user', { uid: 'bob' }),
  record('i-archived-context', { projectId: 'archived' }),
  record('j-merged-context', { projectId: 'merged' }),
];

function repository(kind: string, archived = false) {
  const personal = kind === 'personal-project';
  const projects = new Map<string, ReportProjectMetadata>([
    [
      'project',
      {
        type: personal ? 'personal' : 'work',
        createdBy: uid,
        archived,
        topics,
      },
    ],
    ['other', { type: 'work', topics }],
    ['archived', { type: 'work', archived: true, topics }],
    ['merged', { type: 'work', mergedInto: 'other', topics }],
  ]);
  const own = new ClientPersonalReportRepository(uid, fixtures, projects);
  const authorized = new AuthorizedReportRepository(uid, fixtures, projects);
  const personalProject = personalProjectReportRepository(own, uid);
  const authorizedProject = authorized.project();
  const calendar = ownCalendarRepository(own, uid);
  return {
    read: async (
      selection?: ReportRecordSelection,
      limit = 100,
      cursor?: string,
    ) => {
      if (kind === 'company')
        return authorized.readPage(limit, cursor, undefined, selection);
      if (kind === 'project')
        return authorizedProject.readPage(
          'project',
          limit,
          cursor,
          uid,
          selection,
        );
      if (kind === 'personal-project')
        return personalProject.readPage(
          'project',
          limit,
          cursor,
          uid,
          selection,
        );
      if (kind === 'own-calendar')
        return calendar.own.readPage(uid, limit, cursor, selection);
      return own.readPage(uid, limit, cursor, selection);
    },
    context: () =>
      kind === 'company' || kind === 'project'
        ? authorized.loadContext([uid])
        : own.loadContext([uid]),
  };
}

for (const kind of [
  'personal',
  'company',
  'project',
  'personal-project',
  'own-calendar',
]) {
  describe(kind + ' test-only snapshot selection', () => {
    it('applies project/user/date/topic predicates before pagination without shrinking context', async () => {
      const repo = repository(kind);
      const before = await repo.context();
      const selection = {
        projectId: 'project',
        userIds: [uid],
        from,
        to,
        topicId: 'target',
      };
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await repo.read(selection, 1, cursor);
        expect(page).not.toBeNull();
        seen.push(...page!.records.map((r) => r.id));
        cursor = page!.nextCursor ?? undefined;
      } while (cursor);
      expect(seen).toEqual(['a-spanning', 'b-open', 'c-offset']);
      expect(await repo.context()).toEqual(before);
      expect(before.map((r) => r.id)).toContain('g-other-project');
      expect(before.map((r) => r.id)).toContain('i-archived-context');
      expect(before.map((r) => r.id)).toContain('j-merged-context');
      expect(before.map((r) => r.id)).toContain('d-before');
      expect((await repo.read({ ...selection, userIds: [] }))!.records).toEqual(
        [],
      );
    });

    it('resolves requested aliases without requiring a valid positive allocation', async () => {
      const repo = repository(kind);
      const page = await repo.read({
        projectId: 'project',
        userIds: [uid],
        from,
        to,
        topicId: 'old',
      });
      expect(page!.records.map((r) => r.id)).toEqual([
        'a-spanning',
        'b-open',
        'c-offset',
      ]);
    });

    it('preserves omitted include-all reads but defaults supplied options to active projects', async () => {
      const repo = repository(kind, true);
      const legacy = await repo.read();
      expect(legacy!.records.some((r) => r.projectId === 'project')).toBe(true);
      expect((await repo.read({ projectId: 'project' }))!.records).toEqual([]);
      expect(
        (await repo.read({ projectId: 'project', includeArchived: true }))!
          .records.length,
      ).toBeGreaterThan(0);
      const context = await repo.context();
      expect(context.some((r) => r.projectId === 'project')).toBe(true);
      if (
        kind === 'personal' ||
        kind === 'company' ||
        kind === 'own-calendar'
      ) {
        const active = await repo.read({});
        expect(active!.records.map((r) => r.projectId)).not.toContain(
          'archived',
        );
        expect(active!.records.map((r) => r.projectId)).not.toContain('merged');
      }
    });

    it('supports a single date bound while preserving open interval candidates', async () => {
      const repo = repository(kind);
      const lower = await repo.read({
        projectId: 'project',
        userIds: [uid],
        from,
      });
      expect(lower!.records.map((r) => r.id)).toContain('b-open');
      expect(lower!.records.map((r) => r.id)).not.toContain('d-before');
      const upper = await repo.read({
        projectId: 'project',
        userIds: [uid],
        to,
      });
      expect(upper!.records.map((r) => r.id)).toContain('a-spanning');
      expect(upper!.records.map((r) => r.id)).not.toContain('e-upper-boundary');
    });
  });
}

it('keeps company participants independent of selected person/date/topic', async () => {
  const repo = new AuthorizedReportRepository(
    uid,
    fixtures,
    new Map([
      ['project', { type: 'work', topics }],
      ['other', { type: 'work', topics }],
      ['archived', { type: 'work', archived: true, topics }],
      ['merged', { type: 'work', mergedInto: 'other', topics }],
    ]),
  );
  const selected = await repo.readPage(100, undefined, 'project', {
    userIds: [uid],
    from,
    to,
    topicId: 'target',
  });
  expect([...new Set(selected.records.map((r) => r.uid))]).toEqual([uid]);
  const directory = await repo.readPage(100, undefined, 'project', {});
  expect([...new Set(directory.records.map((r) => r.uid))]).toEqual([
    uid,
    'bob',
  ]);
});

it('fails rather than pretending a cyclic topic alias has canonical membership', async () => {
  const cyclic: ReportProjectMetadata = {
    topics: [
      { id: 'a', title: 'A', mergedIntoTopicId: 'b' },
      { id: 'b', title: 'B', mergedIntoTopicId: 'a' },
    ],
  };
  const projects = new Map([['project', cyclic]]);
  const own = new ClientPersonalReportRepository(
    uid,
    [record('one')],
    projects,
  );
  const company = new AuthorizedReportRepository(
    uid,
    [record('one')],
    projects,
  );
  await expect(
    own.readPage(uid, 100, undefined, { topicId: 'a' }),
  ).rejects.toThrow('Identidade de tópico inválida');
  await expect(
    company.readPage(100, undefined, 'project', { topicId: 'a' }),
  ).rejects.toThrow('Identidade de tópico inválida');
});
