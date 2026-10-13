import type { Firestore, Unsubscribe } from 'firebase/firestore';
import type { PersonalReportRepository } from '@work-track/core/reports/domain/personal-report';
import type { CalendarQueryRange } from './calendar-firestore-query';
import { subscribeAuthorizedReport } from './authorized-report-source';
export interface PersonalReportSnapshot {
  repository: PersonalReportRepository;
  fromCache: boolean;
  hasPendingWrites: boolean;
  coherent: boolean;
}
export function subscribePersonalReport(
  db: Firestore,
  uid: string,
  next: (s: PersonalReportSnapshot) => void,
  fail: (e: Error) => void,
  _requiredProjectIds: readonly string[] = [],
  _range?: CalendarQueryRange,
): Unsubscribe {
  // Compatibility parameters do not select data; each repository method receives its own selection.
  void _requiredProjectIds;
  void _range;
  return subscribeAuthorizedReport(
    db,
    uid,
    (s) => next({ ...s, repository: s.repository.own() }),
    fail,
  );
}
