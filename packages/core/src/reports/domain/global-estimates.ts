import { activeRecords } from '../../registration/domain/record-lifecycle.js';
import type { ReportSourceRecord } from './project-report.js';
import { nextMidnight } from './report-time.js';
export class ReportContextError extends Error {}
export const recordKey = (r: ReportSourceRecord) => r.uid + '/' + r.id;
export function assertContext(
  selected: ReportSourceRecord[],
  context: ReportSourceRecord[],
) {
  selected = activeRecords(selected);
  context = activeRecords(context);
  const map = new Map(context.map((r) => [recordKey(r), r]));
  for (const r of selected) {
    const current = map.get(recordKey(r));
    if (
      !current ||
      current.startedAt !== r.startedAt ||
      current.endedAt !== r.endedAt ||
      current.projectId !== r.projectId ||
      current.timeZone !== r.timeZone
    )
      throw new ReportContextError(
        'Página mudou durante consulta; recarregue para obter contexto consistente.',
      );
  }
}
export function globalEstimates(
  records: ReportSourceRecord[],
  asOf: number,
  reportZone = 'America/Sao_Paulo',
) {
  records = activeRecords(records);
  const sorted = [...records].sort(
    (a, b) =>
      Date.parse(a.startedAt) - Date.parse(b.startedAt) ||
      a.id.localeCompare(b.id, 'en'),
  );
  const zones = new Map<string, string>(),
    warnings = new Set<string>(),
    ends = new Map<string, number>();
  for (const r of sorted) {
    if (!zones.has(r.uid)) zones.set(r.uid, reportZone ?? r.timeZone);
    if (
      !Number.isFinite(Date.parse(r.startedAt)) ||
      (r.endedAt !== undefined &&
        (!Number.isFinite(Date.parse(r.endedAt)) ||
          Date.parse(r.endedAt) < Date.parse(r.startedAt)))
    )
      throw new ReportContextError(
        'Contexto contém datas inválidas; concilie registros antes de estimar.',
      );
  }
  for (const r of sorted) {
    const start = Date.parse(r.startedAt),
      zone = zones.get(r.uid)!;
    let end = r.endedAt === undefined ? undefined : Date.parse(r.endedAt);
    try {
      const dayEnd = nextMidnight(start, zone);
      if (r.timeZone !== zone)
        warnings.add(
          'Fusos mistos: contexto global usa um fuso canônico por pessoa; estimativas limitadas também à meia-noite desse fuso.',
        );
      if (end === undefined) {
        const next = sorted.find(
          (other) =>
            other.uid === r.uid &&
            other.projectId === r.projectId &&
            Date.parse(other.startedAt) > start &&
            (other.endedAt === undefined ||
              Date.parse(other.endedAt) - Date.parse(other.startedAt) >=
                15 * 60000),
        );
        end = Math.max(
          start,
          Math.min(
            asOf,
            start + 6 * 3600000,
            nextMidnight(start, r.timeZone),
            dayEnd,
            next ? Date.parse(next.startedAt) : Infinity,
          ),
        );
      }
      ends.set(recordKey(r), end);
    } catch (error) {
      if (error instanceof ReportContextError) throw error;
      throw new ReportContextError(
        'Fuso inválido no contexto global; estimativas indisponíveis.',
      );
    }
  }
  return { ends, warnings: [...warnings], zones: Object.fromEntries(zones) };
}
