import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { getHealth } from './core/health/health.js';
import { createApp } from './core/http/app.js';
import { WorkTrackOAuth } from './core/auth/application/oauth-provider.js';
import { FirebaseIdentityService } from './core/auth/infrastructure/firebase-identity.js';
import { FirestoreOAuthStore } from './core/auth/infrastructure/firestore-oauth-store.js';
import { FirestoreWorkRepository } from './modules/registration/infrastructure/firestore-work.js';

initializeApp();
const provider = new WorkTrackOAuth(
  new FirestoreOAuthStore(getFirestore()),
  new FirebaseIdentityService(getAuth()),
  'https://wadsworktrack.web.app',
);
export const api = onRequest(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  createApp(provider, new FirestoreWorkRepository(getFirestore())),
);
// Public diagnostic endpoint; never returns user data.
export const health = onRequest(
  { region: 'southamerica-east1', invoker: 'public', maxInstances: 2 },
  (_req, res) => {
    res.status(200).json(getHealth());
  },
);
