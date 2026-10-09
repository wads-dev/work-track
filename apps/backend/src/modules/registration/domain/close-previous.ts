import { isDeletedRecord } from './record-lifecycle.js';
export interface PreviousRecord {
  id: string;
  uid: string;
  projectId: string;
  startedAt: string;
  endedAt?: unknown;
}
export function selectPrevious(
  records: PreviousRecord[],
  uid: string,
  projectId: string,
  start: string,
  explicit?: string,
) {
  const eligible = records
    .filter(
      (r) =>
        !isDeletedRecord(r) &&
        r.uid === uid &&
        r.projectId === projectId &&
        r.endedAt === undefined &&
        Date.parse(r.startedAt) < Date.parse(start),
    )
    .sort(
      (a, b) =>
        Date.parse(a.startedAt) - Date.parse(b.startedAt) ||
        a.id.localeCompare(b.id),
    );
  if (explicit) {
    const selected = eligible.find((r) => r.id === explicit);
    if (!selected)
      throw new Error(
        'ID anterior deve ser próprio, aberto, mesmo projeto e iniciado antes.',
      );
    return selected;
  }
  if (eligible.length > 1)
    throw new Error(
      'Múltiplos anteriores abertos: pergunte qual ID encerrar; não escolha automaticamente.',
    );
  return eligible[0];
}
