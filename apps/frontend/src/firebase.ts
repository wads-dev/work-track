import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

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
  const app = initializeApp(config as FirebaseOptions, 'work-track-dashboard');
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (emulator) {
    connectAuthEmulator(auth, 'http://' + location.hostname + ':9099');
    connectFirestoreEmulator(db, location.hostname, 8080);
  }
  await setPersistence(auth, browserSessionPersistence);
  return { auth, db };
}
export type Services = Awaited<ReturnType<typeof initializeServices>>;
