import { ReportContextError } from '../domain/global-estimates.js';
export async function completeSelection<T>(
  read: (
    cursor?: string,
  ) => Promise<{ records: T[]; nextCursor: string | null }>,
) {
  const records: T[] = [];
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (;;) {
    const page = await read(cursor);
    records.push(...page.records);
    if (records.length > 2000)
      throw new ReportContextError(
        'Limite seguro da seleção completa excedido (2000 registros); contate suporte para otimização, sem apagar histórico.',
      );
    if (!page.nextCursor) break;
    if (seen.has(page.nextCursor))
      throw new ReportContextError(
        'Cursor repetido; seleção completa indisponível.',
      );
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  return { records, scannedCount: records.length, nextCursor: null };
}
