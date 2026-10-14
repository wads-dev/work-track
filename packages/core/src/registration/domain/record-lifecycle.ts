/** Only an explicit null marker is active; missing or non-null markers fail closed. */
export function isDeletedRecord(record: unknown): boolean {
  return !(
    record &&
    typeof record === 'object' &&
    'deletedAt' in record &&
    record.deletedAt === null
  );
}
export function activeRecords<T>(records: T[]): T[] {
  return records.filter((record) => !isDeletedRecord(record));
}
