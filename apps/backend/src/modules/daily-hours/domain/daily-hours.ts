import { activeRecords } from '../../registration/domain/record-lifecycle.js';
import { z } from 'zod';
import {
  globalEstimates,
  recordKey,
} from '../../reports/domain/global-estimates.js';
import type { ReportSourceRecord } from '../../reports/domain/project-report.js';

export class DailyHoursError extends Error {
  constructor(
    public readonly code:
      | 'invalid-argument'
      | 'not-found'
      | 'resource-exhausted'
      | 'unauthenticated',
    message: string,
  ) {
    super(message);
  }
}
export function validOwnUid(uid: string): boolean {
  return Boolean(
    uid &&
    uid.length <= 128 &&
    !uid.includes('/') &&
    uid !== '.' &&
    uid !== '..',
  );
}
export function validTimeZone(zone: string): boolean {
  if (/^[+-]/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
function realDate(value: string): boolean {
  const parsed = Date.parse(value + 'T12:00:00Z');
  return (
    value.slice(0, 4) !== '0000' &&
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}
export const dailyHoursInput = z
  .object({
    date: z
      .string()
      .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
      .refine(realDate, 'Data deve existir no calendário.'),
    timeZone: z
      .string()
      .min(1)
      .max(100)
      .refine(validTimeZone, 'Fuso IANA inválido.')
      .default('America/Sao_Paulo'),
    projectId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .optional(),
    includeArchived: z.boolean().default(true),
  })
  .strict();
export type DailyHoursInput = z.infer<typeof dailyHoursInput>;
export interface DailyProject {
  type?: unknown;
  createdBy?: unknown;
  archived?: unknown;
  mergedInto?: unknown;
}
export function canReadDailyProject(
  project: DailyProject | undefined,
  uid: string,
): boolean {
  return Boolean(
    project &&
    uid &&
    (project.type === undefined ||
      project.type === 'work' ||
      (project.type === 'personal' && project.createdBy === uid)),
  );
}
export interface DailyHoursContext {
  records: ReportSourceRecord[];
  projects: Map<string, DailyProject>;
}
export interface DailyHoursRepository {
  loadOwnHistory(uid: string, projectId?: string): Promise<DailyHoursContext>;
}
export function dailyBounds(date: string, timeZone: string) {
  const middle = Date.parse(date + 'T12:00:00Z');
  const target = Number(date.replaceAll('-', ''));
  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    era: 'short',
  });
  const dateKey = (instant: number) => {
    const parts = format.formatToParts(new Date(instant));
    const part = (name: string) => parts.find((p) => p.type === name)!.value;
    const year =
      part('era') === 'BC' ? 1 - Number(part('year')) : Number(part('year'));
    return year * 10000 + Number(part('month')) * 100 + Number(part('day'));
  };
  const boundary = (after: boolean) => {
    let low = middle - 72 * 3600000,
      high = middle + 72 * 3600000;
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      const day = dateKey(mid);
      if (after ? day <= target : day < target) low = mid;
      else high = mid;
    }
    return high;
  };
  const start = boundary(false),
    end = boundary(true);
  if (dateKey(start) !== target || end <= start)
    throw new DailyHoursError(
      'invalid-argument',
      'Este dia não existe no fuso solicitado.',
    );
  return { start, end };
}
function zeroTotals() {
  return {
    totalMinutes: 0,
    totalHours: 0,
    closedMinutes: 0,
    closedHours: 0,
    estimatedMinutes: 0,
    estimatedHours: 0,
  };
}
export function buildDailyHours(
  input: DailyHoursInput,
  context: DailyHoursContext,
  uid: string,
  asOf: number,
) {
  const { start, end } = dailyBounds(input.date, input.timeZone);
  // Defense in depth: exclude inaccessible stale project references BEFORE parsing dates or estimating.
  const records = activeRecords(context.records).filter(
    (r) =>
      r.uid === uid &&
      canReadDailyProject(context.projects.get(r.projectId), uid),
  );
  if (
    input.projectId &&
    !canReadDailyProject(context.projects.get(input.projectId), uid)
  )
    throw new DailyHoursError('not-found', 'Projeto não encontrado.');
  // Baseline personal-v3: resolve estimates from all authorized history before selection filters.
  const estimates = globalEstimates(records, asOf);
  const warnings = new Set([
    'Política personal-v3: contexto global America/Sao_Paulo antes dos filtros de projeto e arquivados, sem teto diário. Fatos fechados são preservados.',
    'Abertos são estimativas não persistidas: até 6h, agora, meia-noite do registro e do fuso canônico, próximo início próprio no mesmo projeto (fechados menores que 15min não cortam).',
    'Somente o recorte do dia solicitado é somado; sobreposições são somadas e não representam horas únicas. Nenhum fim original é inventado.',
    ...estimates.warnings,
  ]);
  if (!input.includeArchived)
    warnings.add(
      'Projetos arquivados/mesclados foram excluídos da seleção, mas continuam no contexto global de estimativas.',
    );
  const result = {
    scope: 'own' as const,
    date: input.date,
    timeZone: input.timeZone,
    budgetTimeZone: 'America/Sao_Paulo',
    policy: 'personal-v3',
    asOf: new Date(asOf).toISOString(),
    includeArchived: input.includeArchived,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    bounds: {
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(end).toISOString(),
      durationMinutes: (end - start) / 60000,
    },
    ...zeroTotals(),
    byProject: [] as ({ projectId: string } & ReturnType<typeof zeroTotals>)[],
    intervals: [] as {
      id: string;
      projectId: string;
      startedAt: string;
      endedAt?: string;
      effectiveStartedAt: string;
      effectiveEndedAt: string;
      estimated: boolean;
      minutes: number;
    }[],
    warnings: [] as string[],
  };
  const projects = new Map<
    string,
    { projectId: string } & ReturnType<typeof zeroTotals>
  >();
  const sorted = [...records].sort(
    (a, b) =>
      Date.parse(a.startedAt) - Date.parse(b.startedAt) ||
      a.id.localeCompare(b.id, 'en'),
  );
  for (const record of sorted) {
    if (input.projectId && record.projectId !== input.projectId) continue;
    const project = context.projects.get(record.projectId)!;
    if (!input.includeArchived && (project.archived || project.mergedInto))
      continue;
    const effectiveStart = Math.max(start, Date.parse(record.startedAt));
    const effectiveEnd = Math.min(
      end,
      estimates.ends.get(recordKey(record)) ?? effectiveStart,
    );
    if (effectiveEnd <= effectiveStart) continue;
    const estimated = record.endedAt === undefined,
      minutes = (effectiveEnd - effectiveStart) / 60000;
    if (
      result.intervals.some(
        (r) =>
          Date.parse(r.effectiveStartedAt) < effectiveEnd &&
          Date.parse(r.effectiveEndedAt) > effectiveStart,
      )
    )
      warnings.add('Há intervalos sobrepostos no dia.');
    result.intervals.push({
      id: record.id,
      projectId: record.projectId,
      startedAt: record.startedAt,
      ...(record.endedAt === undefined ? {} : { endedAt: record.endedAt }),
      effectiveStartedAt: new Date(effectiveStart).toISOString(),
      effectiveEndedAt: new Date(effectiveEnd).toISOString(),
      estimated,
      minutes,
    });
    const row = projects.get(record.projectId) ?? {
      projectId: record.projectId,
      ...zeroTotals(),
    };
    for (const target of [result, row]) {
      target.totalMinutes += minutes;
      if (estimated) target.estimatedMinutes += minutes;
      else target.closedMinutes += minutes;
      target.totalHours = target.totalMinutes / 60;
      target.closedHours = target.closedMinutes / 60;
      target.estimatedHours = target.estimatedMinutes / 60;
    }
    projects.set(record.projectId, row);
  }
  result.byProject = [...projects.values()].sort((a, b) =>
    a.projectId.localeCompare(b.projectId, 'en'),
  );
  result.warnings = [...warnings];
  return result;
}
export async function getDailyHours(
  repository: DailyHoursRepository,
  data: unknown,
  uid: string,
  asOf = Date.now(),
) {
  if (!validOwnUid(uid))
    throw new DailyHoursError('unauthenticated', 'Autenticação necessária.');
  const parsed = dailyHoursInput.safeParse(data);
  if (!parsed.success)
    throw new DailyHoursError(
      'invalid-argument',
      'Data YYYY-MM-DD real, fuso IANA ou filtros inválidos; uid não é aceito.',
    );
  dailyBounds(parsed.data.date, parsed.data.timeZone);
  const context = await repository.loadOwnHistory(uid, parsed.data.projectId);
  return buildDailyHours(parsed.data, context, uid, asOf);
}
