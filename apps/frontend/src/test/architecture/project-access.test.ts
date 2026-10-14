import { describe, it, expect } from 'vitest';
import {
  scopeDisabledReason,
  scopeConfirmation,
  type ScopePreview,
} from '../../features/projects/project-access';
import { readFileSync } from 'node:fs';
import { projectRepository } from '../../data/cache/project-repository';
import { projectAccessRevision } from '../../data/cache/project-access-revision';
const intent = {
  projectId: 'project',
  type: 'work' as const,
  reason: 'explicit',
  requestId: 'stable',
};
const preview: ScopePreview = {
  mode: 'preview',
  projectId: 'project',
  fromType: 'personal',
  toType: 'work',
  recordCount: 1,
  requiresSharingAcknowledgement: true,
  warnings: [],
  previewToken: 'token',
};
describe('project access', () => {
  it('personal requires owner; work allows authenticated editors and missing type is denied', () => {
    for (const project of [
      { createdBy: 'owner', type: 'personal' },
      { type: 'work' },
      { createdBy: 'other', type: 'work' },
    ])
      expect(scopeDisabledReason(project, 'owner')).toBe('');
    expect(scopeDisabledReason({ type: 'work' }, '')).not.toBe('');
    for (const project of [
      { createdBy: 'other' },
      { createdBy: 'owner' },
      { createdBy: 'other', type: 'personal' },
      { createdBy: 'owner', type: 'work', archived: true },
      { createdBy: 'owner', type: 'work', mergedInto: 'target' },
      { createdBy: 'owner', type: 'work', mergeLock: {} },
      { createdBy: 'owner', type: 'unknown' },
    ])
      expect(scopeDisabledReason(project, 'owner')).not.toBe('');
  });
  it('requires explicit org acknowledgement even if preview flag false', () => {
    expect(() => scopeConfirmation(intent, preview, false)).toThrow();
    expect(() =>
      scopeConfirmation(
        intent,
        { ...preview, requiresSharingAcknowledgement: false },
        false,
      ),
    ).toThrow();
    expect(scopeConfirmation(intent, preview, true)).toEqual({
      ...intent,
      confirmed: true,
      previewToken: 'token',
      acknowledgeSharedDestination: true,
    });
  });
  it('cannot reuse preview for another target project or scope', () => {
    expect(() =>
      scopeConfirmation({ ...intent, projectId: 'other' }, preview, true),
    ).toThrow();
    expect(() =>
      scopeConfirmation({ ...intent, type: 'personal' }, preview, true),
    ).toThrow();
  });
  it('catalog invalidation synchronously fences all report access caches', () => {
    const before = projectAccessRevision();
    projectRepository.invalidate();
    expect(projectAccessRevision()).toBe(before + 1);
    for (const file of [
      '../../features/reports/ProjectReport.tsx',
      '../../features/reports/PersonalPage.tsx',
    ]) {
      const source = readFileSync(
        new URL('./' + file, import.meta.url),
        'utf8',
      );
      expect(source).toContain('reportAccessRevision === accessRevision');
      expect(source).toContain('projectAccessRevision() !== accessRevision');
    }
  });
  it('staged persisted controls, clear cancelled request identities and no stale form writes', () => {
    const source = readFileSync(
      new URL('../../features/projects/ProjectAccess.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('value={scope}');
    expect(source).toContain('value={String(confidential)}');
    expect(source).toContain('Confirmar mudança para Global');
    expect(source).toContain('Confidencialidade não impede esse acesso');
    expect(source).toContain('crypto.randomUUID()');
    const close = source.slice(
      source.indexOf('const close ='),
      source.indexOf('return (', source.indexOf('const close =')),
    );
    expect(close).toContain('scopeIntent.current = null');
    expect(close).toContain('confidentialIntent.current = null');
    const form = readFileSync(
      new URL('../../features/projects/ProjectEditor.tsx', import.meta.url),
      'utf8',
    );
    expect(form).not.toContain('setConfidential');
    expect(form).not.toContain('        confidential,');
  });
});
