import { expect, it } from 'vitest';
import { buildRecordEditPlan } from './record-edit-plan.js';
it('plans complete evidence and snapshots for both SDK adapters', () => {
  const before = {
    deletedAt: null,
    endedAt: null,
    uid: 'alice',
    projectId: 'p',
    startedAt: '2026-10-08T10:00:00Z',
    timeZone: 'UTC',
    originalText: 'original',
    interpretation: 'context',
    topics: [{ topicId: 't' }],
    requestId: 'intent',
  };
  const result = buildRecordEditPlan(
    before,
    {
      recordId: 'r',
      reason: 'correction',
      interpretation: 'new context',
      topics: [{ topicId: 't' }],
    },
    'alice',
    {
      title: 'P',
      description: 'Project',
      topics: [
        {
          archived: false,
          id: 't',
          title: 'Topic',
          description: 'Topic context',
        },
      ],
    },
    '2026-10-11T00:00:00Z',
  );
  expect(result.patch).toMatchObject({
    interpretation: 'new context',
    topicSnapshots: [{ id: 't' }],
  });
  expect(result.audit).toMatchObject({
    before: { interpretation: 'context' },
    after: { interpretation: 'new context', requestId: 'intent' },
    authorUid: 'alice',
  });
  expect(before.interpretation).toBe('context');
});
