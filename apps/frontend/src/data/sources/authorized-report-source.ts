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
  return observeWorkspace(db, uid, (snapshot) => {
    if (snapshot.error) {
      fail(new Error(snapshot.error));
      return;
    }
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
      next({
        repository: new AuthorizedReportRepository(
          uid,
          records,
          projects,
          selected,
        ),
        coherent: true,
        fromCache: false,
        hasPendingWrites: false,
      });
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
