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
import { stableDataKey } from '../repositories/stable-data-key';
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
    signature = '',
    lastError = '';
  const stop = observeWorkspace(db, uid, (snapshot) => {
    const ticket = ++serial;
    if (snapshot.error) {
      signature = '';
      if (lastError !== snapshot.error) {
        lastError = snapshot.error;
        fail(new Error(snapshot.error));
      }
      return;
    }
    if (!snapshot.complete) return;
    const nextSignature = stableDataKey({
      projects: [...snapshot.projects].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      ),
      records: [...snapshot.records].sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
      ),
    });
    if (signature === nextSignature) return;
    void (async () => {
      try {
        const projects = new Map<string, ReportProjectMetadata>();
        const ids = snapshot.projects.map((p) => p.id);
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
        signature = nextSignature;
        lastError = '';
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
        signature = '';
        const e = error instanceof Error ? error : new Error(String(error));
        if (lastError !== e.message) {
          lastError = e.message;
          fail(e);
        }
      }
    })();
  });
  return () => {
    active = false;
    serial++;
    stop();
  };
}
