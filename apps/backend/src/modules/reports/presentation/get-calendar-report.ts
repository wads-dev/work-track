import { z } from 'zod';
import { HttpsError } from 'firebase-functions/v2/https';
import { authorizeReport, type ReportAuth } from './get-project-report.js';
import { buildCompanyReport } from '../domain/build-company-report.js';
import { buildPersonalReport } from '../domain/build-personal-report.js';
import { ReportContextError } from '../domain/global-estimates.js';
import type { PersonalReportRepository } from '../domain/personal-report.js';
import type { CompanyReportRepository } from '../domain/company-report.js';
import type { ReportSourceRecord } from '../domain/project-report.js';
import type { PersonalReportPage } from '../domain/personal-report.js';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const calendarInput = z
  .object({
    mode: z.enum(['own', 'global']).default('own'),
    userIds: z
      .array(id)
      .min(1)
      .max(10)
      .refine((v) => new Set(v).size === v.length)
      .optional(),
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    timeZone: z
      .string()
      .max(100)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }),
    projectId: id.optional(),
    includeArchived: z.boolean().default(false),
  })
  .strict()
  .refine(
    (v) =>
      Date.parse(v.to) > Date.parse(v.from) &&
      Date.parse(v.to) - Date.parse(v.from) <= (93 * 24 + 1) * 3600000,
    'Período até93dias+1h.',
  );
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
export async function getCalendarReportHandler(
  repository: CalendarRepository,
  data: unknown,
  auth?: ReportAuth,
  asOf = Date.now(),
) {
  authorizeReport(auth);
  const parsed = calendarInput.safeParse(data);
  if (!parsed.success)
    throw new HttpsError(
      'invalid-argument',
      'Seleção, pessoas, período ou fuso inválido.',
    );
  const input = parsed.data,
    uid = auth!.uid;
  if (input.mode === 'own' && input.userIds?.some((id) => id !== uid))
    throw new HttpsError(
      'permission-denied',
      'Modo próprio não permite consultar outras pessoas. Escolha Global explicitamente.',
    );
  try {
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
    // Re-read current catalog after context loading: changes of privacy/moves cannot leak via stale page snapshots.
    const stillVisible = await repository.revalidate(valid, uid, input.mode);
    if (stillVisible.length !== valid.length)
      throw new HttpsError(
        'failed-precondition',
        'Privacidade do projeto alterada durante leitura; atualize a seleção.',
      );
    const directoryNow = await repository.revalidate(
      directoryValid,
      uid,
      'global',
    );
    if (directoryNow.length !== directoryValid.length)
      throw new HttpsError(
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
        throw new HttpsError(
          'failed-precondition',
          'Arquivamento alterado durante leitura; atualize a seleção.',
        );
    }
    const intervals = report.intervals.map((r) => ({
      ...r,
      uid: 'uid' in r ? r.uid : uid,
      readOnly: ('uid' in r ? r.uid : uid) !== uid,
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
      from: input.from,
      to: input.to,
      totalMinutes: report.totalMinutes,
      estimatedCount: report.estimatedCount,
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
        ...(participantsUnavailable
          ? [
              'Diretório Global indisponível por limite operacional; somente o próprio participante é apresentado. Horas próprias permanecem completas; selecione um projeto para reduzir a consulta do diretório.',
            ]
          : []),
        ...report.warnings.filter((w) => !w.includes('página selecionada')),
        'Seleção completa dentro dos limites operacionais; Global significa compartilhado com pessoas autenticadas da organização, não publicação na Internet.',
        'Projetos pessoais de outras pessoas nunca integram o calendário Global.',
      ],
      page: { ...report.page, limit: 2000, nextCursor: null, partial: false },
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof ReportContextError)
      throw new HttpsError('resource-exhausted', error.message);
    throw new HttpsError(
      'failed-precondition',
      'Não foi possível obter calendário completo e autorizado.',
    );
  }
}
