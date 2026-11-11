import {
  dailyProgressPercent,
  type DailyProgress,
} from './daily-business-progress';
export function CalendarDayProgress({
  day,
  progress,
  label,
  color,
}: {
  day: string;
  progress: DailyProgress[];
  label: (id: string) => string;
  color: (id: string) => string;
}) {
  return (
    <div className="mb-2 space-y-1" aria-label={'Horas úteis de ' + day}>
      {progress.map((progress) => {
        if (progress.calculationPending)
          return (
            <div
              key={progress.projectId}
              className="space-y-0.5"
              role="status"
              aria-label={label(progress.projectId) + ': calculando horas'}
            >
              <div className="truncate text-[10px]">
                {label(progress.projectId)}: …
              </div>
              <div className="h-2 overflow-hidden rounded bg-muted">
                <div
                  className="h-full w-1/3 animate-pulse rounded motion-reduce:animate-none"
                  style={{ backgroundColor: color(progress.projectId) }}
                />
              </div>
            </div>
          );
        const overtime = Math.max(0, progress.delivered - progress.expected);
        const caption =
          label(progress.projectId) +
          ': ' +
          (progress.expected === 0
            ? progress.delivered.toFixed(1) + 'h extras'
            : progress.delivered.toFixed(1) + 'h / ' + progress.expected + 'h');
        return (
          <div
            key={progress.projectId}
            title={caption}
            aria-label={caption}
            tabIndex={0}
            className="space-y-0.5"
          >
            <div className="truncate text-[10px]">{caption}</div>
            <div className="h-2 overflow-hidden rounded bg-muted dark:bg-white/20 dark:ring-1 dark:ring-inset dark:ring-white/30">
              <div
                className="h-full rounded"
                style={{
                  backgroundColor: color(progress.projectId),
                  width: dailyProgressPercent(progress) + '%',
                  backgroundImage:
                    progress.expected === 0
                      ? 'repeating-linear-gradient(135deg,transparent,transparent 3px,#ffffff55 3px,#ffffff55 6px)'
                      : undefined,
                }}
              />
            </div>
            {progress.expected > 0 && overtime > 0 && (
              <div
                aria-label={
                  label(progress.projectId) +
                  ': ' +
                  overtime.toFixed(1) +
                  'h extras'
                }
                className="space-y-0.5"
              >
                <div className="truncate text-[10px]">
                  {overtime.toFixed(1)}h extras
                </div>
                <div className="h-2 overflow-hidden rounded bg-muted dark:bg-white/20 dark:ring-1 dark:ring-inset dark:ring-white/30">
                  <div
                    className="h-full rounded"
                    style={{
                      backgroundColor: color(progress.projectId),
                      width:
                        dailyProgressPercent({
                          ...progress,
                          expected: 0,
                          dailyHours: progress.dailyHours ?? progress.expected,
                          delivered: overtime,
                        }) + '%',
                      backgroundImage:
                        'repeating-linear-gradient(135deg,transparent,transparent 3px,#ffffff55 3px,#ffffff55 6px)',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
