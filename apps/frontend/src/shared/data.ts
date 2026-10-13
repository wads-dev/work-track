import { useEffect, useState } from 'react';
import { isDeletedRecord } from '../data/cache/record-deletion';
import {
  observeWorkspace,
  workspaceRetry,
} from '../data/sync/workspace-runtime';
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
    return observeWorkspace(db, uid, (snapshot) => {
      const prefix = path + '/';
      const parentPath = path.split('/').slice(0, 4).join('/');
      const parent = snapshot.records.find((row) => row.path === parentPath);
      const visible =
        parent &&
        !isDeletedRecord(parent.data) &&
        snapshot.projects.some(
          (project) => project.id === parent.data.projectId,
        );
      setState({
        rows:
          snapshot.complete && visible
            ? (snapshot.audits ?? [])
                .filter(
                  (row) =>
                    row.path.startsWith(prefix) &&
                    row.path.split('/').length === 6,
                )
                .sort((a, b) =>
                  a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
                )
                .slice(0, maxRows)
                .map((row) => ({
                  id: row.path.split('/').at(-1)!,
                  data: row.data,
                }))
            : [],
        loading: !snapshot.complete && !snapshot.error,
        error: snapshot.error,
      });
    });
  }, [db, uid, path, maxRows]);
  return { ...state, retry: () => workspaceRetry(db, uid) };
}
