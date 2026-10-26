import { describe, expect, it } from 'vitest';
import type { ReportRecordSelection } from '@work-track/core/reports/domain/personal-report';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';
import { buildTopicBreakdown } from '@work-track/core/reports/domain/topic-breakdown';
import type { ReportProjectMetadata } from '../codecs/report-project-metadata.js';
import { ClientPersonalReportRepository } from './personal-report-repository.js';
import { AuthorizedReportRepository } from './authorized-report-repository.js';
import { personalProjectReportRepository } from './personal-project-report-repository.js';
import { ownCalendarRepository } from './own-calendar-repository.js';

const uid = 'alice';
const from = '2026-10-08T12:00:00Z';
const to = '2026-10-08T14:00:00Z';
const topics: ReportProjectMetadata['topics'] = [
  { archived: false, id: 'target', title: 'Target' },
  { archived: false, id: 'other', title: 'Other' },
];
const record = (
  id: string,
  options: Partial<ReportSourceRecord> = {},
): ReportSourceRecord => ({
  deletedAt: null,
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
    deletedAt: null,
    startedAt: '2026-10-07T00:00:00Z',
    endedAt: '2026-10-09T00:00:00Z',
    topics: [{ topicId: 'target' }, { topicId: 'other' }],
  }),
  record('b-open', { startedAt: '2026-10-07T00:00:00Z', endedAt: undefined }),
  record('c-offset', {
    deletedAt: null,
    startedAt: '2026-10-08T08:30:00-04:00',
    endedAt: '2026-10-08T09:30:00-04:00',
    topics: [{ topicId: 'target', percentage: 0 }],
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

function repository(
  kind: string,
  archived = false,
  catalogTopics: ReportProjectMetadata['topics'] = topics,
  records: ReportSourceRecord[] = fixtures,
) {
  const personal = kind === 'personal-project';
  const projects = new Map<string, ReportProjectMetadata>([
    [
      'project',
      {
        confidential: false,
        type: personal ? 'personal' : 'work',
        createdBy: uid,
        archived,
        topics: catalogTopics,
      },
    ],
    [
      'other',
      {
        archived: false,
        confidential: false,
        createdBy: 'alice',
        type: 'work',
        topics,
      },
    ],
    [
      'archived',
      {
        confidential: false,
        createdBy: 'alice',
        type: 'work',
        archived: true,
        topics,
      },
    ],
    [
      'merged',
      {
        archived: false,
        confidential: false,
        createdBy: 'alice',
        type: 'work',
        mergedInto: 'other',
        topics,
      },
    ],
  ]);
  const own = new ClientPersonalReportRepository(uid, records, projects);
  const authorized = new AuthorizedReportRepository(uid, records, projects);
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

    it('selects canonical topics without requiring a valid positive allocation', async () => {
      const repo = repository(kind);
      const page = await repo.read({
        projectId: 'project',
        userIds: [uid],
        from,
        to,
        topicId: 'target',
      });
      expect(page!.records.map((r) => r.id)).toEqual([
        'a-spanning',
        'b-open',
        'c-offset',
      ]);
    });

    it('rejects requested alias chains instead of resolving canonical membership', async () => {
      const repo = repository(kind, false, [
        ...topics,
        {
          archived: false,
          id: 'old',
          title: 'Old',
          mergedIntoTopicId: 'middle',
        },
        {
          archived: false,
          id: 'middle',
          title: 'Middle',
          mergedIntoTopicId: 'target',
        },
      ]);
      await expect(
        repo.read({ projectId: 'project', topicId: 'old' }),
      ).rejects.toThrow('Catálogo de tópicos contém aliases não suportados');
    });

    it('rejects record aliases even when the requested topic is canonical', async () => {
      const repo = repository(
        kind,
        false,
        [
          ...topics,
          {
            archived: false,
            id: 'old',
            title: 'Old',
            mergedIntoTopicId: 'target',
          },
        ],
        [record('alias-record', { topics: [{ topicId: 'old' }] })],
      );
      await expect(
        repo.read({ projectId: 'project', topicId: 'target' }),
      ).rejects.toThrow('Catálogo de tópicos contém aliases não suportados');
    });

    it('preserves missing historical topic IDs and hours without redirecting them', async () => {
      const historical = record('historical', {
        topics: [{ topicId: 'removed', percentage: 100 }],
      });
      const repo = repository(kind, false, topics, [historical]);
      const page = await repo.read({
        projectId: 'project',
        topicId: 'removed',
      });
      expect(page!.records).toEqual([{ ...historical, timeMultiplier: 1 }]);
      expect(
        (await repo.read({ projectId: 'project', topicId: 'target' }))!.records,
      ).toEqual([]);
      const breakdown = buildTopicBreakdown(
        page!.records,
        [{ id: historical.id, uid, projectId: 'project', minutes: 60 }],
        new Map([['project', { topics }]]),
      );
      expect(breakdown.byTopic).toEqual([
        expect.objectContaining({
          topicId: 'removed',
          label: 'Tópico sem identificação',
          minutes: 60,
        }),
      ]);
      expect(breakdown.unassignedMinutes).toBe(0);
      expect(breakdown.warnings).toEqual([
        expect.stringContaining('Tópico histórico ausente dos metadados'),
      ]);
      expect(await repo.context()).toEqual([
        { ...historical, timeMultiplier: 1 },
      ]);
    });

    it('preserves omitted include-all reads but defaults supplied options to active projects', async () => {
      const repo = repository(kind, true);
      const historical = await repo.read();
      expect(historical!.records.some((r) => r.projectId === 'project')).toBe(
        true,
      );
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
      [
        'project',
        {
          archived: false,
          confidential: false,
          createdBy: 'alice',
          type: 'work',
          topics,
        },
      ],
      [
        'other',
        {
          archived: false,
          confidential: false,
          createdBy: 'alice',
          type: 'work',
          topics,
        },
      ],
      [
        'archived',
        {
          confidential: false,
          createdBy: 'alice',
          type: 'work',
          archived: true,
          topics,
        },
      ],
      [
        'merged',
        {
          archived: false,
          confidential: false,
          createdBy: 'alice',
          type: 'work',
          mergedInto: 'other',
          topics,
        },
      ],
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
    archived: false,
    confidential: false,
    createdBy: 'alice',
    type: 'work',
    topics: [
      { archived: false, id: 'a', title: 'A', mergedIntoTopicId: 'b' },
      { archived: false, id: 'b', title: 'B', mergedIntoTopicId: 'a' },
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
  ).rejects.toThrow('Catálogo de tópicos contém aliases não suportados');
  await expect(
    company.readPage(100, undefined, 'project', { topicId: 'a' }),
  ).rejects.toThrow('Catálogo de tópicos contém aliases não suportados');
});
