import type { Firestore, Unsubscribe } from 'firebase/firestore';
import { observeWorkspace } from '../sync/workspace-runtime';
import { traceFirestore } from '../sync/firestore-diagnostics';
import {
  calendarQueryBounds,
  type CalendarQueryRange,
} from './calendar-firestore-query';
import { decodePersonalReportRecord } from '@work-track/data/codecs/report-record';
import { decodeWebProjectSnapshot } from '../../infrastructure/firebase/web-read-adapter';
import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import { canAccessProject } from '@work-track/core/registration/domain/project-access';
import { ClientPersonalReportRepository } from '@work-track/data/repositories/snapshots/personal-report-repository';
export interface PersonalReportSnapshot {
  repository: ClientPersonalReportRepository;
  fromCache: boolean;
  hasPendingWrites: boolean;
  coherent: boolean;
}
// Compare report content, not runtime audits/completeness bookkeeping. Key order in
// replayed documents is irrelevant; nested values still participate in the signature.
function contentSignature(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}
export function subscribePersonalReport(
  db: Firestore,
  uid: string,
  next: (snapshot: PersonalReportSnapshot) => void,
  fail: (error: Error) => void,
  _requiredProjectIds: readonly string[] = [],
  calendarRange?: CalendarQueryRange,
): Unsubscribe {
  void _requiredProjectIds; // Global materialization owns completeness and authorization.
  let signature: string | undefined;
  let lastError: string | undefined;
  const reportFailure = (error: Error) => {
    // A successful identical replay must publish again after an error clears the UI.
    signature = undefined;
    if (lastError === error.message) return;
    lastError = error.message;
    fail(error);
  };
  return observeWorkspace(db, uid, (snapshot) => {
    if (snapshot.error) {
      reportFailure(new Error(snapshot.error));
      return;
    }
    // This API has no loading state. Keep the last complete repository until the
    // next atomic context; page project fences handle access while syncing.
    if (!snapshot.complete) return;
    try {
      const projects = new Map(
        snapshot.projects
          .filter((p) => canAccessProject(p.data, uid))
          .map((p) => [
            p.id,
            decodeWebProjectSnapshot(
              { data: () => p.data },
              p.id,
              'personal-web',
            )!,
          ]),
      );
      const records = snapshot.records
        .filter(
          (row) =>
            row.data.uid === uid &&
            projects.has(String(row.data.projectId)) &&
            !isDeletedRecord(row.data),
        )
        .map((row) =>
          decodePersonalReportRecord(
            row.data,
            row.path.split('/').at(-1)!,
            uid,
          ),
        );
      const bounds = calendarRange && calendarQueryBounds(calendarRange);
      const selected = calendarRange
        ? new Set(
            records
              .filter(
                (r) =>
                  (!calendarRange.projectId ||
                    r.projectId === calendarRange.projectId) &&
                  (!bounds ||
                    (r.startedAt < bounds.upper &&
                      (r.startedAt >= bounds.lower ||
                        (typeof r.endedAt === 'string' &&
                          r.endedAt >= bounds.lower)))),
              )
              .map((r) => r.id),
          )
        : undefined;
      const nextSignature = contentSignature({
        projects: [...projects].sort(([a], [b]) => a.localeCompare(b)),
        records: [...records].sort((a, b) =>
          (a.uid + '/' + a.id).localeCompare(b.uid + '/' + b.id),
        ),
        selected: selected && [...selected].sort(),
      });
      traceFirestore('local.report.read', {
        source: 'personal',
        collections: 'projects,records',
        count: records.length,
        projects: projects.size,
        selected: selected?.size ?? null,
        cacheHit: signature === nextSignature,
      });
      if (signature === nextSignature) return;
      const repository = new ClientPersonalReportRepository(
        uid,
        structuredClone(records),
        structuredClone(projects),
        selected,
      );
      signature = nextSignature;
      lastError = undefined;
      next({
        repository,
        coherent: true,
        fromCache: false,
        hasPendingWrites: false,
      });
    } catch (error) {
      reportFailure(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
