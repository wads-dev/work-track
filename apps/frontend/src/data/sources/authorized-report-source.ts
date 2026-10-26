import {
  collection,
  documentId,
  getDocsFromCache,
  query,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { decodeWebProjectSnapshot } from '../../infrastructure/firebase/web-read-adapter';
import { canAccessProject } from '@work-track/core/registration/domain/project-access';
import type { ReportProjectMetadata } from '@work-track/data/codecs/report-project-metadata';
import type { CalendarQueryRange } from './calendar-firestore-query';
import { FirestoreReportRepository } from '../repositories/firestore-report-repository';
import { observeWorkspace } from '../sync/workspace-runtime';
import { traceFirestore } from '../sync/firestore-diagnostics';
export interface AuthorizedReportSnapshot {
  repository: FirestoreReportRepository;
  coherent: boolean;
  fromCache: boolean;
  hasPendingWrites: boolean;
}
/** Session owns synchronization. This observer only constructs a query repository after readiness. */
export function subscribeAuthorizedReport(
  db: Firestore,
  uid: string,
  next: (s: AuthorizedReportSnapshot) => void,
  fail: (e: Error) => void,
  _requiredProjectIds: readonly string[] = [],
  _range?: CalendarQueryRange,
): Unsubscribe {
  // Compatibility parameters do not select data; each repository method receives its own selection.
  void _requiredProjectIds;
  void _range;
  let active = true,
    serial = 0,
    lastVersion: string | undefined;
  const stop = observeWorkspace(db, uid, (snapshot) => {
    const version =
      snapshot.dataRevision === undefined
        ? undefined
        : JSON.stringify([
            snapshot.dataRevision,
            snapshot.completedProjects,
            snapshot.complete,
            snapshot.error,
          ]);
    if (version !== undefined && version === lastVersion) return;
    lastVersion = version;
    const ticket = ++serial;
    if (snapshot.error) {
      fail(new Error(snapshot.error));
      return;
    }
    if (!snapshot.complete) return;
    void (async () => {
      try {
        const projects = new Map<string, ReportProjectMetadata>();
        const ids = snapshot.completedProjects;
        for (let i = 0; i < ids.length; i += 30) {
          traceFirestore('cache.read', {
            collection: 'projects',
            operation: 'report.catalog',
            source: 'persistent-local',
          });
          const result = await getDocsFromCache(
            query(
              collection(db, 'projects'),
              where(documentId(), 'in', ids.slice(i, i + 30)),
            ),
          );
          traceFirestore('cache.result', {
            collection: 'projects',
            operation: 'report.catalog',
            source: 'persistent-local',
            count: result.size,
          });
          for (const doc of result.docs) {
            const p = decodeWebProjectSnapshot(doc, doc.id, 'authorized-web');
            if (p && canAccessProject(p, uid)) projects.set(doc.id, p);
          }
        }
        if (!active || ticket !== serial) return;
        traceFirestore('local.report.read', {
          source: 'authorized-query-repository',
          projects: projects.size,
          cacheHit: false,
        });
        next({
          repository: new FirestoreReportRepository(db, uid, projects),
          coherent: true,
          fromCache: false,
          hasPendingWrites: false,
        });
      } catch (error) {
        if (!active || ticket !== serial) return;
        lastVersion = undefined; // A transient cache failure must not memoize failure.
        const e = error instanceof Error ? error : new Error(String(error));
        fail(e);
      }
    })();
  });
  return () => {
    active = false;
    serial++;
    stop();
  };
}
