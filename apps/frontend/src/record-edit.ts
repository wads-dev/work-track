export function localEndToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value))
    throw new Error('Informe data e hora efetivas.');
  return value + (value.length === 16 ? ':00' : '') + '-03:00';
}
export function endToLocal(value: unknown) {
  if (typeof value !== 'string') return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (key: string) => p.find((item) => item.type === key)?.value;
  return (
    part('year') +
    '-' +
    part('month') +
    '-' +
    part('day') +
    'T' +
    part('hour') +
    ':' +
    part('minute')
  );
}
export function validateEnd(value: string, startedAt: unknown): string {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    throw new Error(
      'Informe ISO 8601 com fuso explícito, por exemplo 2026-10-09T17:30:00-03:00.',
    );
  const end = Date.parse(value);
  const start = typeof startedAt === 'string' ? Date.parse(startedAt) : NaN;
  if (!Number.isFinite(end) || !Number.isFinite(start))
    throw new Error('Início ou fim inválido.');
  if (end < start) throw new Error('Fim não pode ser anterior ao início.');
  return value;
}
