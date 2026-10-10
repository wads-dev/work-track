/** Legacy undefined/null markers remain active; any other marker fails closed. */
export function isDeletedRecord(record: unknown): boolean {
  return Boolean(
    record &&
    typeof record === 'object' &&
    'deletedAt' in record &&
    record.deletedAt !== null &&
    record.deletedAt !== undefined,
  );
}
export function activeRecords<T>(records: T[]): T[] {
  return records.filter((record) => !isDeletedRecord(record));
}
