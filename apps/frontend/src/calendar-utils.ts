export type View = 'day' | 'week' | 'month';
export function validZone(value: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return value;
  } catch {
    throw new Error('Fuso IANA inválido.');
  }
}
export function dayKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return ['year', 'month', 'day']
    .map((type) => parts.find((p) => p.type === type)?.value)
    .join('-');
}
export function parseDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Data inválida.');
  const d = new Date(value + 'T12:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value)
    throw new Error('Data inválida.');
  return d;
}
export function addDays(day: string, amount: number) {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}
export function midnight(day: string, zone: string) {
  validZone(zone);
  parseDay(day);
  const base = Date.parse(day + 'T00:00:00Z');
  let guess = base;
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const n = (key: string) => Number(parts.find((p) => p.type === key)?.value);
    const represented = Date.UTC(
      n('year'),
      n('month') - 1,
      n('day'),
      n('hour'),
      n('minute'),
      n('second'),
    );
    const delta = base - represented;
    if (!delta) break;
    guess += delta;
  }
  return new Date(guess).toISOString();
}
export function range(day: string, view: View, zone: string) {
  const date = parseDay(day);
  let first = day,
    count = 1;
  if (view === 'week') {
    first = addDays(day, -((date.getUTCDay() + 6) % 7));
    count = 7;
  }
  if (view === 'month') {
    first = day.slice(0, 7) + '-01';
    count = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
  }
  return {
    first,
    count,
    from: midnight(first, zone),
    to: midnight(addDays(first, count), zone),
  };
}
export function calendarDays(day: string, view: View) {
  const r = range(day, view, 'UTC');
  const start =
    view === 'month'
      ? addDays(r.first, -((parseDay(r.first).getUTCDay() + 6) % 7))
      : r.first;
  return Array.from({ length: view === 'month' ? 42 : r.count }, (_, i) =>
    addDays(start, i),
  );
}
export function customRange(first: string, last: string, zone: string) {
  parseDay(first);
  parseDay(last);
  validZone(zone);
  if (last < first)
    throw new Error('Data final não pode ser anterior à inicial.');
  const count =
    (Date.parse(last + 'T12:00:00Z') - Date.parse(first + 'T12:00:00Z')) /
      86400000 +
    1;
  const from = midnight(first, zone),
    to = midnight(addDays(last, 1), zone);
  if (count > 31 || Date.parse(to) - Date.parse(from) > 31 * 86400000 + 3600000)
    throw new Error(
      'Intervalo máximo: 31 dias inclusivos (mais até 1 hora de ajuste de horário de verão). Escolha um intervalo menor; consultas não são somadas automaticamente.',
    );
  return { first, count, from, to };
}
export function moveReference(day: string, view: View, direction: number) {
  if (view !== 'month')
    return addDays(day, direction * (view === 'week' ? 7 : 1));
  const d = parseDay(day);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + direction, 1, 12),
  )
    .toISOString()
    .slice(0, 10);
}
export function overlaps(
  a: { effectiveStartedAt: string; effectiveEndedAt: string },
  b: { effectiveStartedAt: string; effectiveEndedAt: string },
) {
  return (
    Date.parse(a.effectiveStartedAt) < Date.parse(b.effectiveEndedAt) &&
    Date.parse(b.effectiveStartedAt) < Date.parse(a.effectiveEndedAt)
  );
}
