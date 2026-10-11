import { useEffect, useMemo, useState } from 'react';
import type { Functions } from 'firebase/functions';
import { getFirestore } from 'firebase/firestore';
import {
  subscribeAuthorizedProjects,
  type ProjectSnapshot,
} from '../../../data/sources/authorized-project-source';
import { projectRepository } from '../../../data/cache/project-repository';
import type { ProjectScope } from '../project-list';

/** Query results are projected from the SDK cache/live listeners, never cached Callable payloads. */
export function useProjects(
  functions: Functions,
  uid: string,
  scope: ProjectScope = 'all',
) {
  const db = useMemo(() => getFirestore(functions.app), [functions]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    ProjectSnapshot & {
      uid: string;
      db: typeof db;
      loading: boolean;
      error: string;
    }
  >({
    uid,
    db,
    rows: [],
    fromCache: true,
    hasPendingWrites: false,
    complete: false,
    loading: true,
    error: '',
  });
  useEffect(() => {
    let active = true;
    let ready = false;
    setState({
      uid,
      db,
      rows: [],
      fromCache: true,
      hasPendingWrites: false,
      complete: false,
      loading: true,
      error: '',
    });
    if (!uid)
      return () => {
        active = false;
      };
    const stop = subscribeAuthorizedProjects(
      db,
      uid,
      (snapshot) => {
        if (active) {
          ready ||= snapshot.complete;
          setState({ ...snapshot, uid, db, loading: !ready, error: '' });
        }
      },
      () => {
        if (active)
          setState({
            uid,
            db,
            rows: [],
            fromCache: true,
            hasPendingWrites: false,
            complete: false,
            loading: false,
            error:
              'Não foi possível carregar os projetos autorizados. Nenhuma consulta alternativa foi feita.',
          });
      },
    );
    return () => {
      active = false;
      stop();
    };
  }, [db, uid, attempt]);
  const current =
    state.uid === uid && state.db === db
      ? state
      : {
          rows: [],
          loading: true,
          error: '',
          fromCache: true,
          hasPendingWrites: false,
          complete: false,
        };
  return {
    ...current,
    rows: current.rows.filter(
      (row) =>
        scope === 'all' ||
        (row.data.type === 'personal' ? 'personal' : 'work') === scope,
    ),
    retry: () => {
      projectRepository.invalidate();
      setAttempt((value) => value + 1);
    },
  };
}
