import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  compatibleMoveProject,
  moveConfirmation,
  type MovePreview,
} from './record-movement';
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
  it('dialog uses topic contracts and explains scope and preserved ownership', () => {
    const source = readFileSync(
      new URL('./MoveDialog.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain("recordId ? 'moveRecord' : 'moveTopic'");
    expect(source).toContain('topic_origin: topicId');
    expect(source).toContain('topic_target: topic');
    expect(source).toContain('preview.resolvedTopic.title');
    expect(source).toContain('...(recordOwnerUid ? { recordOwnerUid } : {})');
    expect(source).toContain("source?.type === 'personal'");
    expect(source).toContain('move somente seus registros ativos');
    expect(source).toContain(
      'move os registros ativos de todos os participantes',
    );
    expect(source).toContain('propriedade dos registros serão preservados');
    expect(source).not.toMatch(
      /moveSubject|move_subject|subject_origin|subject_target|resolvedSubject/,
    );
    const topics = readFileSync(
      new URL('./ProjectTopics.tsx', import.meta.url),
      'utf8',
    );
    expect(topics).toContain('topicId={String(movingTopic.id)}');
  });
  it('dialog stable retry, cancellation and changed destination discard old preview', () => {
    const source = readFileSync(
      new URL('./MoveDialog.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('requestId: crypto.randomUUID()');
    expect(source).toContain('intent.current = null');
    expect(source).toContain('setPreview(null)');
    expect(source).toContain('moveConfirmation');
    expect(source).toContain('functions/failed-precondition');
    expect(source).toContain('ownRecordsRepository.invalidate()');
    expect(source).toContain('projectRepository.invalidate()');
    expect(source).not.toContain('setDoc(');
  });
  it('source hidden and destination privacy protected; explicit same-name behavior', () => {
    const source = readFileSync(
      new URL('./MoveDialog.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('!isHidden(p.data, revealed)');
    expect(source).toContain('isHidden(source, revealed)');
    expect(source).toContain('mergedIntoTopicId');
    expect(source).toContain('Mesmo nome no destino');
    expect(source).toContain('willCreate');
  });
  it('drawer shares synchronous lock and audit source/destination labels', () => {
    const source = readFileSync(
      new URL('./RecordDrawer.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('mutationBusy={mutationBusy}');
    expect(source).toContain('mutationBusy.current || moveOpen');
    expect(source).toContain('Mover registro');
    expect(source).toContain('Transferência de tópico');
    expect(source).toContain('Origem:');
    expect(source).toContain('Destino:');
    expect(source).toContain('record.uid === uid');
    expect(source).toContain('Projeto reservado · Tópicos reservados');
    expect(source).toContain('isHidden(parent, revealed)');
    expect(source).toContain('movementSide(row.data.before)');
    expect(source).toContain('movementSide(row.data.after)');
    expect(source).toContain("'move_topic',");
    expect(source).toContain("'move_subject',");
    expect(source).toContain("'move_record',");
    expect(source).toContain("row.data.action !== 'move_record'");
    expect(source).toContain('recordOwnerUid={');
    expect(source).toContain('!record || record.uid !== uid');
    expect(source).toContain("doc(db, 'users', uid, 'records', recordId)");
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
