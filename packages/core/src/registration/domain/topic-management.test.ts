import { expect, it } from 'vitest';
import type { Project } from './work-model.js';
import {
  mergeTopicsInput,
  previewTopicMerge,
  resolveTopicId,
  canonicalizeTopics,
} from './topic-management.js';
const topics = ['general', 'a', 'b', 'c'].map((id) => ({
  id,
  title: id,
  description: 'Synthetic topic',
}));
const project: Project = {
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
  expect(topics[1]).not.toHaveProperty('archived');
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
it('resolves bounded alias chains, rejects cycles/missing/archived endpoints and ambiguous allocations without invented split', () => {
  const merged = topics.map((t) =>
    t.id === 'a' ? { ...t, archived: true, mergedIntoTopicId: 'b' } : t,
  );
  expect(resolveTopicId(merged, 'a')).toBe('b');
  expect(
    canonicalizeTopics(merged, [{ topicId: 'a', percentage: 25 }]),
  ).toEqual([{ topicId: 'b', percentage: 25 }]);
  expect(() =>
    canonicalizeTopics(merged, [{ topicId: 'a' }, { topicId: 'b' }]),
  ).toThrow('convergem');
  expect(() =>
    resolveTopicId(
      [
        { id: 'a', mergedIntoTopicId: 'b' },
        { id: 'b', mergedIntoTopicId: 'a' },
      ],
      'a',
    ),
  ).toThrow('Ciclo');
  expect(() =>
    resolveTopicId([{ id: 'a', mergedIntoTopicId: 'missing' }], 'a'),
  ).toThrow();
  expect(() =>
    previewTopicMerge({ ...project, topics: merged }, input),
  ).toThrow('já mesclada');
});
