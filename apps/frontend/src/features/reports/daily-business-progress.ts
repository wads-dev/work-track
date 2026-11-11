import {
  businessHoursSchema,
  businessHoursContractForDate,
  businessHoursForDate,
  type Holiday,
} from '@work-track/core/registration/domain/business-hours';
import {
  accountedMinutes,
  type AccountingSegment,
} from '@work-track/core/reports/domain/accounted-time';
import { midnight, addDays } from './calendar-utils';
export const nonWorkingDayClassName =
  'bg-black/[0.04] dark:bg-black/20 dark:border-white/25';
export function isNonWorkingDay(date: string, holidays: Holiday[] = []) {
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
  return (
    weekday === 0 ||
    weekday === 6 ||
    holidays.some((holiday) => holiday.date === date)
  );
}
export function dailyProgressPercent(progress: DailyProgress) {
  const reference =
    progress.expected > 0 ? progress.expected : (progress.dailyHours ?? 0);
  return reference > 0
    ? Math.min(100, (progress.delivered / reference) * 100)
    : 0;
}
export type DailyProgress = {
  projectId: string;
  expected: number;
  dailyHours?: number;
  delivered: number;
};
/** Domain aggregation of complete authorized calendar intervals, not record retrieval. */
export function dailyBusinessProgress(
  date: string,
  projects: ReadonlyMap<string, Record<string, unknown>>,
  holidays: Holiday[],
  items: {
    projectId: string;
    effectiveStartedAt: string;
    effectiveEndedAt: string;
    accountingSegments?: AccountingSegment[];
    timeMultiplier?: number;
  }[],
  selectedIds: string[] = [],
): DailyProgress[] {
  const from = Date.parse(midnight(date, 'America/Sao_Paulo')),
    to = Date.parse(midnight(addDays(date, 1), 'America/Sao_Paulo'));
  const delivered = new Map<string, number>();
  for (const item of items) {
    const start = Math.max(from, Date.parse(item.effectiveStartedAt)),
      end = Math.min(to, Date.parse(item.effectiveEndedAt));
    if (end <= start) continue;
    if (!item.accountingSegments)
      throw new Error(
        'Contexto de rateio indisponível; progresso diário não calculado.',
      );
    delivered.set(
      item.projectId,
      (delivered.get(item.projectId) ?? 0) +
        (accountedMinutes(item.accountingSegments, start, end) *
          (item.timeMultiplier ?? 1)) /
          60,
    );
  }
  const result: DailyProgress[] = [];
  for (const [projectId, metadata] of projects) {
    if (selectedIds.length && !selectedIds.includes(projectId)) continue;
    const periods = businessHoursSchema.parse(metadata.businessHours ?? []);
    const active = businessHoursContractForDate(date, periods);
    if (!active) continue;
    result.push({
      projectId,
      dailyHours: active.hoursPerDay,
      expected: businessHoursForDate(date, periods, holidays),
      delivered: delivered.get(projectId) ?? 0,
    });
  }
  return result.sort((a, b) => a.projectId.localeCompare(b.projectId));
}
