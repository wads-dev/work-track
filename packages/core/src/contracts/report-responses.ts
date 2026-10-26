/** Transport DTOs shared by browser consumers and server handlers. */
export type CalendarResponse = {
  hoursPolicy?: string;
  policy: string;
  mode: 'own' | 'global';
  viewerUid: string;
  scope: 'all-selected';
  asOf: string;
  from?: string;
  to?: string;
  allWeeks?: boolean;
  occupiedWeeks?: string[];
  weekOccurrences?: { week: string; occurrenceCount: number }[];
  timeZone: string;
  totalMinutes: number;
  estimatedCount: number;
  participantsUnavailable?: boolean;
  participants: { uid: string; label: string }[];
  byUser: { uid: string; label: string; minutes: number }[];
  intervals: {
    id: string;
    uid: string;
    projectId: string;
    startedAt: string;
    endedAt?: string;
    effectiveStartedAt: string;
    effectiveEndedAt: string;
    estimated: boolean;
    minutes: number;
    loggedMinutes?: number;
    allocatedMinutes?: number;
    timeMultiplier?: number;
    accountingSegments?: import('../reports/domain/accounted-time.js').AccountingSegment[];
    topics?: { topicId: string; label: string; assignedMinutes?: number }[];
    subjectAssignedMinutes?: number;
    readOnly: boolean;
  }[];
  warnings: string[];
  page: {
    limit: number;
    scannedCount: number;
    excludedCount: number;
    nextCursor: null;
    partial: false;
  };
};

export type TopicFacts = {
  occurrenceCount: number;
  firstRecordStartedAt: string | null;
  lastRecordStartedAt: string | null;
};
export type TopicDetailReport = TopicFacts & {
  hoursPolicy?: 'personal-v4' | 'company-v4';
  budgetTimeZone?: 'America/Sao_Paulo';
  policy: string;
  scope: string;
  projectId: string;
  topicId: string;
  requestedTopicId: string;
  topicLabel: string;
  mode: 'own' | 'global';
  viewerUid: string;
  asOf: string;
  totalMinutes: number;
  closedMinutes: number;
  estimatedMinutes: number;
  fullRecordMinutes: number;
  unassignedMinutes: number;
  participants: (TopicFacts & {
    uid: string;
    label: string;
    assignedMinutes: number;
    closedMinutes: number;
    estimatedMinutes: number;
    fullRecordMinutes: number;
  })[];
  warnings: string[];
  page: { limit: number; nextCursor: string | null; partial: boolean };
  intervals: {
    id: string;
    uid: string;
    projectId: string;
    startedAt: string;
    endedAt?: string;
    effectiveStartedAt: string;
    effectiveEndedAt: string;
    estimated: boolean;
    minutes: number;
    loggedMinutes?: number;
    allocatedMinutes?: number;
    timeMultiplier?: number;
    accountingSegments?: import('../reports/domain/accounted-time.js').AccountingSegment[];
    assignedMinutes?: number;
    readOnly: boolean;
  }[];
};
