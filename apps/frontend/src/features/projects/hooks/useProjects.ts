import { useEffect, useMemo, useState } from 'react';
import type { Functions } from 'firebase/functions';
import { getFirestore } from 'firebase/firestore';
import {
  subscribeAuthorizedProjects,
  type ProjectSnapshot,
} from '../../../data/sources/authorized-project-source';
import { projectRepository } from '../../../data/cache/project-repository';
import type { ProjectScope } from '../project-list';
import {
  emptyListing,
  listingKey,
  type ProjectReadOptions,
} from '../../../data/repositories/browser-listing-repository';
import { projectAccessRevision } from '../../../data/cache/project-access-revision';
import { workspaceRetry } from '../../../data/sync/workspace-runtime';
const initial = {
  ...emptyListing,
  fromCache: true,
  hasPendingWrites: false,
  complete: false,
  loading: true,
  error: '',
};
export function useProjects(
  functions: Functions,
  uid: string,
  scope: ProjectScope | ProjectReadOptions = 'all',
) {
  const db = useMemo(() => getFirestore(functions.app), [functions]);
  const [attempt, setAttempt] = useState(0);
  const key = listingKey(typeof scope === 'string' ? { scope } : scope);
  const selection = useMemo(() => JSON.parse(key) as ProjectReadOptions, [key]);
  const [state, setState] = useState<
    ProjectSnapshot & {
      uid: string;
      db: typeof db;
      key: string;
      accessRevision?: number;
      loading: boolean;
      error: string;
    }
  >({ ...initial, uid, db, key });
  useEffect(() => {
    let active = true;
    setState((previous) =>
      previous.uid === uid &&
      previous.db === db &&
      previous.key === key &&
      previous.accessRevision === projectAccessRevision()
        ? { ...previous, loading: true, error: '' }
        : { ...initial, uid, db, key },
    );
    if (!uid)
      return () => {
        active = false;
      };
    const stop = subscribeAuthorizedProjects(
      db,
      uid,
      (snapshot) => {
        if (active)
          setState((previous) => ({
            ...(snapshot.refreshing &&
            previous.uid === uid &&
            previous.db === db &&
            previous.key === key &&
            previous.accessRevision === projectAccessRevision()
              ? previous
              : snapshot),
            uid,
            db,
            key,
            accessRevision: projectAccessRevision(),
            loading: !snapshot.complete,
            error: '',
          }));
      },
      () => {
        if (active)
          setState({
            ...initial,
            uid,
            db,
            key,
            loading: false,
            error:
              'Não foi possível carregar os projetos autorizados. Nenhuma consulta alternativa foi feita.',
          });
      },
      selection,
    );
    return () => {
      active = false;
      stop();
    };
    // The initial state is a constant shape; selection identity is its serialized key.
  }, [db, uid, attempt, key, selection]);
  const current =
    state.uid === uid && state.db === db && state.key === key ? state : initial;
  return {
    ...current,
    retry: () => {
      if (current.error) {
        workspaceRetry(db, uid);
        projectRepository.invalidate();
      }
      setAttempt((value) => value + 1);
    },
  };
}
