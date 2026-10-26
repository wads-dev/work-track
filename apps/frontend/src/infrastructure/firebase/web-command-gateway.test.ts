import { beforeEach, expect, it, vi } from 'vitest';
import type { Functions } from 'firebase/functions';
import type { CommandGateway } from '@work-track/core/contracts/command-gateway';
const mocks = vi.hoisted(() => ({
  uid: 'alice' as string | null,
  callable: vi.fn(),
  callableFactory: vi.fn(),
  web: vi.fn(),
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: (...args: unknown[]) => {
    mocks.callableFactory(...args);
    return mocks.callable;
  },
}));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: mocks.uid ? { uid: mocks.uid } : null }),
}));
vi.mock('firebase/firestore', () => ({ getFirestore: () => ({}) }));
vi.mock('./web-work-repository', () => ({
  WebWorkRepository: class {
    createProject = mocks.web;
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
  mocks.callableFactory.mockReset();
  mocks.web.mockReset();
  mocks.web.mockResolvedValue({ ok: true });
  mocks.callable.mockResolvedValue({ data: { backend: true } });
});
it('dispatches exactly eight Web names, preserves data envelope, never invokes their callable', async () => {
  expect([...webCommandNames].sort()).toEqual(
    [
      'archiveProject',
      'changeProjectScope',
      'createProject',
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
  expect(mocks.web).toHaveBeenCalledTimes(8);
  expect(mocks.callable).not.toHaveBeenCalled();
});
it('routes multiplier updates directly to the Web repository without callable and requires authentication', async () => {
  const input = {
    projectId: 'p',
    timeMultipliers: { alice: [{ multiplier: 0, effectiveFrom: null }] },
    expectedTimeMultipliers: null,
    requestId: 'r',
    reason: 'Configurar',
  };
  expect(await createWebCommand(functions, 'updateProject')(input)).toEqual({
    data: { ok: true },
  });
  expect(mocks.web).toHaveBeenCalledExactlyOnceWith(input, 'alice');
  expect(mocks.callableFactory).not.toHaveBeenCalled();
  expect(mocks.callable).not.toHaveBeenCalled();
  mocks.uid = null;
  await expect(
    createWebCommand(functions, 'updateProject')(input),
  ).rejects.toThrow('Autenticação');
});
it('rejects unknown and server-only names asynchronously without callable fallback', async () => {
  const gateway: CommandGateway = new WebCommandGateway(functions);
  for (const name of [
    'typo',
    'moveTopic',
    'register',
    'mergeTopics',
    'removeRecord',
    'deleteProject',
    'listCompanyPeople',
  ]) {
    const response = gateway.execute(name, {});
    expect(response).toBeInstanceOf(Promise);
    await expect(response).rejects.toThrow(
      'Comando Web desconhecido ou não suportado: ' + name,
    );
  }
  expect(mocks.callable).not.toHaveBeenCalled();
  expect(mocks.web).not.toHaveBeenCalled();
});
it('forwards creation payload and current uid preserving the existing data envelope', async () => {
  const input = {
    title: 'Projeto',
    description: 'Descrição generosa para o projeto.',
    type: 'personal',
    requestId: 'create-1',
  };
  mocks.web.mockResolvedValue({ id: 'created-id' });
  expect(await createWebCommand(functions, 'createProject')(input)).toEqual({
    data: { id: 'created-id' },
  });
  expect(mocks.web).toHaveBeenCalledWith(input, 'alice');
  expect(mocks.callable).not.toHaveBeenCalled();
});
it('requires current authenticated user before Web access and keeps UI error codes', async () => {
  mocks.uid = null;
  await expect(
    new WebCommandGateway(functions).execute('createProject', {}),
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
