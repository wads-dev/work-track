import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  compatibleMoveProject,
  moveConfirmation,
  type MovePreview,
} from '../../features/records/record-movement';
const preview: MovePreview = {
  mode: 'preview',
  operation: 'move_topic',
  project_origin: 'source',
  topic_origin: 'topic',
  project_target: 'target',
  topic_target: 'resolved',
  resolvedTopic: { id: 'resolved', title: 'Topic', willCreate: true },
  recordCount: 1,
  recordIds: ['record'],
  warnings: [],
  previewToken: 'a'.repeat(64),
};
const intent = {
  project_origin: 'source',
  topic_origin: 'topic',
  project_target: 'target',
  requestId: 'stable',
  reason: 'Move',
};
describe('audited record movement', () => {
  it('only same effective scope, legacy work compatible', () => {
    expect(compatibleMoveProject({ type: 'work' }, {})).toBe(true);
    expect(
      compatibleMoveProject({ type: 'personal' }, { type: 'personal' }),
    ).toBe(true);
    expect(compatibleMoveProject({ type: 'work' }, { type: 'personal' })).toBe(
      false,
    );
    expect(compatibleMoveProject({ type: 'invalid' }, {})).toBe(false);
  });
  it('rejects archived merged locked and aliased origin or destination', () => {
    for (const value of [
      { archived: true },
      { mergedInto: 'other' },
      { mergeLock: true },
      { topics: [{ mergedIntoTopicId: 'other' }] },
    ]) {
      expect(compatibleMoveProject(value, {})).toBe(false);
      expect(compatibleMoveProject({}, value)).toBe(false);
    }
  });
  it('requires human acknowledgement and same preview identity', () => {
    expect(() => moveConfirmation(intent, preview, false)).toThrow();
    for (const changed of [
      { ...preview, project_target: 'other' },
      { ...preview, project_origin: 'other' },
      { ...preview, topic_origin: 'other' },
      { ...preview, previewToken: '' },
      { ...preview, previewToken: 'malformed' },
      {
        ...preview,
        resolvedTopic: { ...preview.resolvedTopic, id: 'other' },
      },
      { ...preview, recordCount: 2 },
      { ...preview, recordCount: 2, recordIds: ['record', 'record'] },
      { ...preview, operation: 'move_record' as const },
      {
        ...preview,
        recordCount: 101,
        recordIds: Array.from({ length: 101 }, (_, i) => String(i)),
      },
    ])
      expect(() => moveConfirmation(intent, changed, true)).toThrow();
    expect(moveConfirmation(intent, preview, true)).toEqual({
      ...intent,
      confirmed: true,
      previewToken: 'a'.repeat(64),
    });
  });
  it('record confirmation includes canonical record in complete impact manifest', () => {
    expect(
      moveConfirmation(
        { recordId: 'record', project_target: 'target' },
        { ...preview, operation: 'move_record' },
        true,
      ).confirmed,
    ).toBe(true);
    expect(() =>
      moveConfirmation(
        { recordId: 'other', project_target: 'target' },
        { ...preview, operation: 'move_record' },
        true,
      ),
    ).toThrow();
  });
  it('record confirmation preserves optional corporate record owner', () => {
    const recordIntent = {
      recordId: 'record',
      recordOwnerUid: 'participant',
      project_target: 'target',
      topic_target: 'resolved',
    };
    expect(
      moveConfirmation(
        recordIntent,
        {
          ...preview,
          operation: 'move_record',
          records: [
            {
              recordId: 'record',
              ownerUid: 'participant',
              path: 'users/participant/records/record',
            },
          ],
        },
        true,
      ),
    ).toEqual({
      ...recordIntent,
      confirmed: true,
      previewToken: preview.previewToken,
    });
    expect(() =>
      moveConfirmation(
        { ...recordIntent, topic_target: 'other' },
        { ...preview, operation: 'move_record' },
        true,
      ),
    ).toThrow();
  });
  it('project topics expose no separate movement frontend', () => {
    const source = readFileSync(
      new URL('../../features/projects/ProjectTopics.tsx', import.meta.url),
      'utf8',
    );
    expect(source).not.toContain('MoveDialog');
    expect(source).not.toContain('moveTopic');
  });
  it('drawer edits project directly without a separate movement flow and preserves locks and audit', () => {
    const source = readFileSync(
      new URL('../../features/records/RecordDrawer.tsx', import.meta.url),
      'utf8',
    );
    expect(source).not.toContain('<MoveDialog');
    expect(source).not.toContain('Mover registro');
    expect(source).toContain('mutationBusy.current');
    expect(source).toContain('projectId: editedProject');
    expect(source).toContain('setEditedTopics([])');
    expect(source).toContain('acknowledgeSharedDestination');
    expect(source).toContain('<RecordAuditEvent');
    expect(source).toContain('record.uid === uid');
    expect(source).toContain('observeRecordDetail(db, uid, recordId');
    expect(source).toContain('detail.record');
    expect(source).not.toContain('snapshot.records');
    expect(source).toContain('setLoading(detail.loading)');
    expect(source).toContain('activeRecord && !editorDirty.current');
    expect(source).toContain('expectedUpdatedAt: editorVersion.current');
    for (const remote of ['onSnapshot', 'getDoc(', 'getDocs', 'httpsCallable'])
      expect(source).not.toContain(remote);
  });
});
it('accepts duplicate IDs only across distinct owner paths and rejects mismatched owner', () => {
  const records = [
    {
      recordId: 'record',
      ownerUid: 'alice',
      path: 'users/alice/records/record',
    },
    { recordId: 'record', ownerUid: 'bob', path: 'users/bob/records/record' },
  ];
  const p = {
    ...preview,
    recordCount: 2,
    recordIds: ['record', 'record'],
    records,
  };
  expect(moveConfirmation(intent, p, true).confirmed).toBe(true);
  expect(() =>
    moveConfirmation(
      intent,
      { ...p, records: [records[0]!, records[0]!] },
      true,
    ),
  ).toThrow();
  expect(() =>
    moveConfirmation(
      { recordId: 'record', recordOwnerUid: 'alice', project_target: 'target' },
      { ...preview, operation: 'move_record', records: [records[1]!] },
      true,
    ),
  ).toThrow();
});
