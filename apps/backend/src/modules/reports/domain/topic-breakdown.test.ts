import { describe, expect, it } from 'vitest';
import type { ReportSourceRecord } from './project-report.js';
import { buildTopicBreakdown } from './topic-breakdown.js';

type Interval = Parameters<typeof buildTopicBreakdown>[1][number];
type Catalog = Parameters<typeof buildTopicBreakdown>[2];
type Metadata = NonNullable<ReturnType<Catalog['get']>>['topics'][number];
const make = (
  id: string,
  topics: ReportSourceRecord['topics'],
  extra: Partial<ReportSourceRecord> = {},
): ReportSourceRecord => ({
  id,
  uid: 'alice',
  projectId: 'project',
  startedAt: '2026-10-08T10:00:00Z',
  timeZone: 'UTC',
  topics,
  ...extra,
});
const interval = (record: ReportSourceRecord, minutes = 60): Interval => ({
  id: record.id,
  uid: record.uid,
  projectId: record.projectId,
  minutes,
});
const catalog = (
  topics: Metadata[] = [
    { id: 'a', title: 'Código' },
    { id: 'b', title: 'Reunião' },
    { id: 'general', title: 'Geral' },
  ],
): Catalog => new Map([['project', { topics }]]);
const run = (topics: ReportSourceRecord['topics'], minutes = 60) => {
  const record = make('record', topics);
  return buildTopicBreakdown([record], [interval(record, minutes)], catalog());
};
const minutesByTopic = (result: ReturnType<typeof buildTopicBreakdown>) =>
  result.byTopic.map(({ topicId, minutes }) => [topicId, minutes]);

describe('buildTopicBreakdown', () => {
  it('returns only the separate unassigned field for empty sources and intervals', () => {
    expect(buildTopicBreakdown([], [], new Map())).toEqual({
      byTopic: [],
      unassignedMinutes: 0,
      warnings: [],
    });
    const result = run([]);
    expect(result.byTopic).toEqual([]);
    expect(result.unassignedMinutes).toBe(60);
    expect(result.warnings).toEqual([]);
  });

  it('keeps matching titles and topic IDs separate by project, not by label', () => {
    const records = [
      make('b', [{ topicId: 'same' }], { projectId: 'second' }),
      make('a', [{ topicId: 'same' }], { projectId: 'first' }),
      make('c', [{ topicId: 'different' }], { projectId: 'first' }),
    ];
    const projects: Catalog = new Map([
      ['second', { topics: [{ id: 'same', title: 'Mesmo título' }] }],
      [
        'first',
        {
          topics: [
            { id: 'same', title: 'Mesmo título' },
            { id: 'different', title: 'Mesmo título' },
          ],
        },
      ],
    ]);
    const result = buildTopicBreakdown(
      records,
      records.map((r) => interval(r)),
      projects,
    );
    expect(
      result.byTopic.map(({ projectId, topicId, label, minutes }) => ({
        projectId,
        topicId,
        label,
        minutes,
      })),
    ).toEqual([
      {
        projectId: 'first',
        topicId: 'different',
        label: 'Mesmo título',
        minutes: 60,
      },
      {
        projectId: 'first',
        topicId: 'same',
        label: 'Mesmo título',
        minutes: 60,
      },
      {
        projectId: 'second',
        topicId: 'same',
        label: 'Mesmo título',
        minutes: 60,
      },
    ]);
    expect(result.unassignedMinutes).toBe(0);
  });

  it('uses collision-safe project/topic tuple keys', () => {
    const records = [
      make('x', [{ topicId: 'c' }], { projectId: 'a:b' }),
      make('y', [{ topicId: 'b:c' }], { projectId: 'a' }),
    ];
    const projects: Catalog = new Map([
      ['a:b', { topics: [{ id: 'c', title: 'One' }] }],
      ['a', { topics: [{ id: 'b:c', title: 'Two' }] }],
    ]);
    const result = buildTopicBreakdown(
      records,
      records.map((r) => interval(r)),
      projects,
    );
    expect(
      result.byTopic.map((t) => [t.projectId, t.topicId, t.minutes]),
    ).toEqual([
      ['a', 'b:c', 60],
      ['a:b', 'c', 60],
    ]);
  });

  it('aggregates only actual UIDs and sorts users deterministically', () => {
    const records = [
      make('b', [{ topicId: 'a' }], { uid: 'bob' }),
      make('a', [{ topicId: 'a' }]),
      make('c', [{ topicId: 'a' }]),
    ];
    const result = buildTopicBreakdown(
      records,
      [
        interval(records[0]!, 20),
        interval(records[1]!, 30),
        interval(records[2]!, 10),
      ],
      catalog(),
      { alice: 'Alice', bob: 'Bob', unrelated: 'Não deve aparecer' },
    );
    expect(result.byTopic).toEqual([
      {
        projectId: 'project',
        topicId: 'a',
        label: 'Código',
        minutes: 60,
        byUser: [
          { uid: 'alice', label: 'Alice', minutes: 40 },
          { uid: 'bob', label: 'Bob', minutes: 20 },
        ],
      },
    ]);
  });

  it('attributes the whole interval only for one topic without allocation', () => {
    const result = run([{ topicId: 'a' }]);
    expect(minutesByTopic(result)).toEqual([['a', 60]]);
    expect(result.unassignedMinutes).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it('does not distribute multiple unallocated topics evenly or combine them', () => {
    const result = run([{ topicId: 'a' }, { topicId: 'b' }]);
    expect(result.byTopic).toEqual([]);
    expect(result.unassignedMinutes).toBe(60);
    expect(result.warnings.join(' ')).toContain('ambígua');
  });

  it('preserves explicit partial duration and percentage with a separate remainder', () => {
    const result = run(
      [
        { topicId: 'a', durationMinutes: 20 },
        { topicId: 'b', percentage: 25 },
      ],
      120,
    );
    expect(minutesByTopic(result)).toEqual([
      ['a', 20],
      ['b', 30],
    ]);
    expect(result.unassignedMinutes).toBe(70);
    expect(result.byTopic.some((t) => t.topicId === '__unallocated__')).toBe(
      false,
    );
  });

  it('does not assign remainder to an unallocated topic next to an explicit topic', () => {
    const result = run([
      { topicId: 'a', durationMinutes: 10 },
      { topicId: 'b' },
    ]);
    expect(minutesByTopic(result)).toEqual([['a', 10]]);
    expect(result.unassignedMinutes).toBe(50);
  });

  it.each([
    [{ topicId: 'a', durationMinutes: 70 }],
    [
      { topicId: 'a', durationMinutes: 40 },
      { topicId: 'b', durationMinutes: 30 },
    ],
    [
      { topicId: 'a', percentage: 60 },
      { topicId: 'b', percentage: 60 },
    ],
  ])(
    'rejects an entire oversubscribed interval without truncation (%j)',
    (...topics) => {
      const result = run(topics);
      expect(result.byTopic).toEqual([]);
      expect(result.unassignedMinutes).toBe(60);
      expect(result.warnings.join(' ')).toContain('excedem');
      expect(result.warnings.join(' ')).toContain(
        'sem normalização ou truncamento',
      );
    },
  );

  it('does not remove valid attribution from a different interval when one is excessive', () => {
    const records = [
      make('bad', [{ topicId: 'a', durationMinutes: 100 }]),
      make('good', [{ topicId: 'a', durationMinutes: 30 }]),
    ];
    const result = buildTopicBreakdown(
      records,
      records.map((r) => interval(r)),
      catalog(),
    );
    expect(minutesByTopic(result)).toEqual([['a', 30]]);
    expect(result.unassignedMinutes).toBe(90);
  });

  it('gives valid duration precedence over percentage and warns', () => {
    const result = run([
      { topicId: 'a', durationMinutes: 10, percentage: 100 },
    ]);
    expect(minutesByTopic(result)).toEqual([['a', 10]]);
    expect(result.unassignedMinutes).toBe(50);
    expect(result.warnings.join(' ')).toContain('precedência');
  });

  it.each([NaN, Infinity, -Infinity, -2, 0])(
    'falls back to valid percentage when duration %s is invalid',
    (durationMinutes) => {
      const result = run([{ topicId: 'a', durationMinutes, percentage: 25 }]);
      expect(minutesByTopic(result)).toEqual([['a', 15]]);
      expect(result.unassignedMinutes).toBe(45);
      expect(result.warnings.join(' ')).toContain('alocação inválida');
      expect(result.warnings.join(' ')).toContain('precedência');
    },
  );

  it.each([NaN, Infinity, -Infinity, -2, 0, 101])(
    'rejects invalid percentage %s without inventing a sole-topic allocation',
    (percentage) => {
      const result = run([{ topicId: 'a', percentage }]);
      expect(result.byTopic).toEqual([]);
      expect(result.unassignedMinutes).toBe(60);
      expect(result.warnings.join(' ')).toContain('alocação inválida');
    },
  );

  it.each([NaN, Infinity, -Infinity, -2, 0])(
    'rejects invalid sole-topic duration %s',
    (durationMinutes) => {
      const result = run([{ topicId: 'a', durationMinutes }]);
      expect(result.byTopic).toEqual([]);
      expect(result.unassignedMinutes).toBe(60);
    },
  );

  it('accepts 100 percent and avoids overflow in a valid finite percentage', () => {
    expect(minutesByTopic(run([{ topicId: 'a', percentage: 100 }]))).toEqual([
      ['a', 60],
    ]);
    const result = run([{ topicId: 'a', percentage: 50 }], Number.MAX_VALUE);
    expect(result.byTopic[0]?.minutes).toBe(Number.MAX_VALUE / 2);
    expect(result.unassignedMinutes).toBe(Number.MAX_VALUE / 2);
    expect(Number.isFinite(result.byTopic[0]?.minutes)).toBe(true);
  });

  it('rejects a sum that overflows even though each allocation is finite', () => {
    const result = run(
      [
        { topicId: 'a', durationMinutes: Number.MAX_VALUE },
        { topicId: 'b', durationMinutes: Number.MAX_VALUE },
      ],
      Number.MAX_VALUE,
    );
    expect(result.byTopic).toEqual([]);
    expect(result.unassignedMinutes).toBe(Number.MAX_VALUE);
    expect(result.warnings.join(' ')).toContain('excedem');
  });

  it('resolves a metadata alias chain to the canonical ID and title without mutation', () => {
    const record = make('alias', [{ topicId: 'old' }]);
    const projects = catalog([
      { id: 'old', title: 'Old', mergedIntoTopicId: 'middle' },
      { id: 'middle', title: 'Middle', mergedIntoTopicId: 'a' },
      { id: 'a', title: 'Atual' },
    ]);
    const result = buildTopicBreakdown([record], [interval(record)], projects);
    expect(result.byTopic[0]).toMatchObject({
      topicId: 'a',
      label: 'Atual',
      minutes: 60,
    });
    expect(record.topics).toEqual([{ topicId: 'old' }]);
  });

  it('allows canonical aggregation across distinct intervals, not within one source', () => {
    const records = [
      make('alias', [{ topicId: 'old', durationMinutes: 20 }]),
      make('current', [{ topicId: 'a', percentage: 50 }], { uid: 'bob' }),
    ];
    const result = buildTopicBreakdown(
      records,
      records.map((r) => interval(r)),
      catalog([
        { id: 'old', title: 'Old', mergedIntoTopicId: 'a' },
        { id: 'a', title: 'Atual' },
      ]),
    );
    expect(minutesByTopic(result)).toEqual([['a', 50]]);
    expect(result.byTopic[0]?.byUser.map((u) => [u.uid, u.minutes])).toEqual([
      ['alice', 20],
      ['bob', 30],
    ]);
    expect(result.unassignedMinutes).toBe(70);
  });

  it('rejects the whole interval when two explicit originals resolve to one canonical ID', () => {
    const record = make('collision', [
      { topicId: 'old', durationMinutes: 10 },
      { topicId: 'a', percentage: 25 },
      { topicId: 'b', durationMinutes: 5 },
    ]);
    const originalTopics = structuredClone(record.topics);
    const result = buildTopicBreakdown(
      [record],
      [interval(record)],
      catalog([
        { id: 'old', title: 'Old', mergedIntoTopicId: 'a' },
        { id: 'a', title: 'Atual' },
        { id: 'b', title: 'Other' },
      ]),
    );
    expect(result.byTopic).toEqual([]);
    expect(result.unassignedMinutes).toBe(60);
    expect(result.warnings.join(' ')).toContain('convergem');
    expect(result.warnings.join(' ')).toContain('"old"');
    expect(result.warnings.join(' ')).toContain('"a"');
    expect(record.topics).toEqual(originalTopics);
  });

  it('rejects duplicate explicit source topic allocations instead of silently adding them', () => {
    const result = run([
      { topicId: 'a', durationMinutes: 10 },
      { topicId: 'a', durationMinutes: 10 },
    ]);
    expect(result.byTopic).toEqual([]);
    expect(result.unassignedMinutes).toBe(60);
    expect(result.warnings.join(' ')).toContain('convergem');
  });

  it('does not infer sole-topic attribution from multiple unallocated aliases', () => {
    const record = make('ambiguous-aliases', [
      { topicId: 'old' },
      { topicId: 'a' },
    ]);
    const result = buildTopicBreakdown(
      [record],
      [interval(record)],
      catalog([
        { id: 'old', title: 'Old', mergedIntoTopicId: 'a' },
        { id: 'a', title: 'Atual' },
      ]),
    );
    expect(result.byTopic).toEqual([]);
    expect(result.unassignedMinutes).toBe(60);
  });

  it.each([
    {
      topics: [{ id: 'old', title: 'Old', mergedIntoTopicId: 'missing' }],
      warning: 'Destino',
    },
    {
      topics: [
        { id: 'old', title: 'Old', mergedIntoTopicId: 'next' },
        { id: 'next', title: 'Next', mergedIntoTopicId: 'old' },
      ],
      warning: 'Ciclo',
    },
    {
      topics: [{ id: 'old', title: 'Old', mergedIntoTopicId: 'old' }],
      warning: 'Ciclo',
    },
  ])(
    'keeps broken alias resolution unassigned ($warning)',
    ({ topics, warning }) => {
      const record = make('broken-alias', [{ topicId: 'old' }]);
      const result = buildTopicBreakdown(
        [record],
        [interval(record)],
        catalog(topics),
      );
      expect(result.byTopic).toEqual([]);
      expect(result.unassignedMinutes).toBe(60);
      expect(result.warnings.join(' ')).toContain(warning);
    },
  );

  it.each([200, 201])(
    'bounds alias resolution to 200 metadata entries (%s)',
    (size) => {
      const topics = Array.from({ length: size }, (_, index) => ({
        id: 't' + index,
        title: 'Topic ' + index,
        ...(index < size - 1 ? { mergedIntoTopicId: 't' + (index + 1) } : {}),
      }));
      const record = make('chain', [{ topicId: 't0' }]);
      const result = buildTopicBreakdown(
        [record],
        [interval(record)],
        catalog(topics),
      );
      if (size === 200) {
        expect(minutesByTopic(result)).toEqual([['t199', 60]]);
        expect(result.unassignedMinutes).toBe(0);
      } else {
        expect(result.byTopic).toEqual([]);
        expect(result.unassignedMinutes).toBe(60);
        expect(result.warnings.join(' ')).toContain('200');
      }
    },
  );

  it('retains valid explicit topics while a broken alias allocation is unassigned', () => {
    const record = make('mixed-alias', [
      { topicId: 'old', durationMinutes: 20 },
      { topicId: 'a', durationMinutes: 10 },
    ]);
    const result = buildTopicBreakdown(
      [record],
      [interval(record)],
      catalog([
        { id: 'old', title: 'Old', mergedIntoTopicId: 'missing' },
        { id: 'a', title: 'Atual' },
      ]),
    );
    expect(minutesByTopic(result)).toEqual([['a', 10]]);
    expect(result.unassignedMinutes).toBe(50);
    expect(result.warnings.join(' ')).toContain('Destino');
  });

  it('retains a missing historical raw topic with a stable ID and neutral label', () => {
    const result = run([{ topicId: 'historic-topic' }]);
    expect(result.byTopic[0]).toMatchObject({
      projectId: 'project',
      topicId: 'historic-topic',
      label: 'Assunto sem identificação',
      minutes: 60,
    });
    expect(result.unassignedMinutes).toBe(0);
    expect(result.warnings.join(' ')).toContain('histórico');
  });

  it('keeps a missing project catalog entirely unassigned rather than using raw topics', () => {
    const record = make('absent-project', [{ topicId: 'a' }]);
    const result = buildTopicBreakdown([record], [interval(record)], new Map());
    expect(result.byTopic).toEqual([]);
    expect(result.unassignedMinutes).toBe(60);
    expect(result.warnings.join(' ')).toContain(
      'Metadados do projeto ausentes',
    );
  });

  it('uses neutral labels for blank topic metadata and rejects duplicate metadata IDs', () => {
    const record = make('blank-title', [{ topicId: 'a' }]);
    const result = buildTopicBreakdown(
      [record],
      [interval(record)],
      catalog([{ id: 'a', title: ' ' }]),
    );
    expect(result.byTopic[0]?.label).toBe('Assunto sem identificação');
    const duplicate = buildTopicBreakdown(
      [record],
      [interval(record)],
      catalog([
        { id: 'a', title: 'One' },
        { id: 'a', title: 'Two' },
      ]),
    );
    expect(duplicate.byTopic).toEqual([]);
    expect(duplicate.unassignedMinutes).toBe(60);
    expect(duplicate.warnings.join(' ')).toContain(
      'Metadados de assunto duplicados',
    );
  });

  it('keeps general as a real topic and never turns remainder into a synthetic topic', () => {
    const result = run([{ topicId: 'general', durationMinutes: 20 }]);
    expect(minutesByTopic(result)).toEqual([['general', 20]]);
    expect(result.byTopic[0]?.label).toBe('Geral');
    expect(result.unassignedMinutes).toBe(40);
  });

  it('never uses the raw UID or email as a fallback participant label', () => {
    const records = [
      make('email', [{ topicId: 'a' }], { uid: 'person@example.com' }),
      make('blank', [{ topicId: 'a' }], { uid: 'blank' }),
      make('inherited', [{ topicId: 'a' }], { uid: 'toString' }),
    ];
    const result = buildTopicBreakdown(
      records,
      records.map((r) => interval(r)),
      catalog(),
      { blank: ' ' },
    );
    expect(result.byTopic[0]?.byUser).toEqual([
      { uid: 'blank', label: 'Participante sem nome', minutes: 60 },
      {
        uid: 'person@example.com',
        label: 'Participante sem nome',
        minutes: 60,
      },
      { uid: 'toString', label: 'Participante sem nome', minutes: 60 },
    ]);
  });

  it.each(['id', 'uid', 'projectId'] as const)(
    'requires an exact source join for %s as well as the other two keys',
    (key) => {
      const record = make('source', [{ topicId: 'a' }]);
      const wrong = { ...interval(record), [key]: 'not-the-source' };
      const result = buildTopicBreakdown([record], [wrong], catalog());
      expect(result.byTopic).toEqual([]);
      expect(result.unassignedMinutes).toBe(60);
      expect(result.warnings.join(' ')).toContain('Fonte ausente');
    },
  );

  it('joins repeated record IDs across UIDs and projects without ambiguity', () => {
    const records = [
      make('same-record', [{ topicId: 'a' }]),
      make('same-record', [{ topicId: 'b' }], { uid: 'bob' }),
      make('same-record', [{ topicId: 'a' }], { projectId: 'second' }),
    ];
    const projects = catalog();
    projects.set('second', { topics: [{ id: 'a', title: 'Second' }] });
    const result = buildTopicBreakdown(
      records,
      [
        interval(records[2]!, 10),
        interval(records[1]!, 20),
        interval(records[0]!, 30),
      ],
      projects,
    );
    expect(
      result.byTopic.map((t) => [t.projectId, t.topicId, t.minutes]),
    ).toEqual([
      ['project', 'a', 30],
      ['project', 'b', 20],
      ['second', 'a', 10],
    ]);
    expect(result.unassignedMinutes).toBe(0);
  });

  it('uses collision-safe three-part source join keys', () => {
    const records = [
      make('c', [{ topicId: 'a' }], { projectId: 'p:a', uid: 'b' }),
      make('b:c', [{ topicId: 'b' }], { projectId: 'p', uid: 'a' }),
    ];
    const projects: Catalog = new Map([
      ['p:a', { topics: [{ id: 'a', title: 'A' }] }],
      ['p', { topics: [{ id: 'b', title: 'B' }] }],
    ]);
    const result = buildTopicBreakdown(
      records,
      records.map((r) => interval(r)),
      projects,
    );
    expect(
      result.byTopic.map((t) => [t.projectId, t.topicId, t.minutes]),
    ).toEqual([
      ['p', 'b', 60],
      ['p:a', 'a', 60],
    ]);
    expect(result.unassignedMinutes).toBe(0);
  });

  it('rejects duplicate matching sources, including identical duplicates', () => {
    const record = make('duplicate', [{ topicId: 'a' }]);
    const result = buildTopicBreakdown(
      [record, structuredClone(record)],
      [interval(record)],
      catalog(),
    );
    expect(result.byTopic).toEqual([]);
    expect(result.unassignedMinutes).toBe(60);
    expect(result.warnings.join(' ')).toContain('Fonte duplicada');
  });

  it('ignores source records without intervals and unrelated source duplicates', () => {
    const record = make('selected', [{ topicId: 'a' }]);
    const unrelated = make('not-selected', [{ topicId: 'b' }]);
    const result = buildTopicBreakdown(
      [record, unrelated, unrelated],
      [interval(record)],
      catalog(),
    );
    expect(minutesByTopic(result)).toEqual([['a', 60]]);
    expect(result.warnings).toEqual([]);
  });

  it.each([NaN, Infinity, -Infinity, -1])(
    'never propagates invalid interval minutes %s',
    (minutes) => {
      const result = run([{ topicId: 'a' }], minutes);
      expect(result.byTopic).toEqual([]);
      expect(result.unassignedMinutes).toBe(0);
      expect(result.warnings.join(' ')).toContain('minutos inválidos');
    },
  );

  it('does not emit zero-minute topic or user entries', () => {
    const result = run([{ topicId: 'a' }], 0);
    expect(result.byTopic).toEqual([]);
    expect(result.unassignedMinutes).toBe(0);
  });

  it('is deterministic across source, interval and catalog order', () => {
    const records = [
      make('z', [{ topicId: 'b' }], { uid: 'bob' }),
      make('a', [{ topicId: 'old', durationMinutes: 10 }]),
      make('b', [{ topicId: 'missing' }]),
    ];
    const topics: Metadata[] = [
      { id: 'old', title: 'Old', mergedIntoTopicId: 'a' },
      { id: 'a', title: 'Atual' },
      { id: 'b', title: 'B' },
    ];
    const intervals = records.map((r) => interval(r));
    expect(buildTopicBreakdown(records, intervals, catalog(topics))).toEqual(
      buildTopicBreakdown(
        [...records].reverse(),
        [...intervals].reverse(),
        catalog([...topics].reverse()),
      ),
    );
  });

  it('leaves deeply frozen records, allocations, intervals, metadata and labels unchanged', () => {
    const records = [
      make('frozen', [
        { topicId: 'old', durationMinutes: 20, percentage: 50 },
        { topicId: 'b' },
      ]),
    ];
    const projects = catalog([
      { id: 'old', title: 'Old', mergedIntoTopicId: 'a' },
      { id: 'a', title: 'Atual' },
      { id: 'b', title: 'B' },
    ]);
    const intervals = records.map((r) => interval(r));
    const labels = { alice: 'Alice' };
    const before = structuredClone({
      records,
      intervals,
      projects: [...projects],
      labels,
    });
    for (const record of records) {
      record.topics.forEach(Object.freeze);
      Object.freeze(record.topics);
      Object.freeze(record);
    }
    for (const project of projects.values()) {
      project.topics.forEach(Object.freeze);
      Object.freeze(project.topics);
      Object.freeze(project);
    }
    intervals.forEach(Object.freeze);
    Object.freeze(records);
    Object.freeze(intervals);
    Object.freeze(projects);
    Object.freeze(labels);
    const result = buildTopicBreakdown(records, intervals, projects, labels);
    expect(minutesByTopic(result)).toEqual([['a', 20]]);
    expect(result.unassignedMinutes).toBe(40);
    expect({ records, intervals, projects: [...projects], labels }).toEqual(
      before,
    );
  });
});
