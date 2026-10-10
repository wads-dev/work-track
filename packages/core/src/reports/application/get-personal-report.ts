import type {
  PersonalReportInput,
  PersonalReportRepository,
} from '../domain/personal-report.js';
import { buildPersonalReport } from '../domain/build-personal-report.js';
import { buildTopicBreakdown } from '../domain/topic-breakdown.js';

/** Transport-independent use case: authorization/input validation belong to the caller. */
export async function executePersonalReport(
  repository: PersonalReportRepository,
  input: PersonalReportInput,
  uid: string,
  asOf = Date.now(),
) {
  const context = await repository.loadContext([uid]);
  const selected = context.filter(
    (r) => !input.projectId || r.projectId === input.projectId,
  );
  const page = {
    records: selected,
    scannedCount: context.length,
    nextCursor: null,
  };
  const report = buildPersonalReport(
    { ...input, cursor: undefined },
    page,
    asOf,
    context,
  );
  report.scope = 'all-selected';
  report.page.partial = false;
  report.page.limit = 2000;
  if (!input.includeArchived) {
    const archived = new Set(
      await repository.archivedProjectIds([
        ...new Set(page.records.map((r) => r.projectId)),
      ]),
    );
    const removed = report.intervals.filter((r) => archived.has(r.projectId));
    report.intervals = report.intervals.filter(
      (r) => !archived.has(r.projectId),
    );
    report.byProject = report.byProject.filter(
      (r) => !archived.has(r.projectId),
    );
    report.totalMinutes = report.intervals.reduce(
      (sum, r) => sum + r.minutes,
      0,
    );
    report.estimatedCount = report.intervals.filter((r) => r.estimated).length;
    report.page.excludedCount += removed.length;
    report.warnings.push(
      'Seleção ativa exclui projetos arquivados ou ausentes da visualização; orçamento global continua incluindo todos os fatos.',
    );
  }
  const topics = await repository.readTopics(
    [...new Set(report.intervals.map((r) => r.projectId))],
    uid,
  );
  const breakdown = buildTopicBreakdown(
    page.records,
    report.intervals.map((r) => ({ ...r, uid: uid })),
    new Map(Object.entries(topics).map(([id, topics]) => [id, { topics }])),
  );
  report.byTopic = breakdown.byTopic;
  report.unassignedMinutes = breakdown.unassignedMinutes;
  report.warnings = [...new Set([...report.warnings, ...breakdown.warnings])];
  return report;
}
