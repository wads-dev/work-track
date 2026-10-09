import { expect, it } from 'vitest';
import { applyRecordPatch, updateRecordInput } from './record-edit.js';
const before = {
  id: 'record',
  uid: 'alice',
  projectId: 'project',
  startedAt: '2026-10-08T10:00:00Z',
  timeZone: 'UTC',
  originalText: 'original',
  interpretation: 'context',
  requestId: 'intent',
  fingerprint: 'immutable',
  recordedAt: 'immutable',
  topics: [{ topicId: 'general' }],
};
const project = { topics: [{ id: 'general' }] };
it('edits only the allowed facts, preserving original evidence', () => {
  const input = updateRecordInput.parse({
    recordId: 'record',
    endedAt: '2026-10-08T11:00:00Z',
    reason: 'fim confirmado',
    expectedUpdatedAt: null,
  });
  const after = applyRecordPatch(before, input, 'alice', project);
  expect(after).toMatchObject({ ...before, endedAt: '2026-10-08T11:00:00Z' });
  expect(before).not.toHaveProperty('endedAt');
  expect(
    applyRecordPatch(
      after,
      { recordId: 'record', endedAt: null, reason: 'reabrir' },
      'alice',
      project,
    ),
  ).not.toHaveProperty('endedAt');
});
it('rejects owner spoofing, invalid intervals, concurrency and missing topics', () => {
  expect(() =>
    applyRecordPatch(
      before,
      { recordId: 'record', endedAt: '2026-10-08T11:00:00Z', reason: 'edit' },
      'bob',
      project,
    ),
  ).toThrow('dono');
  expect(() =>
    applyRecordPatch(
      before,
      { recordId: 'record', endedAt: '2026-10-08T09:00:00Z', reason: 'edit' },
      'alice',
      project,
    ),
  ).toThrow('Fim');
  expect(() =>
    applyRecordPatch(
      { ...before, updatedAt: 'new' },
      {
        recordId: 'record',
        endedAt: null,
        reason: 'edit',
        expectedUpdatedAt: null,
      },
      'alice',
      project,
    ),
  ).toThrow('Recarregue');
  expect(() =>
    applyRecordPatch(
      before,
      { recordId: 'record', topics: [{ topicId: 'missing' }], reason: 'edit' },
      'alice',
      project,
    ),
  ).toThrow('Tópico');
});
it('rejects extraneous immutable fields and invalid input', () => {
  expect(
    updateRecordInput.safeParse({
      recordId: 'record',
      endedAt: null,
      reason: 'edit',
      uid: 'bob',
    }).success,
  ).toBe(false);
  expect(
    updateRecordInput.safeParse({
      recordId: '../bad',
      endedAt: null,
      reason: 'edit',
    }).success,
  ).toBe(false);
  expect(
    updateRecordInput.safeParse({ recordId: 'record', reason: 'no patch' })
      .success,
  ).toBe(false);
});
