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
