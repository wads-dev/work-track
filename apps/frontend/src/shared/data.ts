import { useEffect, useState } from 'react';
import { observeRecordAudit } from '../data/repositories/browser-detail-repository';
import { workspaceRetry } from '../data/sync/workspace-runtime';
import { Timestamp, type Firestore } from 'firebase/firestore';

export type Row = { id: string; data: Record<string, unknown> };
export function text(value: unknown, fallback = 'Não informado'): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}
export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function objects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(object) : [];
}
export function date(value: unknown, zone?: unknown): string {
  const parsed =
    value instanceof Timestamp
      ? value.toDate()
      : typeof value === 'string'
        ? new Date(value)
        : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return 'Não informado';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      ...(typeof zone === 'string' ? { timeZone: zone } : {}),
    }).format(parsed);
  } catch {
    return 'Data ou fuso inválido';
  }
}
export function useRows(db: Firestore, path: string, maxRows = 100) {
  const [state, setState] = useState<{
    rows: Row[];
    loading: boolean;
    error: string;
  }>({ rows: [], loading: true, error: '' });
  const uid = path.split('/')[1] ?? '';
  useEffect(() => {
    setState({ rows: [], loading: true, error: '' });
    const parts = path.split('/');
    if (
      parts.length !== 5 ||
      parts[0] !== 'users' ||
      parts[2] !== 'records' ||
      parts[4] !== 'audit'
    ) {
      setState({
        rows: [],
        loading: false,
        error: 'Caminho de auditoria inválido.',
      });
      return;
    }
    return observeRecordAudit(db, uid, parts[3], maxRows, setState);
  }, [db, uid, path, maxRows]);
  return { ...state, retry: () => workspaceRetry(db, uid) };
}
