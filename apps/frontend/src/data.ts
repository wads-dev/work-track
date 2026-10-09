import { useEffect, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  query,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';

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
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setState({ rows: [], loading: true, error: '' });
    return onSnapshot(
      query(collection(db, path), limit(maxRows)),
      (snapshot) => {
        setState({
          rows: snapshot.docs.map((doc) => ({
            id: doc.id,
            data: doc.data() as Record<string, unknown>,
          })),
          loading: false,
          error: '',
        });
      },
      () => {
        setState({
          rows: [],
          loading: false,
          error:
            'Não foi possível ler os dados. Confira sua conexão e a permissão de acesso.',
        });
      },
    );
  }, [db, path, attempt, maxRows]);
  return { ...state, retry: () => setAttempt((value) => value + 1) };
}
