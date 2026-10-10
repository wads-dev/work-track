import { createCallable } from '../../../infrastructure/firebase/callable-command-gateway';
import { useEffect, useState } from 'react';
import {
  projectRepository,
  StaleProjectResponse,
} from '../../../data/cache/project-repository';
import type { Functions } from 'firebase/functions';
import { type Row, text } from '../../../shared/data';
import {
  loadAllProjects,
  type ProjectPage,
  type ProjectScope,
} from '../project-list';
export function useProjects(
  functions: Functions,
  uid: string,
  scope: ProjectScope = 'all',
) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    uid: string;
    scope: ProjectScope;
    functions: Functions;
    rows: Row[];
    loading: boolean;
    error: string;
  }>({ uid, scope, functions, rows: [], loading: true, error: '' });
  useEffect(
    () => projectRepository.subscribe(() => setAttempt((value) => value + 1)),
    [],
  );
  useEffect(() => {
    let active = true;
    setState({ uid, scope, functions, rows: [], loading: true, error: '' });
    void projectRepository
      .load(functions, uid, scope, () =>
        loadAllProjects(
          async (cursor) =>
            (
              await createCallable<
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
                scope: 'all',
                limit: 100,
                includeArchived: true,
                ...(cursor ? { cursor } : {}),
              })
            ).data,
        ),
      )
      .then((projects) => {
        if (active)
          setState({
            uid,
            scope,
            functions,
            rows: projects
              .filter(
                (project) =>
                  scope === 'all' ||
                  (project.type === 'personal' ? 'personal' : 'work') === scope,
              )
              .map((project) => ({
                id: text(project.id, ''),
                data: project,
              })),
            loading: false,
            error: '',
          });
      })
      .catch((error: unknown) => {
        if (error instanceof StaleProjectResponse) return;
        if (active)
          setState({
            uid,
            scope,
            functions,
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
    ...(state.uid === uid &&
    state.scope === scope &&
    state.functions === functions
      ? state
      : { rows: [], loading: true, error: '' }),
    retry: () => projectRepository.invalidate(),
  };
}
