import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  app: { name: 'work-track-dashboard' },
  auth: {},
  db: {},
  functions: {},
  manager: { kind: 'multi-tab' },
  cache: { kind: 'persistent' },
  initializeApp: vi.fn(),
  getAuth: vi.fn(),
  setPersistence: vi.fn(),
  initializeFirestore: vi.fn(),
  persistentLocalCache: vi.fn(),
  persistentMultipleTabManager: vi.fn(),
  connectAuthEmulator: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  connectFunctionsEmulator: vi.fn(),
  getFunctions: vi.fn(),
  style: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('firebase/app', () => ({ initializeApp: mocks.initializeApp }));
vi.mock('firebase/auth', () => ({
  getAuth: mocks.getAuth,
  setPersistence: mocks.setPersistence,
  browserLocalPersistence: 'local-auth',
  connectAuthEmulator: mocks.connectAuthEmulator,
}));
vi.mock('firebase/firestore', () => ({
  initializeFirestore: mocks.initializeFirestore,
  persistentLocalCache: mocks.persistentLocalCache,
  persistentMultipleTabManager: mocks.persistentMultipleTabManager,
  connectFirestoreEmulator: mocks.connectFirestoreEmulator,
}));
vi.mock('firebase/functions', () => ({
  getFunctions: mocks.getFunctions,
  connectFunctionsEmulator: mocks.connectFunctionsEmulator,
}));
import { initializeServices } from './firebase';
const config = { apiKey: 'public-key', projectId: 'wadsworktrack' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.initializeApp.mockReturnValue(mocks.app);
  mocks.getAuth.mockReturnValue(mocks.auth);
  mocks.getFunctions.mockReturnValue(mocks.functions);
  mocks.persistentMultipleTabManager.mockReturnValue(mocks.manager);
  mocks.persistentLocalCache.mockReturnValue(mocks.cache);
  mocks.initializeFirestore.mockReturnValue(mocks.db);
  mocks.setPersistence.mockResolvedValue(undefined);
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(config),
  });
  vi.stubGlobal('fetch', mocks.fetch);
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubGlobal('document', {
    documentElement: { style: { setProperty: mocks.style } },
  });
});
afterEach(() => vi.unstubAllGlobals());
it('initializes Firestore once with persistent multi-tab cache, separately from Auth persistence', async () => {
  expect(await initializeServices()).toEqual({
    auth: mocks.auth,
    db: mocks.db,
    functions: mocks.functions,
  });
  expect(mocks.initializeApp).toHaveBeenCalledWith(
    config,
    'work-track-dashboard',
  );
  expect(mocks.persistentMultipleTabManager).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.persistentLocalCache).toHaveBeenCalledExactlyOnceWith({
    tabManager: mocks.manager,
  });
  expect(mocks.initializeFirestore).toHaveBeenCalledExactlyOnceWith(mocks.app, {
    localCache: mocks.cache,
  });
  expect(mocks.setPersistence).toHaveBeenCalledWith(mocks.auth, 'local-auth');
  expect(mocks.connectFirestoreEmulator).not.toHaveBeenCalled();
});
it('connects isolated demo emulators only after configuring persistent cache', async () => {
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        ...config,
        projectId: 'demo-work-track',
        emulatorPorts: { auth: 9115, firestore: 8095, functions: 5015 },
      }),
  });
  await initializeServices();
  expect(mocks.initializeFirestore).toHaveBeenCalledExactlyOnceWith(mocks.app, {
    localCache: mocks.cache,
  });
  expect(mocks.initializeFirestore.mock.invocationCallOrder[0]!).toBeLessThan(
    mocks.connectFirestoreEmulator.mock.invocationCallOrder[0]!,
  );
  expect(mocks.connectFirestoreEmulator).toHaveBeenCalledWith(
    mocks.db,
    'localhost',
    8095,
  );
  expect(mocks.connectAuthEmulator).toHaveBeenCalledWith(
    mocks.auth,
    'http://localhost:9115',
  );
  expect(mocks.connectFunctionsEmulator).toHaveBeenCalledWith(
    mocks.functions,
    'localhost',
    5015,
  );
});
it('does not initialize persistence for malformed Hosting configuration', async () => {
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ projectId: 'wadsworktrack' }),
  });
  await expect(initializeServices()).rejects.toThrow(
    'Configuração Firebase inválida',
  );
  expect(mocks.initializeFirestore).not.toHaveBeenCalled();
  expect(mocks.persistentLocalCache).not.toHaveBeenCalled();
});
it('rejects demo projects outside localhost before enabling cache or services', async () => {
  vi.stubGlobal('location', { hostname: 'work.example.com' });
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ ...config, projectId: 'demo-work-track' }),
  });
  await expect(initializeServices()).rejects.toThrow(
    'Projeto demo permitido somente',
  );
  expect(mocks.initializeApp).not.toHaveBeenCalled();
  expect(mocks.persistentLocalCache).not.toHaveBeenCalled();
});
