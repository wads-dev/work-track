import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  compatibleMoveProject,
  moveConfirmation,
  type MovePreview,
} from './record-movement';
const preview: MovePreview = {
  mode: 'preview',
  operation: 'move_subject',
  project_origin: 'source',
  subject_origin: 'topic',
  project_target: 'target',
  subject_target: 'resolved',
  resolvedSubject: { id: 'resolved', title: 'Topic', willCreate: true },
  recordCount: 1,
  recordIds: ['record'],
  warnings: [],
  previewToken: 'a'.repeat(64),
};
const intent = {
  project_origin: 'source',
  subject_origin: 'topic',
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
      { ...preview, subject_origin: 'other' },
      { ...preview, previewToken: '' },
      { ...preview, previewToken: 'malformed' },
      {
        ...preview,
        resolvedSubject: { ...preview.resolvedSubject, id: 'other' },
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
    expect(source).toContain('Transferência de assunto');
    expect(source).toContain('Origem:');
    expect(source).toContain('Destino:');
    expect(source).toContain('record.uid === uid');
    expect(source).toContain('Projeto reservado · Assuntos reservados');
    expect(source).toContain('isHidden(parent, revealed)');
    expect(source).toContain('movementSide(row.data.before)');
    expect(source).toContain('movementSide(row.data.after)');
  });
});
