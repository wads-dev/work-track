import { isDeletedRecord } from './record-deletion';
export function isOpen(record: Record<string, unknown>) {
  return !isDeletedRecord(record) && !record.endedAt;
}
export function isAlertOpen(record: Record<string, unknown>, now = new Date()) {
  if (!isOpen(record) || typeof record.startedAt !== 'string') return false;
  const start = Date.parse(record.startedAt);
  return Number.isFinite(start) && now.getTime() - start > 8 * 3600000;
}
