import { initializeApp } from 'firebase-admin/app';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import {
  appendSyncEvent,
  FirestoreSyncStore,
} from './modules/sync/infrastructure/firestore-sync.js';
import { syncWorkspaceHandler } from './modules/sync/application/sync-workspace.js';
import { FirebaseCompanyPeopleRepository } from './modules/people/infrastructure/firebase-company-people.js';
import { listCompanyPeopleHandler } from './modules/people/presentation/list-company-people.js';
import { FirestoreMergeRepository } from './modules/merge/infrastructure/firestore-merge.js';
import { FirestoreTopicReportRepository } from './modules/reports/infrastructure/firestore-topic-report.js';
import { getTopicReportHandler } from './modules/reports/presentation/get-topic-report.js';
import { FirestoreRecordMovementRepository } from './modules/registration/infrastructure/firestore-record-movement.js';
import { movementHandler } from './modules/registration/presentation/record-movement.js';
import { FirestoreRemovalRepository } from './modules/removal/infrastructure/firestore-removal.js';
import { FirestoreSplitRepository } from './modules/split/infrastructure/firestore-split.js';
import { FirestoreDailyHoursRepository } from './modules/daily-hours/infrastructure/firestore-daily-hours.js';
import { manageProjectHandler } from './modules/registration/presentation/manage-projects.js';
import { FirestoreTopicManagementRepository } from './modules/registration/infrastructure/firestore-topic-management.js';
import { manageTopicsHandler } from './modules/registration/presentation/manage-topics.js';
import { createProjectHandler } from './modules/registration/presentation/create-project.js';
import { FirestoreProjectManagementRepository } from './modules/registration/infrastructure/firestore-project-management.js';
import { FirestoreRecordEditingRepository } from './modules/registration/infrastructure/firestore-record-editing.js';
import { getAuth } from 'firebase-admin/auth';
import { FirestorePauseRepository } from './modules/pause/infrastructure/firestore-pause.js';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, onRequest } from 'firebase-functions/v2/https';
import { authorizeReport } from './modules/reports/presentation/get-project-report.js';
import { createApp } from './core/http/app.js';
import { WorkTrackOAuth } from './core/auth/application/oauth-provider.js';
import { FirebaseIdentityService } from './core/auth/infrastructure/firebase-identity.js';
import { FirestoreOAuthStore } from './core/auth/infrastructure/firestore-oauth-store.js';
import { FirestoreWorkRepository } from './modules/registration/infrastructure/firestore-work.js';

import { FirestoreProjectDeletionRepository } from './modules/registration/infrastructure/firestore-project-deletion.js';
import { projectDeletionHandler } from './modules/registration/presentation/project-deletion.js';

initializeApp();

// Web cache transport only; never exposed as MCP tools.
export const syncWorkspace = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  (request) =>
    syncWorkspaceHandler(
      new FirestoreSyncStore(getFirestore()),
      request.data,
      request.auth,
    ),
);
export const journalProjectForWebSync = onDocumentWritten(
  {
    document: 'projects/{projectId}',
    region: 'southamerica-east1',
    retry: true,
  },
  (event) =>
    appendSyncEvent(
      getFirestore(),
      event.id,
      'projects/' + event.params.projectId,
      undefined,
      event.data?.before.data()?.type !== event.data?.after.data()?.type ||
        event.data?.before.data()?.createdBy !==
          event.data?.after.data()?.createdBy,
    ),
);
export const journalRecordForWebSync = onDocumentWritten(
  {
    document: 'users/{uid}/records/{recordId}',
    region: 'southamerica-east1',
    retry: true,
  },
  (event) => {
    const previousProjectId: unknown = event.data?.before.data()?.projectId;
    return appendSyncEvent(
      getFirestore(),
      event.id,
      'users/' + event.params.uid + '/records/' + event.params.recordId,
      typeof previousProjectId === 'string' ? previousProjectId : undefined,
    );
  },
);

export const journalAuditForWebSync = onDocumentWritten(
  {
    document: 'users/{uid}/records/{recordId}/audit/{auditId}',
    region: 'southamerica-east1',
    retry: true,
  },
  (event) =>
    appendSyncEvent(
      getFirestore(),
      event.id,
      'users/' +
        event.params.uid +
        '/records/' +
        event.params.recordId +
        '/audit/' +
        event.params.auditId,
    ),
);

export const listCompanyPeople = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  (request) =>
    listCompanyPeopleHandler(
      new FirebaseCompanyPeopleRepository(getAuth()),
      request.data as unknown,
      request.auth,
    ),
);
// Frontend callables only: intentionally absent from the MCP tool registry.
export const exportProjectForDeletion = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  (request) =>
    projectDeletionHandler(
      new FirestoreProjectDeletionRepository(getFirestore()),
      'export',
      request.data,
      request.auth,
    ),
);
export const deleteProjectPermanently = onCall(
  {
    region: 'southamerica-east1',
    invoker: 'public',
    maxInstances: 3,
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  (request) =>
    projectDeletionHandler(
      new FirestoreProjectDeletionRepository(getFirestore()),
      'delete',
      request.data,
      request.auth,
    ),
);
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
export const moveTopic = onCall(
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
      'move_topic',
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
const provider = new WorkTrackOAuth(
  new FirestoreOAuthStore(getFirestore()),
  new FirebaseIdentityService(getAuth()),
  'https://wadsworktrack.web.app',
);
export const mcp = onRequest(
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
    new FirestoreMergeRepository(getFirestore()),
  ),
);
export const discoverLegacyProjectIds = onCall(
  { region: 'southamerica-east1', invoker: 'public', maxInstances: 3 },
  async (request) => {
    authorizeReport(request.auth);
    const projects = await new FirestoreWorkRepository(
      getFirestore(),
    ).listProjects(request.auth!.uid);
    return {
      ids: projects
        .filter((project) => project.type === undefined)
        .map((project) => project.id),
    };
  },
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
