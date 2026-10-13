import {
  collectionGroup,
  query,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { reportRecordSchema } from '@work-track/data/codecs/report-record';
import { decodeWebProjectSnapshot } from '../../infrastructure/firebase/web-read-adapter';
import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import {
  calendarQueryBounds,
  type CalendarQueryRange,
} from './calendar-firestore-query';
import { AuthorizedReportRepository } from '@work-track/data/repositories/snapshots/authorized-report-repository';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';
import { observeWorkspace } from '../sync/workspace-runtime';
import { traceFirestore } from '../sync/firestore-diagnostics';
export interface AuthorizedReportSnapshot {
  repository: AuthorizedReportRepository;
  coherent: boolean;
  fromCache: boolean;
  hasPendingWrites: boolean;
}
// Query builder retained for compatibility/tests; no UI observer executes these queries.
export function authorizedRecordQueries(
  db: Firestore,
  projectId: string,
  range?: CalendarQueryRange,
) {
  const base = collectionGroup(db, 'records');
  if (!range) return [query(base, where('projectId', '==', projectId))];
  const { lower, upper } = calendarQueryBounds(range);
  return [
    query(
      base,
      where('projectId', '==', projectId),
      where('startedAt', '>=', lower),
      where('startedAt', '<', upper),
    ),
    query(
      base,
      where('projectId', '==', projectId),
      where('endedAt', '>=', lower),
      where('startedAt', '<', upper),
    ),
  ];
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
const schema = reportRecordSchema('authorized-web');
export function subscribeAuthorizedReport(
  db: Firestore,
  uid: string,
  next: (s: AuthorizedReportSnapshot) => void,
  fail: (e: Error) => void,
  _requiredProjectIds: readonly string[] = [],
  range?: CalendarQueryRange,
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
        snapshot.projects.map((p) => [
          p.id,
          decodeWebProjectSnapshot(
            { data: () => p.data },
            p.id,
            'authorized-web',
          )!,
        ]),
      );
      const records: ReportSourceRecord[] = snapshot.records.flatMap((row) => {
        const parts = row.path.split('/');
        if (
          parts.length !== 4 ||
          parts[0] !== 'users' ||
          parts[2] !== 'records' ||
          row.data.uid !== parts[1]
        )
          throw new Error('Registro canônico inválido.');
        if (
          !projects.has(String(row.data.projectId)) ||
          isDeletedRecord(row.data)
        )
          return [];
        return [
          {
            ...row.data,
            ...schema.parse(row.data),
            id: parts[3],
          } as ReportSourceRecord,
        ];
      });
      const bounds = range && calendarQueryBounds(range);
      const selected = range
        ? new Set(
            records
              .filter(
                (r) =>
                  (!range.projectId || r.projectId === range.projectId) &&
                  (!bounds ||
                    (r.startedAt < bounds.upper &&
                      (r.startedAt >= bounds.lower ||
                        (typeof r.endedAt === 'string' &&
                          r.endedAt >= bounds.lower)))),
              )
              .map((r) => 'users/' + r.uid + '/records/' + r.id),
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
        source: 'authorized',
        collections: 'projects,records',
        count: records.length,
        projects: projects.size,
        selected: selected?.size ?? null,
        cacheHit: signature === nextSignature,
      });
      if (signature === nextSignature) return;
      const repository = new AuthorizedReportRepository(
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
