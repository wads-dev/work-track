import { beforeEach, expect, it, vi } from 'vitest';
import type { Functions } from 'firebase/functions';
const mocks = vi.hoisted(() => ({
  uid: 'alice' as string | null,
  callable: vi.fn(),
  web: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: () => mocks.callable }));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: mocks.uid ? { uid: mocks.uid } : null }),
}));
vi.mock('firebase/firestore', () => ({ getFirestore: () => ({}) }));
vi.mock('./web-work-repository', () => ({
  WebWorkRepository: class {
    archiveProject = mocks.web;
    updateProject = mocks.web;
    updateTopic = mocks.web;
    updateRecord = mocks.web;
    listTopicMerges = mocks.web;
  },
}));
vi.mock('./web-project-scope', () => ({
  WebProjectScopeRepository: class {
    changeScope = mocks.web;
  },
}));
vi.mock('./web-record-movement', () => ({
  WebRecordMovementRepository: class {
    moveRecord = mocks.web;
  },
}));
import {
  WebCommandGateway,
  createWebCommand,
  webCommandNames,
} from './web-command-gateway';
const functions = { app: {} } as Functions;
beforeEach(() => {
  mocks.uid = 'alice';
  mocks.callable.mockReset();
  mocks.web.mockReset();
  mocks.web.mockResolvedValue({ ok: true });
  mocks.callable.mockResolvedValue({ data: { backend: true } });
});
it('dispatches exactly six Web names, preserves data envelope, never invokes their callable', async () => {
  expect([...webCommandNames].sort()).toEqual(
    [
      'archiveProject',
      'changeProjectScope',
      'listTopicMerges',
      'moveRecord',
      'updateProject',
      'updateRecord',
      'updateTopic',
    ].sort(),
  );
  for (const name of webCommandNames) {
    const input =
      name === 'changeProjectScope'
        ? { projectId: 'p', type: 'work', requestId: 'req', reason: 'Mudar' }
        : name === 'moveRecord'
          ? {
              recordId: 'r',
              project_target: 'p',
              requestId: 'req',
              reason: 'Mover',
            }
          : {};
    expect(await createWebCommand(functions, name)(input)).toEqual({
      data: { ok: true },
    });
  }
  expect(mocks.web).toHaveBeenCalledTimes(7);
  expect(mocks.callable).not.toHaveBeenCalled();
});
it('leaves moveTopic and remaining backend commands on callable transport', async () => {
  const gateway = new WebCommandGateway(functions);
  for (const name of ['moveTopic', 'register', 'mergeTopics', 'removeRecord'])
    expect(await gateway.execute(name, {})).toEqual({ backend: true });
  expect(mocks.callable).toHaveBeenCalledTimes(4);
  expect(mocks.web).not.toHaveBeenCalled();
});
it('requires current authenticated user before Web access and keeps UI error codes', async () => {
  mocks.uid = null;
  await expect(
    new WebCommandGateway(functions).execute('archiveProject', {}),
  ).rejects.toThrow('Autenticação');
  expect(mocks.web).not.toHaveBeenCalled();
  mocks.uid = 'alice';
  mocks.web.mockRejectedValue(
    Object.assign(new Error('Stale'), { code: 'aborted' }),
  );
  await expect(
    createWebCommand(functions, 'updateRecord')({}),
  ).rejects.toMatchObject({ code: 'functions/aborted' });
});
