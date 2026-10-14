import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
const sdk = vi.hoisted(() => ({
  data: new Map<string, Record<string, unknown>>(),
  reads: [] as string[],
  writes: [] as Array<{ path: string; data: Record<string, unknown> }>,
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  runTransaction: async (
    _db: unknown,
    fn: (tx: unknown) => Promise<unknown>,
  ) => {
    const pending: typeof sdk.writes = [];
    const result = await fn({
      get: async (ref: { path: string }) => {
        if (pending.length) throw Error('read after write');
        sdk.reads.push(ref.path);
        return {
          exists: () => sdk.data.has(ref.path),
          data: () => structuredClone(sdk.data.get(ref.path)),
        };
      },
      update: (ref: { path: string }, data: Record<string, unknown>) =>
        pending.push({
          path: ref.path,
          data: { ...sdk.data.get(ref.path), ...data },
        }),
      set: (ref: { path: string }, data: Record<string, unknown>) =>
        pending.push({ path: ref.path, data }),
    });
    for (const write of pending) {
      sdk.data.set(write.path, structuredClone(write.data));
      sdk.writes.push(write);
    }
    return result;
  },
}));
import { WebProjectScopeRepository } from './web-project-scope';
import { WebRecordMovementRepository } from './web-record-movement';
const db = {} as Firestore;
const scope = new WebProjectScopeRepository(db);
const move = new WebRecordMovementRepository(db);
const scopeIntent = {
  projectId: 'source',
  type: 'personal' as const,
  requestId: 'scope',
  reason: 'explicit',
  confirmed: false,
  acknowledgeSharedDestination: false,
};
const moveIntent = {
  recordId: 'record',
  project_target: 'target',
  requestId: 'move',
  reason: 'explicit',
  confirmed: false,
};
const topic = {
  archived: false,
  id: 'topic',
  title: 'Tópico',
  description: 'Original description',
};
const recordPath = 'users/actor/records/record';
beforeEach(() => {
  sdk.data.clear();
  sdk.reads.length = 0;
  sdk.writes.length = 0;
  sdk.data.set('projects/source', {
    id: 'source',
    archived: false,
    confidential: false,
    type: 'work',
    createdBy: 'owner',
    title: 'Source',
    topics: [topic],
  });
  sdk.data.set('projects/target', {
    id: 'target',
    archived: false,
    confidential: false,
    type: 'work',
    createdBy: 'other',
    title: 'Target',
    description: 'Destination',
    topics: [],
  });
  sdk.data.set(recordPath, {
    deletedAt: null,
    endedAt: null,
    id: 'record',
    uid: 'actor',
    projectId: 'source',
    topics: [{ topicId: 'topic', percentage: 100 }],
    originalText: 'Preserve me',
    startedAt: '2026-01-01T12:00:00Z',
  });
});
describe('simple Web transactions', () => {
  it('changes only type for a public editor, preserves creator and never scans records', async () => {
    const before = structuredClone(sdk.data.get('projects/source'));
    const preview = await scope.changeScope(scopeIntent, 'actor');
    expect(preview.mode).toBe('preview');
    expect(sdk.writes).toHaveLength(0);
    const result = await scope.changeScope(
      {
        ...scopeIntent,
        confirmed: true,
        previewToken: 'previewToken' in preview ? preview.previewToken : '',
      },
      'actor',
    );
    expect(result.mode).toBe('execution');
    expect(sdk.data.get('projects/source')).toEqual({
      ...before,
      type: 'personal',
    });
    expect(
      sdk.reads.every(
        (p) =>
          p === 'projects/source' || p.startsWith('projects/source/audit/'),
      ),
    ).toBe(true);
    expect(sdk.writes).toHaveLength(2);
  });
  it('requires personal ownership and explicit sharing acknowledgement', async () => {
    sdk.data.set('projects/source', {
      ...sdk.data.get('projects/source'),
      type: 'personal',
    });
    const input = { ...scopeIntent, type: 'work' as const };
    await expect(scope.changeScope(input, 'actor')).rejects.toThrow();
    const preview = await scope.changeScope(input, 'owner');
    const confirmed = {
      ...input,
      confirmed: true,
      previewToken: 'previewToken' in preview ? preview.previewToken : '',
    };
    await expect(scope.changeScope(confirmed, 'owner')).rejects.toThrow();
    await scope.changeScope(
      { ...confirmed, acknowledgeSharedDestination: true },
      'owner',
    );
    expect(
      (
        await scope.changeScope(
          { ...confirmed, acknowledgeSharedDestination: true },
          'owner',
        )
      ).mode,
    ).toBe('execution');
    expect(sdk.writes).toHaveLength(2);
  });
  it('rejects absent project type even for its creator without writes', async () => {
    sdk.data.set('projects/source', { id: 'source', createdBy: 'owner' });
    for (const uid of ['owner', 'actor']) {
      await expect(scope.changeScope(scopeIntent, uid)).rejects.toThrow();
    }
    expect(sdk.writes).toHaveLength(0);
  });
  it('rejects stale scope preview without writes', async () => {
    sdk.data.set('projects/source', {
      id: 'source',
      createdBy: 'owner',
      archived: false,
      confidential: false,
      type: 'work',
    });
    const preview = await scope.changeScope(scopeIntent, 'actor');
    sdk.data.set('projects/source', {
      ...sdk.data.get('projects/source'),
      title: 'Changed',
    });
    await expect(
      scope.changeScope(
        {
          ...scopeIntent,
          confirmed: true,
          previewToken: 'previewToken' in preview ? preview.previewToken : '',
        },
        'actor',
      ),
    ).rejects.toThrow();
    expect(sdk.writes).toHaveLength(0);
  });
  it('creates one topic, moves own record preserving text/times and retries its audit receipt', async () => {
    const preview = await move.moveRecord(moveIntent, 'actor');
    expect(preview.resolvedTopic).toMatchObject({
      title: topic.title,
      willCreate: true,
    });
    expect(sdk.writes).toHaveLength(0);
    const input = {
      ...moveIntent,
      confirmed: true,
      previewToken: preview.previewToken as string,
    };
    const result = await move.moveRecord(input, 'actor');
    expect(sdk.data.get(recordPath)).toMatchObject({
      projectId: 'target',
      originalText: 'Preserve me',
      uid: 'actor',
      startedAt: '2026-01-01T12:00:00Z',
      topics: [{ topicId: preview.topic_target, percentage: 100 }],
    });
    expect(sdk.data.get('projects/source')).not.toHaveProperty('updatedAt');
    expect(sdk.writes).toHaveLength(3);
    expect(
      sdk.writes.some((w) => w.path.startsWith(recordPath + '/audit/')),
    ).toBe(true);
    expect(await move.moveRecord(input, 'actor')).toEqual(result);
    expect(sdk.writes).toHaveLength(3);
    expect(
      sdk.reads.every(
        (p) =>
          p === recordPath ||
          p.startsWith(recordPath + '/audit/') ||
          p === 'projects/source' ||
          p === 'projects/target',
      ),
    ).toBe(true);
  });
  it('reuses normalized exact title or explicit topic without changing projects', async () => {
    sdk.data.set('projects/target', {
      ...sdk.data.get('projects/target'),
      topics: [{ ...topic, id: 'existing', title: ' topico ' }],
    });
    for (const explicit of [false, true]) {
      const preview = await move.moveRecord(
        { ...moveIntent, ...(explicit ? { topic_target: 'existing' } : {}) },
        'actor',
      );
      expect(preview.topic_target).toBe('existing');
      expect(preview.resolvedTopic).toMatchObject({ willCreate: false });
    }
  });
  it('rejects reused request identity and ambiguous normalized titles', async () => {
    const preview = await move.moveRecord(moveIntent, 'actor');
    const input = {
      ...moveIntent,
      confirmed: true,
      previewToken: preview.previewToken as string,
    };
    await move.moveRecord(input, 'actor');
    await expect(
      move.moveRecord({ ...input, reason: 'different' }, 'actor'),
    ).rejects.toThrow();
    expect(sdk.writes).toHaveLength(3);
    sdk.data.set(recordPath, {
      ...sdk.data.get(recordPath),
      projectId: 'source',
      topics: [{ topicId: 'topic' }],
    });
    sdk.data.set('projects/target', {
      ...sdk.data.get('projects/target'),
      topics: [
        { ...topic, id: 'first' },
        { ...topic, id: 'second' },
      ],
    });
    await expect(
      move.moveRecord({ ...moveIntent, requestId: 'fresh' }, 'actor'),
    ).rejects.toThrow();
    const explicit = await move.moveRecord(
      { ...moveIntent, requestId: 'fresh', topic_target: 'first' },
      'actor',
    );
    expect(explicit.topic_target).toBe('first');
  });
  it('rejects foreign ownership, multiple topics, aliases, cross-scope and stale evidence', async () => {
    await expect(
      move.moveRecord({ ...moveIntent, recordOwnerUid: 'other' }, 'actor'),
    ).rejects.toThrow();
    const before = structuredClone(sdk.data.get(recordPath)!);
    sdk.data.set(recordPath, {
      ...before,
      topics: [{ topicId: 'topic' }, { topicId: 'second' }],
    });
    await expect(move.moveRecord(moveIntent, 'actor')).rejects.toThrow();
    sdk.data.set(recordPath, before);
    sdk.data.set('projects/target', {
      ...sdk.data.get('projects/target'),
      type: 'personal',
      createdBy: 'actor',
    });
    await expect(move.moveRecord(moveIntent, 'actor')).rejects.toThrow();
    sdk.data.set('projects/target', {
      ...sdk.data.get('projects/target'),
      archived: false,
      confidential: false,
      type: 'work',
    });
    const preview = await move.moveRecord(moveIntent, 'actor');
    sdk.data.set(recordPath, { ...before, originalText: 'Changed' });
    await expect(
      move.moveRecord(
        {
          ...moveIntent,
          confirmed: true,
          previewToken: preview.previewToken as string,
        },
        'actor',
      ),
    ).rejects.toThrow();
    sdk.data.set(recordPath, before);
    sdk.data.set('projects/source', {
      ...sdk.data.get('projects/source'),
      topics: [{ ...topic, mergedIntoTopicId: 'alias' }],
    });
    await expect(move.moveRecord(moveIntent, 'actor')).rejects.toThrow();
    expect(sdk.writes).toHaveLength(0);
  });
});
