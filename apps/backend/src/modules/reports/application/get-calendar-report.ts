import { calendarTopics, topicMetadataMap } from '../domain/calendar-topics.js';
import { resolveTopic } from '../domain/topic-breakdown.js';
import { occupiedWeeks, calendarWeekAt } from '../domain/calendar-weeks.js';
import { buildCompanyReport } from '../domain/build-company-report.js';
import { buildPersonalReport } from '../domain/build-personal-report.js';
import { ReportContextError } from '../domain/global-estimates.js';
import type { PersonalReportRepository } from '../domain/personal-report.js';
import type { CompanyReportRepository } from '../domain/company-report.js';
import type { ReportSourceRecord } from '../domain/project-report.js';
import type { PersonalReportPage } from '../domain/personal-report.js';
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
) {
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
  if (input.mode === 'own' && input.userIds?.some((id) => id !== uid))
    throw new CalendarReportError(
      'permission-denied',
      'Modo próprio não permite consultar outras pessoas. Escolha Global explicitamente.',
    );
  const raw = await selection((cursor) =>
    input.mode === 'own'
      ? repository.own.readPage(uid, 100, cursor)
      : repository.company.readPage(100, cursor, input.projectId),
  );
  const valid = await repository.revalidate(raw.records, uid, input.mode);
  const archived = input.includeArchived
    ? []
    : await repository.company.archivedProjectIds([
        ...new Set(valid.map((r) => r.projectId)),
      ]);
  const visible = valid.filter(
    (r) =>
      (!input.projectId || r.projectId === input.projectId) &&
      (input.includeArchived || !archived.includes(r.projectId)),
  );
  let participantsUnavailable = false;
  let directoryRaw = raw;
  if (input.mode === 'own') {
    try {
      directoryRaw = await selection((cursor) =>
        repository.company.readPage(100, cursor, input.projectId),
      );
    } catch (error) {
      if (!(error instanceof ReportContextError)) throw error;
      participantsUnavailable = true;
      directoryRaw = { records: [], scannedCount: 0, nextCursor: null };
    }
  }
  let directoryValid =
    input.mode === 'own'
      ? await repository.revalidate(directoryRaw.records, uid, 'global')
      : valid;
  const directoryArchived = input.includeArchived
    ? []
    : await repository.company.archivedProjectIds([
        ...new Set(directoryValid.map((r) => r.projectId)),
      ]);
  let directory = directoryValid.filter(
    (r) =>
      (!input.projectId || r.projectId === input.projectId) &&
      (input.includeArchived || !directoryArchived.includes(r.projectId)),
  );
  let participantUids = [
    ...new Set([
      ...(input.mode === 'own' ? [uid] : []),
      ...directory.map((r) => r.uid),
    ]),
  ];
  if (participantUids.length > 100) {
    if (input.mode === 'global')
      throw new ReportContextError(
        'Mais de100 participantes; selecione um projeto.',
      );
    participantsUnavailable = true;
    participantUids = [uid];
    directory = [];
    directoryValid = [];
  }
  const labels = await repository.company.userLabels(participantUids);
  const selected = visible.filter(
      (r) => !input.userIds || input.userIds.includes(r.uid),
    ),
    uids = [...new Set(selected.map((r) => r.uid))];
  if (uids.length > 10)
    throw new ReportContextError(
      'Mais de10 pessoas na seleção; escolha pessoas ou projeto.',
    );
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
      topicMetadataMap(topics[input.projectId!] ?? []),
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
  const intervals = report.intervals
    .map((r) => {
      const authorUid = 'uid' in r ? r.uid : uid;
      const source = selected.find(
        (s) =>
          s.id === r.id && s.uid === authorUid && s.projectId === r.projectId,
      );
      if (!source)
        throw new CalendarReportError(
          'failed-precondition',
          'Fonte do intervalo indisponível.',
        );
      const membership = calendarTopics(
        source,
        r.minutes,
        topics[r.projectId] ?? [],
      );
      for (const warning of membership.warnings) topicWarnings.add(warning);
      const matched = membership.topics.find(
        (t) => t.topicId === selectedTopic,
      );
      return {
        ...r,
        uid: authorUid,
        readOnly: authorUid !== uid,
        topics: membership.topics,
        ...(matched?.assignedMinutes !== undefined
          ? { subjectAssignedMinutes: matched.assignedMinutes }
          : {}),
      };
    })
    .filter(
      (r) =>
        !selectedTopic || r.topics.some((t) => t.topicId === selectedTopic),
    );
  const occurrenceCounts = new Map<string, number>();
  for (const record of selected) {
    const start = Date.parse(record.startedAt),
      end =
        record.endedAt === undefined ? undefined : Date.parse(record.endedAt);
    if (
      !Number.isFinite(start) ||
      (end !== undefined && (!Number.isFinite(end) || end < start)) ||
      (input.from && start < Date.parse(input.from)) ||
      (input.to && start >= Date.parse(input.to))
    )
      continue;
    const membership = calendarTopics(
      record,
      0,
      topics[record.projectId] ?? [],
    );
    if (
      selectedTopic &&
      !membership.topics.some((t) => t.topicId === selectedTopic)
    )
      continue;
    const week = calendarWeekAt(start, input.timeZone);
    occurrenceCounts.set(week, (occurrenceCounts.get(week) ?? 0) + 1);
  }
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
    hoursPolicy: input.mode === 'own' ? 'personal-v3' : 'company-v3',
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
    estimatedCount: intervals.filter((r) => r.estimated).length,
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
      ...report.warnings.filter((w) => !w.includes('página selecionada')),
      'Seleção completa dentro dos limites operacionais; Global significa compartilhado com pessoas autenticadas da organização, não publicação na Internet.',
      'Projetos pessoais de outras pessoas nunca integram o calendário Global.',
    ],
    page: {
      ...report.page,
      limit: 2000,
      nextCursor: null,
      partial: false as const,
    },
  };
}
