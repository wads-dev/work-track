import type { Firestore, Unsubscribe } from 'firebase/firestore';
import { observeWorkspace } from '../sync/workspace-runtime';
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
export function subscribePersonalReport(
  db: Firestore,
  uid: string,
  next: (snapshot: PersonalReportSnapshot) => void,
  fail: (error: Error) => void,
  _requiredProjectIds: readonly string[] = [],
  calendarRange?: CalendarQueryRange,
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
      next({
        repository: new ClientPersonalReportRepository(
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
