import { describe, expect, it, vi } from 'vitest';

import { buildProjectReport } from '@work-track/core/reports/domain/build-project-report';
import type { CompanyReportRepository } from '@work-track/core/reports/domain/company-report';
import type { PersonalReportRepository } from '@work-track/core/reports/domain/personal-report';
import type {
  ProjectReportRepository,
  ReportPage,
  ReportSourceRecord,
} from '@work-track/core/reports/domain/project-report';
import type { TopicBreakdown } from '@work-track/core/reports/domain/topic-breakdown';
import { getCompanyReportHandler } from './get-company-report.js';
import { getPersonalReportHandler } from './get-personal-report.js';
import {
  getProjectReportHandler,
  type ReportAuth,
} from './get-project-report.js';

const auth: ReportAuth = {
  uid: 'alice',
  token: {
    email: 'alice@wads.dev',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  },
};
const input = { timeZone: 'America/Sao_Paulo' };
const asOf = Date.parse('2026-10-08T18:00:00-03:00');
type TopicCatalog = Awaited<ReturnType<PersonalReportRepository['readTopics']>>;
type CommonReport = Pick<TopicBreakdown, 'byTopic' | 'unassignedMinutes'> & {
  totalMinutes: number;
};
const aliases: TopicCatalog = {
  project: [
    { id: 'old', title: 'Anterior', mergedIntoTopicId: 'middle' },
    { id: 'middle', title: 'Intermediário', mergedIntoTopicId: 'code' },
    { id: 'code', title: 'Código atual' },
    { id: 'general', title: 'Geral' },
  ],
};

function record(
  id: string,
  topics: ReportSourceRecord['topics'],
  extra: Partial<ReportSourceRecord> = {},
): ReportSourceRecord {
  return {
    id,
    uid: 'alice',
    projectId: 'project',
    startedAt: '2026-10-08T10:00:00-03:00',
    endedAt: '2026-10-08T11:00:00-03:00',
    timeZone: 'America/Sao_Paulo',
    topics,
    ...extra,
  };
}

function personalRepository(
  records: ReportSourceRecord[],
  topics: TopicCatalog = aliases,
  archived: string[] = [],
) {
  return {
    readPage: vi.fn<PersonalReportRepository['readPage']>().mockResolvedValue({
      records,
      scannedCount: records.length,
      nextCursor: null,
    }),
    loadContext: vi
      .fn<PersonalReportRepository['loadContext']>()
      .mockResolvedValue(records),
    archivedProjectIds: vi
      .fn<PersonalReportRepository['archivedProjectIds']>()
      .mockResolvedValue(archived),
    readTopics: vi
      .fn<PersonalReportRepository['readTopics']>()
      .mockResolvedValue(topics),
  };
}

function companyRepository(
  records: ReportSourceRecord[],
  topics: TopicCatalog = aliases,
) {
  return {
    readPage: vi.fn<CompanyReportRepository['readPage']>().mockResolvedValue({
      records,
      scannedCount: records.length,
      nextCursor: null,
    }),
    loadContext: vi
      .fn<CompanyReportRepository['loadContext']>()
      .mockResolvedValue(records),
    archivedProjectIds: vi
      .fn<CompanyReportRepository['archivedProjectIds']>()
      .mockResolvedValue([]),
    userLabels: vi
      .fn<CompanyReportRepository['userLabels']>()
      .mockResolvedValue({ alice: 'Alice', bob: 'Bob' }),
    readTopics: vi
      .fn<CompanyReportRepository['readTopics']>()
      .mockResolvedValue(topics),
  };
}

function expectCommonTopicContract(report: CommonReport) {
  expect(Number.isFinite(report.unassignedMinutes)).toBe(true);
  expect(report.unassignedMinutes).toBeGreaterThanOrEqual(0);
  expect(
    report.byTopic.reduce((sum, topic) => sum + topic.minutes, 0) +
      report.unassignedMinutes,
  ).toBeCloseTo(report.totalMinutes);
  for (const topic of report.byTopic) {
    expect(Object.keys(topic).sort()).toEqual([
      'byUser',
      'label',
      'minutes',
      'projectId',
      'topicId',
    ]);
    expect(topic.topicId).not.toBe('__unallocated__');
    expect(topic.minutes).toBeGreaterThan(0);
    expect(
      topic.byUser.reduce((sum, user) => sum + user.minutes, 0),
    ).toBeCloseTo(topic.minutes);
    for (const user of topic.byUser) {
      expect(Object.keys(user).sort()).toEqual(['label', 'minutes', 'uid']);
      expect(user.minutes).toBeGreaterThan(0);
    }
  }
}

describe('personal report topic contract', () => {
  it('requires explicit verified corporate Google auth before reading topics or records', async () => {
    const repository = personalRepository([]);
    for (const invalid of [
      undefined,
      { ...auth, token: { ...auth.token, email: 'alice@example.com' } },
      { ...auth, token: { ...auth.token, email_verified: false } },
      {
        ...auth,
        token: { ...auth.token, firebase: { sign_in_provider: 'password' } },
      },
    ]) {
      await expect(
        getPersonalReportHandler(repository, input, invalid, asOf),
      ).rejects.toMatchObject({
        code: invalid ? 'permission-denied' : 'unauthenticated',
      });
    }
    await expect(
      getPersonalReportHandler(
        repository,
        { ...input, uid: 'bob' },
        auth,
        asOf,
      ),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    for (const read of Object.values(repository))
      expect(read).not.toHaveBeenCalled();
  });

  it('reads only its authenticated UID and explicitly passes it to topic metadata reads', async () => {
    const repository = personalRepository([
      record('own', [{ topicId: 'old' }]),
    ]);
    const result = await getPersonalReportHandler(
      repository,
      input,
      auth,
      asOf,
    );

    expect(repository.loadContext).toHaveBeenCalledExactlyOnceWith(['alice']);
    expect(repository.readTopics).toHaveBeenCalledExactlyOnceWith(
      ['project'],
      'alice',
    );
    expect(repository.readPage).not.toHaveBeenCalled();
    expect(result.byTopic).toEqual([
      {
        projectId: 'project',
        topicId: 'code',
        label: 'Código atual',
        minutes: 60,
        byUser: [{ uid: 'alice', label: 'Participante sem nome', minutes: 60 }],
      },
    ]);
    expect(result.unassignedMinutes).toBe(0);
    expectCommonTopicContract(result);
  });

  it('excludes archived intervals and their topics from the active selection', async () => {
    const repository = personalRepository(
      [
        record('active', [{ topicId: 'code', percentage: 50 }]),
        record('archived', [{ topicId: 'archive-topic' }], {
          projectId: 'archive',
          endedAt: '2026-10-08T12:00:00-03:00',
        }),
      ],
      {
        ...aliases,
        archive: [{ id: 'archive-topic', title: 'Histórico' }],
      },
      ['archive'],
    );
    const result = await getPersonalReportHandler(
      repository,
      input,
      auth,
      asOf,
    );

    expect(repository.archivedProjectIds).toHaveBeenCalledExactlyOnceWith([
      'project',
      'archive',
    ]);
    expect(repository.readTopics).toHaveBeenCalledExactlyOnceWith(
      ['project'],
      'alice',
    );
    expect(result.intervals.map((interval) => interval.id)).toEqual(['active']);
    expect(result.byProject).toEqual([{ projectId: 'project', minutes: 60 }]);
    expect(
      result.byTopic.map((topic) => [
        topic.projectId,
        topic.topicId,
        topic.minutes,
      ]),
    ).toEqual([['project', 'code', 30]]);
    expect(result.totalMinutes).toBe(60);
    expect(result.unassignedMinutes).toBe(30);
    expectCommonTopicContract(result);
  });

  it('attributes only the same date-clipped, project-filtered intervals as the report total', async () => {
    const repository = personalRepository([
      record(
        'clipped',
        [
          { topicId: 'old', percentage: 50 },
          { topicId: 'general', durationMinutes: 5 },
        ],
        { endedAt: '2026-10-08T12:00:00-03:00' },
      ),
      record('outside-period', [{ topicId: 'code' }], {
        startedAt: '2026-10-08T08:00:00-03:00',
        endedAt: '2026-10-08T09:00:00-03:00',
      }),
      record('outside-project', [{ topicId: 'code' }], { projectId: 'other' }),
    ]);
    const result = await getPersonalReportHandler(
      repository,
      {
        ...input,
        projectId: 'project',
        from: '2026-10-08T11:00:00-03:00',
        to: '2026-10-08T11:30:00-03:00',
      },
      auth,
      asOf,
    );

    expect(result.intervals).toMatchObject([
      {
        id: 'clipped',
        projectId: 'project',
        effectiveStartedAt: '2026-10-08T14:00:00.000Z',
        effectiveEndedAt: '2026-10-08T14:30:00.000Z',
        minutes: 30,
      },
    ]);
    expect(result.intervals).toHaveLength(1);
    expect(repository.readTopics).toHaveBeenCalledExactlyOnceWith(
      ['project'],
      'alice',
    );
    expect(
      result.byTopic.map((topic) => [topic.topicId, topic.minutes]),
    ).toEqual([
      ['code', 15],
      ['general', 5],
    ]);
    expect(result.totalMinutes).toBe(30);
    expect(result.unassignedMinutes).toBe(10);
    expectCommonTopicContract(result);
  });
});

describe('company report topic contract', () => {
  it('aggregates two UIDs per canonical topic without confusing repeated record IDs', async () => {
    const records = [
      record('same', [{ topicId: 'old', percentage: 50 }]),
      record('same', [{ topicId: 'code', percentage: 50 }], {
        uid: 'bob',
        endedAt: '2026-10-08T12:00:00-03:00',
      }),
    ];
    const repository = companyRepository(records);
    const result = await getCompanyReportHandler(repository, input, auth, asOf);

    expect(repository.loadContext).toHaveBeenCalledExactlyOnceWith([
      'alice',
      'bob',
    ]);
    expect(repository.userLabels).toHaveBeenCalledExactlyOnceWith([
      'alice',
      'bob',
    ]);
    expect(repository.readTopics).toHaveBeenCalledExactlyOnceWith(['project']);
    expect(result.byTopic).toEqual([
      {
        projectId: 'project',
        topicId: 'code',
        label: 'Código atual',
        minutes: 90,
        byUser: [
          { uid: 'alice', label: 'Alice', minutes: 30 },
          { uid: 'bob', label: 'Bob', minutes: 60 },
        ],
      },
    ]);
    expect(result.byUser).toEqual([
      { uid: 'alice', label: 'Alice', minutes: 60 },
      { uid: 'bob', label: 'Bob', minutes: 120 },
    ]);
    expect(result.totalMinutes).toBe(180);
    expect(result.unassignedMinutes).toBe(90);
    expectCommonTopicContract(result);
  });

  it('qualifies identical topic IDs and titles by project instead of merging them', async () => {
    const repository = companyRepository(
      [
        record('same', [{ topicId: 'code' }], { projectId: 'alpha' }),
        record('same', [{ topicId: 'code' }], {
          uid: 'bob',
          projectId: 'beta',
        }),
      ],
      {
        alpha: [{ id: 'code', title: 'Mesmo título' }],
        beta: [{ id: 'code', title: 'Mesmo título' }],
      },
    );
    const result = await getCompanyReportHandler(repository, input, auth, asOf);

    expect(result.byTopic).toEqual([
      {
        projectId: 'alpha',
        topicId: 'code',
        label: 'Mesmo título',
        minutes: 60,
        byUser: [{ uid: 'alice', label: 'Alice', minutes: 60 }],
      },
      {
        projectId: 'beta',
        topicId: 'code',
        label: 'Mesmo título',
        minutes: 60,
        byUser: [{ uid: 'bob', label: 'Bob', minutes: 60 }],
      },
    ]);
    expect(repository.readTopics).toHaveBeenCalledExactlyOnceWith([
      'alpha',
      'beta',
    ]);
    expect(result.totalMinutes).toBe(120);
    expect(result.unassignedMinutes).toBe(0);
    expectCommonTopicContract(result);
  });

  it('keeps the entire interval unassigned when explicit originals converge to one canonical topic', async () => {
    const records = [
      record('collision', [
        { topicId: 'old', durationMinutes: 20 },
        { topicId: 'code', percentage: 25 },
        { topicId: 'general', durationMinutes: 5 },
      ]),
    ];
    const before = structuredClone(records);
    const result = await getCompanyReportHandler(
      companyRepository(records),
      input,
      auth,
      asOf,
    );

    expect(result.totalMinutes).toBe(60);
    expect(result.byTopic).toEqual([]);
    expect(result.unassignedMinutes).toBe(60);
    expect(result.warnings.join(' ')).toContain('convergem');
    expect(result.warnings.join(' ')).toContain('"old"');
    expect(result.warnings.join(' ')).toContain('"code"');
    expect(records).toEqual(before);
    expectCommonTopicContract(result);
  });

  it('rejects excessive allocations without inflating totals or discarding another UID attribution', async () => {
    const records = [
      record('excessive', [
        { topicId: 'code', percentage: 70 },
        { topicId: 'general', percentage: 60 },
      ]),
      record('valid', [{ topicId: 'code', percentage: 25 }], { uid: 'bob' }),
    ];
    const before = structuredClone(records);
    const result = await getCompanyReportHandler(
      companyRepository(records),
      input,
      auth,
      asOf,
    );

    expect(result.totalMinutes).toBe(120);
    expect(result.byTopic).toEqual([
      {
        projectId: 'project',
        topicId: 'code',
        label: 'Código atual',
        minutes: 15,
        byUser: [{ uid: 'bob', label: 'Bob', minutes: 15 }],
      },
    ]);
    expect(result.unassignedMinutes).toBe(105);
    expect(result.warnings.join(' ')).toContain('excedem');
    expect(result.warnings.join(' ')).toContain(
      'sem normalização ou truncamento',
    );
    expect(records).toEqual(before);
    expectCommonTopicContract(result);
  });
});

describe('project report common topic contract', () => {
  it('uses alias metadata through the real handler and emits canonical topics with byUser', async () => {
    const records = [
      record('same', [{ topicId: 'old', percentage: 50 }]),
      record(
        'same',
        [
          { topicId: 'code', durationMinutes: 20 },
          { topicId: 'general', durationMinutes: 5 },
        ],
        { uid: 'bob' },
      ),
    ];
    const page: ReportPage = {
      records,
      nextCursor: null,
      topicLabels: { old: 'Rótulo legado', code: 'Cache obsoleto' },
      topics: aliases.project,
    };
    const repository = {
      readPage: vi
        .fn<ProjectReportRepository['readPage']>()
        .mockResolvedValue(page),
      loadContext: vi
        .fn<ProjectReportRepository['loadContext']>()
        .mockResolvedValue(records),
      userLabels: vi
        .fn<ProjectReportRepository['userLabels']>()
        .mockResolvedValue({ alice: 'Alice', bob: 'Bob' }),
    };
    const result = await getProjectReportHandler(
      repository,
      { projectId: 'project' },
      auth,
      asOf,
    );

    expect(repository.readPage).toHaveBeenNthCalledWith(
      1,
      'project',
      200,
      undefined,
      'alice',
    );
    expect(repository.readPage).toHaveBeenNthCalledWith(
      2,
      'project',
      500,
      undefined,
      'alice',
    );
    expect(repository.loadContext).toHaveBeenCalledExactlyOnceWith(
      ['alice', 'bob'],
      undefined,
    );
    expect(result.byTopic).toEqual([
      {
        projectId: 'project',
        topicId: 'code',
        label: 'Código atual',
        minutes: 50,
        byUser: [
          { uid: 'alice', label: 'Alice', minutes: 30 },
          { uid: 'bob', label: 'Bob', minutes: 20 },
        ],
      },
      {
        projectId: 'project',
        topicId: 'general',
        label: 'Geral',
        minutes: 5,
        byUser: [{ uid: 'bob', label: 'Bob', minutes: 5 }],
      },
    ]);
    expect(result.records.map((entry) => entry.topics)).toEqual([
      [{ topicId: 'code', minutes: 30 }],
      [
        { topicId: 'code', minutes: 20 },
        { topicId: 'general', minutes: 5 },
      ],
    ]);
    expect(result.scope).toBe('all-selected');
    expect(result.totalMinutes).toBe(120);
    expect(result.unassignedMinutes).toBe(65);
    expectCommonTopicContract(result);
  });

  it('keeps missing historical topics neutral and remainder separate without a synthetic topic', () => {
    const records = [
      record('unknown', [{ topicId: 'retired-topic', durationMinutes: 20 }]),
      record('unassociated', [], { uid: 'bob' }),
    ];
    const before = structuredClone(records);
    const result = buildProjectReport(
      'project',
      { records, topicLabels: {}, topics: [], nextCursor: null },
      200,
      asOf,
      {},
      false,
      records,
    );

    expect(result.byTopic).toEqual([
      {
        projectId: 'project',
        topicId: 'retired-topic',
        label: 'Tópico sem identificação',
        minutes: 20,
        byUser: [{ uid: 'alice', label: 'Participante sem nome', minutes: 20 }],
      },
    ]);
    expect(result.records.map((entry) => entry.topics)).toEqual([
      [{ topicId: 'retired-topic', minutes: 20 }],
      [],
    ]);
    expect(result.totalMinutes).toBe(120);
    expect(result.unassignedMinutes).toBe(100);
    expect(JSON.stringify(result)).not.toContain('__unallocated__');
    expect(result.warnings.join(' ')).toContain('histórico');
    expect(records).toEqual(before);
    expectCommonTopicContract(result);
  });
});
