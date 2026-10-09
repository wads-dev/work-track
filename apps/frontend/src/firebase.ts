import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  browserSessionPersistence,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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
  const app = initializeApp(config as FirebaseOptions, 'work-track-dashboard');
  const auth = getAuth(app);
  await setPersistence(auth, browserSessionPersistence);
  return { auth, db: getFirestore(app) };
}
export type Services = Awaited<ReturnType<typeof initializeServices>>;
