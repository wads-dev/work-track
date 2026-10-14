import { expect, it } from 'vitest';
import type { Project } from './work-model.js';
import {
  mergeTopicsInput,
  previewTopicMerge,
  resolveTopicId,
  canonicalizeTopics,
} from './topic-management.js';
const topics = ['general', 'a', 'b', 'c'].map((id) => ({
  archived: false,
  id,
  title: id,
  description: 'Synthetic topic',
}));
const project: Project = {
  archived: false,
  confidential: false,
  type: 'work',
  id: 'p',
  title: 'Project',
  description: 'Synthetic project scope',
  createdBy: 'u',
  createdAt: '2026-10-01T00:00:00Z',
  topics,
};
const input = mergeTopicsInput.parse({
  projectId: 'p',
  sourceTopicIds: ['a'],
  targetTopicId: 'b',
});
it('preview is explicit, no count fabricated and original catalog unchanged', () => {
  expect(previewTopicMerge(project, input)).toMatchObject({
    mode: 'preview',
    preservesRecords: true,
    recordImpact: { scope: 'not-scanned', count: null },
  });
  expect(topics[1]?.archived).toBe(false);
});
it('rejects confirmation without reason/request, duplicate/self/general/cross-project origins and locked projects', () => {
  expect(
    mergeTopicsInput.safeParse({ ...input, confirmed: true }).success,
  ).toBe(false);
  expect(
    mergeTopicsInput.safeParse({ ...input, sourceTopicIds: ['a', 'a'] })
      .success,
  ).toBe(false);
  expect(() =>
    previewTopicMerge(project, { ...input, sourceTopicIds: ['general'] }),
  ).toThrow();
  expect(() =>
    previewTopicMerge(project, { ...input, sourceTopicIds: ['missing'] }),
  ).toThrow();
  expect(() =>
    previewTopicMerge({ ...project, mergeLock: 'lock' }, input),
  ).toThrow();
  expect(() =>
    previewTopicMerge(project, { ...input, targetTopicId: 'a' }),
  ).toThrow();
});
it('rejects alias catalogs without following chains, cycles or missing destinations', () => {
  for (const destination of ['b', 'a', 'missing', '']) {
    const merged = topics.map((t) =>
      t.id === 'a'
        ? { ...t, archived: true, mergedIntoTopicId: destination }
        : t,
    );
    expect(() => resolveTopicId(merged, 'a')).toThrow('aliases não suportados');
    expect(() => resolveTopicId(merged, 'b')).toThrow('aliases não suportados');
    expect(() => canonicalizeTopics(merged, [])).toThrow(
      'aliases não suportados',
    );
    expect(() =>
      canonicalizeTopics(merged, [{ topicId: 'a', percentage: 25 }]),
    ).toThrow('aliases não suportados');
    expect(() =>
      previewTopicMerge({ ...project, topics: merged }, input),
    ).toThrow('aliases não suportados');
  }
  const chain = topics.map((t) =>
    t.id === 'a' || t.id === 'b' ? { ...t, mergedIntoTopicId: 'c' } : t,
  );
  expect(() => resolveTopicId(chain, 'a')).toThrow('aliases não suportados');
});
it('validates current IDs and explicit allocations without mapping or collapsing them', () => {
  const allocations = [
    { topicId: 'a', percentage: 25 },
    { topicId: 'b', durationMinutes: 10 },
  ];
  expect(resolveTopicId(topics, 'a')).toBe('a');
  expect(canonicalizeTopics(topics, allocations)).toEqual(allocations);
  expect(() =>
    canonicalizeTopics(topics, [{ topicId: 'a' }, { topicId: 'a' }]),
  ).toThrow('duplicados');
  expect(() => resolveTopicId(topics, 'old')).toThrow('não existe');
  expect(() =>
    resolveTopicId([{ ...topics[0]!, archived: true }], 'general'),
  ).toThrow('arquivado');
  expect(() => resolveTopicId([topics[0]!, topics[0]!], 'general')).toThrow(
    'inválido',
  );
  expect(() =>
    resolveTopicId(
      Array.from({ length: 201 }, (_, i) => ({
        id: String(i),
        archived: false,
      })),
      '0',
    ),
  ).toThrow('inválido');
});
