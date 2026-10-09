const formats = new Map<string, Intl.DateTimeFormat>();
export function localDay(instant: number, zone: string): string {
  let format = formats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formats.set(zone, format);
  }
  return format.format(new Date(instant));
}
export function nextMidnight(instant: number, zone: string): number {
  const day = localDay(instant, zone);
  let low = instant,
    high = instant + 48 * 3600000;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (localDay(mid, zone) === day) low = mid;
    else high = mid;
  }
  return high;
}
