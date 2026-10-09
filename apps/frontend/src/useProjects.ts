import { useEffect, useState } from 'react';
import { httpsCallable, type Functions } from 'firebase/functions';
import { type Row, text } from './data';
import {
  loadAllProjects,
  type ProjectPage,
  type ProjectScope,
} from './project-list';
export function useProjects(
  functions: Functions,
  uid: string,
  scope: ProjectScope = 'all',
) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    uid: string;
    scope: ProjectScope;
    rows: Row[];
    loading: boolean;
    error: string;
  }>({ uid, scope, rows: [], loading: true, error: '' });
  useEffect(() => {
    let active = true;
    setState({ uid, scope, rows: [], loading: true, error: '' });
    void loadAllProjects(
      async (cursor) =>
        (
          await httpsCallable<
            {
              scope: ProjectScope;
              limit: number;
              includeArchived: boolean;
              cursor?: string;
            },
            ProjectPage
          >(
            functions,
            'listProjects',
          )({
            scope,
            limit: 100,
            includeArchived: true,
            ...(cursor ? { cursor } : {}),
          })
        ).data,
    )
      .then((projects) => {
        if (active)
          setState({
            uid,
            scope,
            rows: projects.map((project) => ({
              id: text(project.id, ''),
              data: project,
            })),
            loading: false,
            error: '',
          });
      })
      .catch(() => {
        if (active)
          setState({
            uid,
            scope,
            rows: [],
            loading: false,
            error:
              'Não foi possível carregar os projetos autorizados. Nenhuma consulta alternativa foi feita.',
          });
      });
    return () => {
      active = false;
    };
  }, [functions, uid, scope, attempt]);
  return {
    ...(state.uid === uid && state.scope === scope
      ? state
      : { rows: [], loading: true, error: '' }),
    retry: () => setAttempt((value) => value + 1),
  };
}
