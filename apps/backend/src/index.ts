import { initializeApp } from 'firebase-admin/app';
import { updateRecordHandler } from './modules/registration/presentation/update-record.js';
import { FirestoreRecordEditingRepository } from './modules/registration/infrastructure/firestore-record-editing.js';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { getProjectReportHandler } from './modules/reports/presentation/get-project-report.js';
import { FirestoreProjectReportRepository } from './modules/reports/infrastructure/firestore-project-report.js';
import { getHealth } from './core/health/health.js';
import { createApp } from './core/http/app.js';
import { WorkTrackOAuth } from './core/auth/application/oauth-provider.js';
import { FirebaseIdentityService } from './core/auth/infrastructure/firebase-identity.js';
import { FirestoreOAuthStore } from './core/auth/infrastructure/firestore-oauth-store.js';
import { FirestoreWorkRepository } from './modules/registration/infrastructure/firestore-work.js';

initializeApp();
export const updateRecord = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  (request) =>
    updateRecordHandler(
      new FirestoreRecordEditingRepository(getFirestore()),
      request.data as unknown,
      request.auth,
    ),
);
export const getProjectReport = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (request) => {
    try {
      return await getProjectReportHandler(
        new FirestoreProjectReportRepository(getFirestore(), getAuth()),
        request.data as unknown,
        request.auth,
      );
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error('Project report failed');
      throw new HttpsError(
        'internal',
        'Não foi possível consultar o relatório.',
      );
    }
  },
);
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
  createApp(
    provider,
    new FirestoreWorkRepository(getFirestore()),
    new FirestoreRecordEditingRepository(getFirestore()),
  ),
);
// Public diagnostic endpoint; never returns user data.
export const health = onRequest(
  { region: 'southamerica-east1', invoker: 'public', maxInstances: 2 },
  (_req, res) => {
    res.status(200).json(getHealth());
  },
);
