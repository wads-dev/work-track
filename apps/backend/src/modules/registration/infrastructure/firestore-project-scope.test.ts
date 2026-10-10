import { expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreProjectScopeRepository } from './firestore-project-scope.js';
import { projectScopeInput } from '@work-track/core/registration/domain/project-scope';
import { changeProjectScopeHandler } from '../presentation/change-project-scope.js';
function fixture() {
  const values = new Map<string, Record<string, unknown>>([
    [
      'projects/p',
      {
        id: 'p',
        type: 'personal',
        createdBy: 'alice',
        title: 'Private',
        topics: [],
        secret: 'keep',
      },
    ],
  ]);
  let inbound = false,
    fail = false;
  const ref = (path: string) => ({
    path,
    id: path.split('/').at(-1)!,
    collection: (name: string) => ({
      doc: (id: string) => ref(path + '/' + name + '/' + id),
    }),
  });
  const snap = (path: string) => ({
    ref: ref(path),
    id: path.split('/').at(-1)!,
    exists: values.has(path),
    data: () => values.get(path),
    updateTime: { toMillis: () => 1, nanoseconds: 0 },
  });
  const write = vi.fn();
  const query = (kind: string) => ({
    kind,
    where: () => query(kind),
    limit: () => query(kind),
  });
  const db = {
    collection: (name: string) => ({
      ...query(name),
      doc: (id: string) => ref(name + '/' + id),
    }),
    collectionGroup: () => query('records'),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const pending: Array<() => void> = [];
      const result = await fn({
        get: (r: { path?: string; kind?: string }) =>
          Promise.resolve(
            r.path
              ? snap(r.path)
              : r.kind === 'records'
                ? {
                    docs: [...values.keys()]
                      .filter((k) => k.startsWith('users/'))
                      .map(snap),
                  }
                : { empty: !inbound, docs: [] },
          ),
        update: (r: { path: string }, patch: Record<string, unknown>) => {
          write('update');
          pending.push(() =>
            values.set(r.path, { ...values.get(r.path), ...patch }),
          );
        },
        create: (r: { path: string }, v: Record<string, unknown>) => {
          write('create');
          pending.push(() => values.set(r.path, v));
        },
      });
      if (fail) throw new Error('abort');
      pending.forEach((f) => f());
      return result;
    },
  };
  return {
    values,
    write,
    repo: new FirestoreProjectScopeRepository(db as unknown as Firestore),
    inbound: () => (inbound = true),
    fail: () => (fail = true),
  };
}
const base = projectScopeInput.parse({
  projectId: 'p',
  type: 'work',
  requestId: 'req',
  reason: 'Compartilhar projeto',
});
it('preview0writes publishack atomic project-only audit fullbeforeafter and stable replay', async () => {
  const f = fixture();
  const original = {
    uid: 'alice',
    projectId: 'p',
    originalText: 'private',
    deletedAt: false,
  };
  f.values.set('users/alice/records/r', original);
  const preview = await f.repo.changeScope(base, 'alice');
  expect(preview).toMatchObject({
    mode: 'preview',
    recordCount: 1,
    requiresSharingAcknowledgement: true,
  });
  expect(f.write).not.toHaveBeenCalled();
  if (preview.mode !== 'preview') throw new Error('preview');
  const confirmed = {
    ...base,
    confirmed: true,
    previewToken: preview.previewToken,
  };
  await expect(f.repo.changeScope(confirmed, 'alice')).rejects.toThrow(
    'explicitamente',
  );
  const result = await f.repo.changeScope(
    { ...confirmed, acknowledgeSharedDestination: true },
    'alice',
  );
  expect(result).toMatchObject({ mode: 'execution', type: 'work' });
  expect(f.write).toHaveBeenCalledTimes(2);
  expect(f.values.get('users/alice/records/r')).toEqual(original);
  const audit = [...f.values.entries()].find(([p]) =>
    p.includes('/audit/'),
  )![1];
  expect(audit.before).toMatchObject({ type: 'personal', secret: 'keep' });
  expect(audit.after).toMatchObject({
    type: 'work',
    createdBy: 'alice',
    secret: 'keep',
  });
  expect(
    await f.repo.changeScope(
      { ...confirmed, acknowledgeSharedDestination: true },
      'alice',
    ),
  ).toEqual(result);
  expect(f.write).toHaveBeenCalledTimes(2);
  await expect(
    f.repo.changeScope(
      { ...confirmed, reason: 'Different', acknowledgeSharedDestination: true },
      'alice',
    ),
  ).rejects.toThrow('Retry');
  f.values.get('projects/p')!.title = 'changed';
  await expect(
    f.repo.changeScope(
      { ...confirmed, acknowledgeSharedDestination: true },
      'alice',
    ),
  ).rejects.toThrow('alterado');
});
it('creator missing/foreign UID invalidscope locks/archive/outbound/inbound and foreign evidence fail closed', async () => {
  for (const patch of [
    { createdBy: undefined },
    { createdBy: 'bob' },
    { type: 'unknown' },
    { type: undefined },
    { mergeLock: 'job' },
    { archived: true },
    { mergedInto: 'target' },
  ]) {
    const f = fixture();
    Object.assign(f.values.get('projects/p')!, patch);
    await expect(f.repo.changeScope(base, 'alice')).rejects.toThrow();
    expect(f.write).not.toHaveBeenCalled();
  }
  const f = fixture();
  f.inbound();
  await expect(f.repo.changeScope(base, 'alice')).rejects.toThrow('mesclagem');
  const g = fixture();
  g.values.get('projects/p')!.type = 'work';
  g.values.set('users/bob/records/r', {
    uid: 'bob',
    projectId: 'p',
    deletedAt: 0,
  });
  await expect(
    g.repo.changeScope({ ...base, type: 'personal' }, 'alice'),
  ).rejects.toThrow('participantes');
  expect(g.write).not.toHaveBeenCalled();
});
it('global->personal own-only succeeds and changes visibility metadata not facts; stale manifest blocks', async () => {
  const f = fixture();
  f.values.get('projects/p')!.type = 'work';
  const input = { ...base, type: 'personal' as const };
  const p = await f.repo.changeScope(input, 'alice');
  if (p.mode !== 'preview') throw new Error('preview');
  f.values.set('users/alice/records/r', { uid: 'alice', projectId: 'p' });
  await expect(
    f.repo.changeScope(
      { ...input, confirmed: true, previewToken: p.previewToken },
      'alice',
    ),
  ).rejects.toThrow('desatualizada');
  const p2 = await f.repo.changeScope(input, 'alice');
  if (p2.mode !== 'preview') throw new Error('preview');
  await expect(
    f.repo.changeScope(
      { ...input, confirmed: true, previewToken: p2.previewToken },
      'alice',
    ),
  ).resolves.toMatchObject({ type: 'personal' });
});
it('scan cap, source stale and transaction failure never partially change project', async () => {
  const f = fixture();
  for (let i = 0; i < 2001; i++)
    f.values.set('users/alice/records/r' + i, { uid: 'alice' });
  await expect(f.repo.changeScope(base, 'alice')).rejects.toThrow('2000');
  expect(f.write).not.toHaveBeenCalled();
  const g = fixture();
  const p = await g.repo.changeScope(base, 'alice');
  if (p.mode !== 'preview') throw new Error('preview');
  g.fail();
  await expect(
    g.repo.changeScope(
      {
        ...base,
        confirmed: true,
        previewToken: p.previewToken,
        acknowledgeSharedDestination: true,
      },
      'alice',
    ),
  ).rejects.toThrow('abort');
  expect(g.values.get('projects/p')!.type).toBe('personal');
  expect(
    [...g.values.keys()].filter((k) => k.includes('/audit/')),
  ).toHaveLength(0);
});
it('callable verifies corporate Google auth and strict confirmation schema', async () => {
  const f = fixture();
  await expect(changeProjectScopeHandler(f.repo, base)).rejects.toMatchObject({
    code: 'unauthenticated',
  });
  const auth = {
    uid: 'alice',
    token: {
      email: 'alice@wads.dev',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    },
  };
  await expect(
    changeProjectScopeHandler(f.repo, { ...base, uid: 'bob' }, auth),
  ).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(
    changeProjectScopeHandler(f.repo, { ...base, confirmed: true }, auth),
  ).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(
    changeProjectScopeHandler(f.repo, base, auth),
  ).resolves.toMatchObject({ mode: 'preview' });
});
