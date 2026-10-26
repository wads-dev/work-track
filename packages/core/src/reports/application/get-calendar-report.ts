import type { CalendarResponse } from '../../contracts/report-responses.js';
import { topicMetadataMap } from '../domain/calendar-topics.js';
import { resolveTopic } from '../domain/topic-breakdown.js';
import { occupiedWeeks } from '../domain/calendar-weeks.js';
import {
  zeroDurationOpenOccurrences,
  calendarOccurrenceCounts,
  calendarIntervalMembership,
  completeReportWarnings,
} from '../domain/calendar-occurrences.js';
import { buildCompanyReport } from '../domain/build-company-report.js';
import { buildPersonalReport } from '../domain/build-personal-report.js';
import { ReportContextError } from '../domain/global-estimates.js';
import type { PersonalReportRepository } from '../domain/personal-report.js';
import type { CompanyReportRepository } from '../domain/company-report.js';
import type { ReportSourceRecord } from '../domain/project-report.js';
import type { PersonalReportPage } from '../domain/personal-report.js';
import { selectedProjectIds } from '../domain/personal-report.js';
import type { CalendarInput } from './calendar-input.js';
export class CalendarReportError extends Error {
  constructor(
    public readonly code: 'failed-precondition' | 'permission-denied',
    message: string,
  ) {
    super(message);
  }
}
export interface CalendarRepository {
  own: PersonalReportRepository;
  company: CompanyReportRepository;
  revalidate(
    records: ReportSourceRecord[],
    viewerUid: string,
    mode: 'own' | 'global',
  ): Promise<ReportSourceRecord[]>;
}
/** Bound physical pagination as well as visible records: no unbounded private/deleted scan. */
async function selection(
  read: (cursor?: string) => Promise<PersonalReportPage>,
  complete?: () => Promise<PersonalReportPage>,
) {
  if (complete) {
    const result = await complete();
    if (
      result.nextCursor ||
      result.records.length > 2000 ||
      result.scannedCount > 2000
    )
      throw new ReportContextError(
        'Seleção completa excede2000 ou retornou página parcial.',
      );
    return result;
  }
  const records: ReportSourceRecord[] = [];
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let pages = 0; pages < 20; pages++) {
    const page = await read(cursor);
    records.push(...page.records);
    if (records.length > 2000)
      throw new ReportContextError('Seleção excede 2000 registros.');
    if (!page.nextCursor)
      return { records, scannedCount: records.length, nextCursor: null };
    if (seen.has(page.nextCursor))
      throw new ReportContextError(
        'Cursor repetido; histórico completo indisponível.',
      );
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new ReportContextError(
    'Varredura excede 2000 registros físicos; nenhuma seleção parcial retornada.',
  );
}
export async function executeCalendarReport(
  repository: CalendarRepository,
  input: CalendarInput,
  uid: string,
  asOf = Date.now(),
) {
  selectedProjectIds(input);
  if (input.mode === 'own' && input.userIds?.some((id) => id !== uid))
    throw new CalendarReportError(
      'permission-denied',
      'Modo próprio não permite consultar outras pessoas. Escolha Global explicitamente.',
    );
  const options = {
    projectId: input.projectId,
    projectIds: input.projectIds,
    includeArchived: input.includeArchived,
    userIds: input.userIds,
    from: input.from,
    to: input.to,
    topicId: input.topicId,
  };
  const directoryOptions = {
    projectId: input.projectId,
    projectIds: input.projectIds,
    includeArchived: input.includeArchived,
  };
  const raw = await selection(
    (cursor) =>
      input.mode === 'own'
        ? repository.own.readPage(uid, 100, cursor, options)
        : repository.company.readPage(100, cursor, input.projectId, options),
    input.mode === 'own'
      ? repository.own.readCompleteSelection &&
          (() => repository.own.readCompleteSelection!(uid, options))
      : repository.company.readCompleteSelection &&
          (() => repository.company.readCompleteSelection!(options)),
  );
  const valid = await repository.revalidate(raw.records, uid, input.mode);
  const visible = valid;
  let participantsUnavailable = false;
  let directoryRaw: PersonalReportPage;
  {
    try {
      directoryRaw = await selection(
        (cursor) =>
          repository.company.readPage(
            100,
            cursor,
            input.projectId,
            directoryOptions,
          ),
        repository.company.readCompleteSelection &&
          (() => repository.company.readCompleteSelection!(directoryOptions)),
      );
    } catch (error) {
      if (input.mode !== 'own' || !(error instanceof ReportContextError))
        throw error;
      participantsUnavailable = true;
      directoryRaw = { records: [], scannedCount: 0, nextCursor: null };
    }
  }
  const directoryValid = await repository.revalidate(
    directoryRaw.records,
    uid,
    'global',
  );
  const directory = directoryValid;
  const participantUids = [
    ...new Set([
      ...(input.mode === 'own' ? [uid] : []),
      ...directory.map((r) => r.uid),
    ]),
  ];
  const labels = await repository.company.userLabels(participantUids);
  const selected = visible,
    uids = [...new Set(selected.map((r) => r.uid))];
  const context =
    input.mode === 'own'
      ? await repository.own.loadContext([uid])
      : await repository.company.loadContext(uids);
  const page = {
    records: selected,
    scannedCount: raw.scannedCount,
    nextCursor: null,
  };
  const report =
    input.mode === 'own'
      ? buildPersonalReport(input, page, asOf, context)
      : buildCompanyReport(input, page, context, asOf, labels, []);
  const topicProjects = [...new Set(selected.map((r) => r.projectId))];
  const readTopics = () =>
    input.mode === 'own'
      ? repository.own.readTopics(topicProjects, uid)
      : repository.company.readTopics(topicProjects);
  const topics = await readTopics();
  let selectedTopic: string | undefined;
  if (input.topicId) {
    const resolved = resolveTopic(
      topicMetadataMap(
        topics[(input.projectId ?? input.projectIds?.[0])!] ?? [],
      ),
      input.topicId,
    );
    if ('error' in resolved)
      throw new CalendarReportError(
        'failed-precondition',
        'Tópico não possui identidade canônica segura.',
      );
    selectedTopic = resolved.topicId;
  }
  // Re-read current catalog after context loading: changes of privacy/moves cannot leak via stale page snapshots.
  const stillVisible = await repository.revalidate(valid, uid, input.mode);
  if (stillVisible.length !== valid.length)
    throw new CalendarReportError(
      'failed-precondition',
      'Privacidade do projeto alterada durante leitura; atualize a seleção.',
    );
  const directoryNow = await repository.revalidate(
    directoryValid,
    uid,
    'global',
  );
  if (directoryNow.length !== directoryValid.length)
    throw new CalendarReportError(
      'failed-precondition',
      'Privacidade do diretório alterada durante leitura; atualize a seleção.',
    );
  if (!input.includeArchived) {
    const finalArchived = await repository.company.archivedProjectIds([
      ...new Set([...valid, ...directoryValid].map((r) => r.projectId)),
    ]);
    const selectedProjects = new Set(
      [...visible, ...directory].map((r) => r.projectId),
    );
    if (finalArchived.some((id) => selectedProjects.has(id)))
      throw new CalendarReportError(
        'failed-precondition',
        'Arquivamento alterado durante leitura; atualize a seleção.',
      );
  }
  const finalTopics = await readTopics();
  if (JSON.stringify(topics) !== JSON.stringify(finalTopics))
    throw new CalendarReportError(
      'failed-precondition',
      'Tópicos alterados durante leitura; atualize a seleção.',
    );
  const topicWarnings = new Set<string>();
  // Calendar-only points preserve open occurrences without adding hours to reports.
  const calendarIntervals = [
    ...report.intervals,
    ...zeroDurationOpenOccurrences(
      selected,
      context,
      asOf,
      input,
      report.intervals,
    ),
  ];
  const { intervals, warnings: membershipWarnings } =
    calendarIntervalMembership(
      calendarIntervals,
      selected,
      uid,
      topics,
      selectedTopic,
    );
  for (const warning of membershipWarnings) topicWarnings.add(warning);
  const occurrenceCounts = calendarOccurrenceCounts(selected, input);
  const weeks = [
    ...new Set([
      ...occupiedWeeks(intervals, input.timeZone),
      ...occurrenceCounts.keys(),
    ]),
  ].sort();
  const weekOccurrences = weeks.map((week) => ({
    week,
    occurrenceCount: occurrenceCounts.get(week) ?? 0,
  }));
  const totals = new Map<string, number>();
  for (const r of intervals)
    totals.set(r.uid, (totals.get(r.uid) ?? 0) + r.minutes);
  return {
    scope: 'all-selected' as const,
    policy: 'calendar-v3' as const,
    hoursPolicy: input.mode === 'own' ? 'personal-v4' : 'company-v4',
    mode: input.mode,
    viewerUid: uid,
    asOf: report.asOf,
    timeZone: input.timeZone,
    ...(input.from ? { from: input.from } : {}),
    ...(input.to ? { to: input.to } : {}),
    allWeeks: input.allWeeks,
    occupiedWeeks: weeks,
    weekOccurrences,
    totalMinutes: intervals.reduce((sum, r) => sum + r.minutes, 0),
    estimatedCount: intervals.reduce(
      (count, r) => count + Number(r.estimated),
      0,
    ),
    byUser: [...totals].map(([uid, minutes]) => ({
      uid,
      label: labels[uid] || 'Participante sem nome',
      minutes,
    })),
    participantsUnavailable,
    participants: participantUids.map((uid) => ({
      uid,
      label: labels[uid] || 'Participante sem nome',
    })),
    intervals,
    warnings: [
      ...topicWarnings,
      ...(input.topicId
        ? [
            'Filtro de tópico seleciona ocorrências e preserva todo o intervalo do registro; minutos atribuídos ao tópico são informados separadamente, sem encurtar a linha do tempo.',
          ]
        : []),
      ...(participantsUnavailable
        ? [
            'Diretório Global indisponível por limite operacional; somente o próprio participante é apresentado. Horas próprias permanecem completas; selecione um projeto para reduzir a consulta do diretório.',
          ]
        : []),
      ...completeReportWarnings(report.warnings),
      'Seleção completa dentro dos limites operacionais; Global significa compartilhado com pessoas autenticadas da organização, não publicação na Internet.',
      'Projetos pessoais de outras pessoas nunca integram o calendário Global.',
    ],
    page: {
      ...report.page,
      limit: 2000,
      nextCursor: null,
      partial: false as const,
    },
  } satisfies CalendarResponse;
}
