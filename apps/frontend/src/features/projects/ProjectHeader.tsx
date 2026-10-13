import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ArrowLeft, LockKeyhole, Users } from 'lucide-react';
import { projectColors } from '../../shared/ui/project-colors';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { safeReturnTo } from '../../app/routes';
import { text, type Row } from '../../shared/data';
import { isHidden, safeProject } from '../../shared/ui/privacy';

export function ProjectHeader({
  projectId,
  project,
  catalog,
  revealed,
  loading,
  search,
  children,
  actions,
  summary,
}: {
  projectId: string;
  project?: Record<string, unknown>;
  catalog: Row[];
  revealed: boolean;
  loading: boolean;
  search: string;
  children: ReactNode;
  actions?: ReactNode;
  summary?: ReactNode;
}) {
  const params = new URLSearchParams(search);
  const hidden = isHidden(project, revealed);
  const data = safeProject(project, revealed);
  const color = projectColors(catalog, revealed)(projectId);
  const personal = data.type === 'personal';
  const ScopeIcon = personal ? LockKeyhole : Users;
  return (
    <header aria-label="Cabeçalho do projeto" className="space-y-3">
      <div
        aria-label="Seções do projeto e ações"
        className="flex min-w-0 flex-wrap items-center justify-between gap-3"
      >
        <div className="min-w-0 shrink-0">{children}</div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
          >
            <RouterLink
              to={
                params.has('returnTo')
                  ? safeReturnTo(params.get('returnTo'))
                  : '/projects' +
                    (data.type === 'personal' ? '?scope=personal' : '')
              }
            >
              <ArrowLeft aria-hidden="true" />
              Voltar
            </RouterLink>
          </Button>
          {actions}
        </div>
      </div>
      <div
        className="min-w-0 overflow-hidden rounded-xl border border-l-4 bg-card"
        style={{ borderLeftColor: color }}
      >
        <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            {loading && !project ? (
              <div
                role="status"
                aria-label="Carregando projeto"
                className="space-y-2"
              >
                <Skeleton className="h-7 w-56 max-w-full" />
                <Skeleton className="h-4 w-96 max-w-full" />
              </div>
            ) : (
              <>
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                  <h2 className="min-w-0 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
                    {project
                      ? text(data.title, 'Projeto')
                      : 'Projeto indisponível'}
                  </h2>
                  {project && !hidden && (
                    <Badge variant="secondary" className="shrink-0 gap-1.5">
                      <ScopeIcon className="size-3.5" aria-hidden="true" />
                      {personal ? 'Pessoal' : 'Compartilhado'}
                    </Badge>
                  )}
                  {project && !hidden && data.archived === true && (
                    <Badge variant="outline">Arquivado</Badge>
                  )}
                </div>
                <p className="max-w-5xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                  {project
                    ? text(data.description, 'Sem descrição.')
                    : 'O relatório consulta o projeto diretamente, independente do limite da lista.'}
                </p>
              </>
            )}
          </div>
          {summary}
        </div>
      </div>
    </header>
  );
}
