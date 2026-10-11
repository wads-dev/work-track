import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  initializeAuth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

export function emulatorMode(projectId: string, hostname: string): boolean {
  if (projectId !== 'demo-work-track') return false;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1')
    throw new Error(
      'Projeto demo permitido somente em localhost ou 127.0.0.1.',
    );
  return true;
}
export async function initializeServices() {
  const response = await fetch('/__/firebase/init.json');
  if (!response.ok)
    throw new Error('Configuração Firebase indisponível. Recarregue a página.');
  const config: unknown = await response.json();
  if (
    !config ||
    typeof config !== 'object' ||
    !('apiKey' in config) ||
    typeof config.apiKey !== 'string' ||
    !config.apiKey ||
    !('projectId' in config) ||
    typeof config.projectId !== 'string' ||
    !config.projectId
  ) {
    throw new Error('Configuração Firebase inválida.');
  }
  const emulator = emulatorMode(config.projectId, location.hostname);
  document.documentElement.style.setProperty(
    '--emulator-inset',
    emulator ? '50px' : '0px',
  );
  const app = initializeApp(config as FirebaseOptions, 'work-track-dashboard');
  // Choose one persistence before restoring the user. getAuth() followed by
  // setPersistence() migrates localStorage → IndexedDB → localStorage in a new
  // tab, removing the shared auth key and making existing tabs observe a logout.
  const auth = initializeAuth(app, {
    persistence: browserLocalPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  // Keep queried documents in IndexedDB across reloads; coordinate the cache across tabs.
  // SDK handles unsupported/unavailable persistence; auth and snapshot freshness stay separate.
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
  const functions = getFunctions(app, 'southamerica-east1');
  if (emulator) {
    const ports =
      'emulatorPorts' in config
        ? (config.emulatorPorts as Record<string, unknown>)
        : {};
    const port = (key: string, fallback: number) => {
      const value = ports?.[key] ?? fallback;
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < 1 ||
        value > 65535
      )
        throw new Error('Porta de emulador inválida.');
      return value;
    };
    connectAuthEmulator(
      auth,
      'http://' + location.hostname + ':' + port('auth', 9099),
    );
    connectFirestoreEmulator(db, location.hostname, port('firestore', 8081));
    connectFunctionsEmulator(
      functions,
      location.hostname,
      port('functions', 5001),
    );
  }
  // Connect demo emulators synchronously above, before restoration makes requests.
  // Never expose services to protected pages before the persisted session settles.
  await auth.authStateReady();
  return { auth, db, functions };
}
export type Services = Awaited<ReturnType<typeof initializeServices>>;
