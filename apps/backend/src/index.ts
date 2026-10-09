import { initializeApp } from 'firebase-admin/app';
import { FirestoreTopicReportRepository } from './modules/reports/infrastructure/firestore-topic-report.js';
import { getTopicReportHandler } from './modules/reports/presentation/get-topic-report.js';
import { FirestoreCalendarReportRepository } from './modules/reports/infrastructure/firestore-calendar-report.js';
import { getCalendarReportHandler } from './modules/reports/presentation/get-calendar-report.js';
import { FirestoreRecordMovementRepository } from './modules/registration/infrastructure/firestore-record-movement.js';
import { movementHandler } from './modules/registration/presentation/record-movement.js';
import { changeProjectScopeHandler } from './modules/registration/presentation/change-project-scope.js';
import { FirestoreProjectScopeRepository } from './modules/registration/infrastructure/firestore-project-scope.js';
import { FirestoreRemovalRepository } from './modules/removal/infrastructure/firestore-removal.js';
import { FirestoreSplitRepository } from './modules/split/infrastructure/firestore-split.js';
import { FirestoreDailyHoursRepository } from './modules/daily-hours/infrastructure/firestore-daily-hours.js';
import { getCompanyReportHandler } from './modules/reports/presentation/get-company-report.js';
import { FirestoreCompanyReportRepository } from './modules/reports/infrastructure/firestore-company-report.js';
import { getPersonalReportHandler } from './modules/reports/presentation/get-personal-report.js';
import { FirestorePersonalReportRepository } from './modules/reports/infrastructure/firestore-personal-report.js';
import { manageProjectHandler } from './modules/registration/presentation/manage-projects.js';
import { FirestoreTopicManagementRepository } from './modules/registration/infrastructure/firestore-topic-management.js';
import { manageTopicsHandler } from './modules/registration/presentation/manage-topics.js';
import { listProjectsHandler } from './modules/registration/presentation/list-projects.js';
import { createProjectHandler } from './modules/registration/presentation/create-project.js';
import { FirestoreProjectManagementRepository } from './modules/registration/infrastructure/firestore-project-management.js';
import { updateRecordHandler } from './modules/registration/presentation/update-record.js';
import { FirestoreRecordEditingRepository } from './modules/registration/infrastructure/firestore-record-editing.js';
import { getAuth } from 'firebase-admin/auth';
import { FirestorePauseRepository } from './modules/pause/infrastructure/firestore-pause.js';
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
export const getTopicReport = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  (request) =>
    getTopicReportHandler(
      new FirestoreTopicReportRepository(getFirestore(), getAuth()),
      request.data as unknown,
      request.auth,
    ),
);
export const getCalendarReport = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  (request) =>
    getCalendarReportHandler(
      new FirestoreCalendarReportRepository(getFirestore(), getAuth()),
      request.data as unknown,
      request.auth,
    ),
);
export const moveSubject = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  (request) =>
    movementHandler(
      new FirestoreRecordMovementRepository(getFirestore()),
      'move_subject',
      request.data as unknown,
      request.auth,
    ),
);
export const moveRecord = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  (request) =>
    movementHandler(
      new FirestoreRecordMovementRepository(getFirestore()),
      'move_record',
      request.data as unknown,
      request.auth,
    ),
);
export const changeProjectScope = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  (request) =>
    changeProjectScopeHandler(
      new FirestoreProjectScopeRepository(getFirestore()),
      request.data as unknown,
      request.auth,
    ),
);
export const getCompanyReport = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  (request) =>
    getCompanyReportHandler(
      new FirestoreCompanyReportRepository(getFirestore(), getAuth()),
      request.data as unknown,
      request.auth,
    ),
);
export const archiveProject = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  (request) =>
    manageProjectHandler(
      new FirestoreProjectManagementRepository(getFirestore()),
      'archive',
      request.data as unknown,
      request.auth,
    ),
);
export const getPersonalReport = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  (request) =>
    getPersonalReportHandler(
      new FirestorePersonalReportRepository(getFirestore()),
      request.data as unknown,
      request.auth,
    ),
);
export const updateProject = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  (request) =>
    manageProjectHandler(
      new FirestoreProjectManagementRepository(getFirestore()),
      'update',
      request.data as unknown,
      request.auth,
    ),
);
export const mergeProjects = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  (request) =>
    manageProjectHandler(
      new FirestoreProjectManagementRepository(getFirestore()),
      'merge',
      request.data as unknown,
      request.auth,
    ),
);
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
    new FirestoreProjectManagementRepository(getFirestore()),
    new FirestoreTopicManagementRepository(getFirestore()),
    new FirestoreDailyHoursRepository(getFirestore()),
    new FirestorePauseRepository(getFirestore()),
    new FirestoreSplitRepository(getFirestore()),
    new FirestoreRemovalRepository(getFirestore()),
    new FirestoreRecordMovementRepository(getFirestore()),
  ),
);
export const createProject = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  (request) =>
    createProjectHandler(
      new FirestoreWorkRepository(getFirestore()),
      request.data as unknown,
      request.auth,
    ),
);
export const listProjects = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  (request) =>
    listProjectsHandler(
      new FirestoreWorkRepository(getFirestore()),
      request.data as unknown,
      request.auth,
    ),
);
export const mergeTopics = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  (request) =>
    manageTopicsHandler(
      new FirestoreTopicManagementRepository(getFirestore()),
      'merge',
      request.data as unknown,
      request.auth,
    ),
);
export const listTopicMerges = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  (request) =>
    manageTopicsHandler(
      new FirestoreTopicManagementRepository(getFirestore()),
      'history',
      request.data as unknown,
      request.auth,
    ),
);
// Public diagnostic endpoint; never returns user data.
export const health = onRequest(
  { region: 'southamerica-east1', invoker: 'public', maxInstances: 2 },
  (_req, res) => {
    res.status(200).json(getHealth());
  },
);
