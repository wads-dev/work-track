import { cn } from '../../lib/utils';
/** Same local-date presentation in every calendar density. */
export function CalendarDayHeading({
  day,
  zone,
  month = false,
}: {
  day: string;
  zone: string;
  month?: boolean;
}) {
  return (
    <h3
      className={cn(
        'text-left text-sm font-medium mb-1 text-muted-foreground overflow-hidden sm:text-sm',
        month ? 'text-[11px] whitespace-nowrap' : 'text-sm whitespace-normal',
      )}
    >
      {new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: month ? undefined : 'short',
        timeZone: zone,
      }).format(new Date(day + 'T12:00:00Z'))}
    </h3>
  );
}
