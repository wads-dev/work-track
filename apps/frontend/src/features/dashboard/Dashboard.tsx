import { CompactListToolbar } from '../../shared/ui/CompactListToolbar';
import { useOwnRecords } from '../records/hooks/useOwnRecords';
import { useProjects } from '../projects/hooks/useProjects';
import { MetadataLink } from '../../shared/ui/MetadataLink';
import { ProjectCreate } from '../projects/ProjectCreate';
import { ProjectList } from '../projects/ProjectList';
import { clearProjectFilters } from '../projects/project-list';
import { writeUrlTab } from '../../app/url-tabs';
import { useEffect, useState } from 'react';
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/alert';
import { AlertTriangle, Info } from 'lucide-react';
import { RecordsList } from '../records/RecordsList';
import { RecordsToolbar } from '../records/RecordsToolbar';
import { Button } from '../../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { ProjectReport } from '../reports/ProjectReport';
import { RecordDrawer } from '../records/RecordDrawer';
import { date, text } from '../../shared/data';
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { detailPath } from '../../app/routes';
import { UiIcon } from '../../shared/ui/UiIcons';
import {
  usePrivacy,
  isHidden,
  safeProject,
  safeRecord,
} from '../../shared/ui/privacy';
import { ProjectEditor } from '../projects/ProjectEditor';
import { ProjectAccess } from '../projects/ProjectAccess';
import { ProjectHeader } from '../projects/ProjectHeader';
import { ProjectArchive } from '../projects/ProjectArchive';

export function Dashboard({
  db,
  functions,
  uid,
  mode,
}: {
  db: Firestore;
  functions: Functions;
  uid: string;
  mode: 'overview' | 'projects' | 'records';
}) {
  const { revealed } = usePrivacy();
  const [reportRefresh, setReportRefresh] = useState(0);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportSummaryTarget, setReportSummaryTarget] =
    useState<HTMLDivElement | null>(null);
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const recordId = params.get('record');
  const projectTab = params.get('tab') === 'details' ? 'details' : 'overview';
  const setProjectTab = (value: string) => {
    const next = writeUrlTab(params, 'tab', value);
    navigate({
      pathname: location.pathname,
      search: '?' + next.toString(),
      hash: location.hash,
    });
  };
  useEffect(() => {
    if (projectId && params.get('tab') !== projectTab) {
      const next = new URLSearchParams(params);
      next.set('tab', projectTab);
      navigate(
        {
          pathname: location.pathname,
          search: '?' + next.toString(),
          hash: location.hash,
        },
        { replace: true },
      );
    }
  }, [
    projectId,
    projectTab,
    params,
    navigate,
    location.pathname,
    location.hash,
  ]);
  const [query, setQuery] = useState({ uid, revealed, text: '' });
  useEffect(() => {
    setQuery({ uid, revealed, text: '' });
  }, [uid, revealed]);
  const filter =
    query.uid === uid && query.revealed === revealed ? query.text : '';
  const setLocalFilter = (text: string) => setQuery({ uid, revealed, text });
  const [pageState, setPageState] = useState({ key: '', page: 0 });
  const topicFilter = params.get('topic') ?? '';
  const fromDate = params.get('fromDate') ?? '';
  const toDate = params.get('toDate') ?? '';
  const zone = 'America/Sao_Paulo';
  const [pageSize] = useState(50);
  const pageKey = JSON.stringify([uid, revealed, filter, params.toString()]);
  const activePage = pageState.key === pageKey ? pageState.page : 0;
  const projectFilter = params.get('project') ?? '';
  const archiveFilter = params.get('status') ?? 'active';
  const projectScope = params.get('scope') === 'personal' ? 'personal' : 'work';
  const rawProjects = useProjects(functions, uid);
  const projectDetail = useProjects(functions, uid, {
    id: projectId ?? '__no-detail__',
  });
  const selectedProject = projectDetail.rows[0];
  const selectedProjects = useProjects(functions, uid, {
    scope: projectScope,
    archive: archiveFilter,
    query: filter,
    revealed,
  });
  const rawRecords = useOwnRecords(db, uid, mode !== 'projects' && !projectId, {
    project: projectFilter,
    topic: topicFilter,
    query: filter,
    fromDate,
    toDate,
    zone,
    status: 'all',
    revealed,
    ...(mode === 'records' ? { page: activePage, size: pageSize } : {}),
  });
  const rawProjectsById = new Map(rawProjects.rows.map((row) => [row.id, row]));
  const records = {
    ...rawRecords,
    rows: rawRecords.rows.map((row) => ({
      ...row,
      data: safeRecord(
        row.data,
        isHidden(
          rawProjectsById.get(text(row.data.projectId, ''))?.data,
          revealed,
        ),
      ),
    })),
  };

  const filteredProjects = {
    ...selectedProjects,
    rows: selectedProjects.rows.map((row) => ({
      ...row,
      data: safeProject(row.data, revealed),
    })),
  };
  const filteredRecords = records;
  const page = rawRecords.page;
  const openRows = rawRecords.openRows;
  useEffect(() => {
    if (
      params.has('q') ||
      (mode !== 'projects' &&
        (params.has('recordStatus') || params.has('timeZone')))
    ) {
      const next = new URLSearchParams(params);
      next.delete('q');
      if (mode !== 'projects') {
        next.delete('recordStatus');
        next.delete('timeZone');
      }
      setParams(next, { replace: true });
    }
  }, [params, setParams, mode]);
  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (key === 'project') next.delete('topic');
    if (key === 'q') {
      setLocalFilter(value);
      return;
    }
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }
  if (projectId)
    return (
      <section aria-label="Projeto">
        <Tabs value={projectTab} onValueChange={setProjectTab}>
          <ProjectHeader
            projectId={projectId}
            project={selectedProject?.data}
            catalog={rawProjects.rows}
            revealed={revealed}
            loading={rawProjects.loading}
            search={location.search}
            summary={
              projectTab === 'overview' ? (
                <div ref={setReportSummaryTarget} className="shrink-0" />
              ) : undefined
            }
            actions={
              <>
                {selectedProject?.data &&
                  !isHidden(selectedProject?.data, revealed) && (
                    <ProjectArchive
                      key={projectId + String(revealed)}
                      functions={functions}
                      projectId={projectId}
                      project={selectedProject!.data}
                    />
                  )}
                {projectTab === 'overview' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={
                          reportLoading
                            ? 'size-9 shrink-0 [&>svg]:motion-safe:animate-spin'
                            : 'size-9 shrink-0'
                        }
                        aria-busy={reportLoading}
                        aria-label="Atualizar relatório"
                        onClick={() => {
                          if (rawProjects.error) rawProjects.retry();
                          setReportRefresh((value) => value + 1);
                        }}
                      >
                        <UiIcon kind="refresh" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Atualizar relatório</TooltipContent>
                  </Tooltip>
                )}
              </>
            }
          >
            <TabsList aria-label="Seções do projeto">
              <TabsTrigger
                id="project-tab-overview"
                aria-controls="project-panel-overview"
                value="overview"
              >
                Visão geral
              </TabsTrigger>
              <TabsTrigger
                id="project-tab-details"
                aria-controls="project-panel-details"
                value="details"
              >
                Detalhes / Editar
              </TabsTrigger>
            </TabsList>
          </ProjectHeader>
          <TabsContent
            forceMount
            value="details"
            id="project-panel-details"
            aria-labelledby="project-tab-details"
            hidden={projectTab !== 'details'}
          >
            <div className="space-y-4">
              <ProjectEditor
                access={
                  <ProjectAccess
                    functions={functions}
                    uid={uid}
                    projectId={projectId}
                    project={selectedProject?.data}
                    hidden={isHidden(selectedProject?.data, revealed)}
                  />
                }
                uid={uid}
                onDeleted={() => navigate('/projects', { replace: true })}
                functions={functions}
                projectId={projectId}
                project={selectedProject?.data}
                hidden={isHidden(selectedProject?.data, revealed)}
              />
            </div>
          </TabsContent>
          <TabsContent
            forceMount
            value="overview"
            id="project-panel-overview"
            aria-labelledby="project-tab-overview"
            hidden={projectTab !== 'overview'}
          >
            {projectTab === 'overview' && (
              <ProjectReport
                refreshKey={reportRefresh}
                onLoadingChange={setReportLoading}
                summaryTarget={reportSummaryTarget}
                projectLabel={text(
                  safeProject(selectedProject?.data, revealed).title,
                  'Projeto reservado',
                )}
                key={
                  projectId +
                  String(selectedProject?.data.type) +
                  String(selectedProject?.data.updatedAt) +
                  String(Boolean(selectedProject))
                }
                projectId={projectId}
                functions={functions}
                db={db}
                personal={selectedProject?.data.type === 'personal'}
                hidden={isHidden(selectedProject?.data, revealed)}
                search={location.search}
                uid={uid}
              />
            )}
          </TabsContent>
        </Tabs>
      </section>
    );
  return (
    <div
      className={
        mode === 'projects'
          ? 'pb-[calc(104px+env(safe-area-inset-bottom))]'
          : undefined
      }
    >
      {mode === 'projects' && (
        <div>
          <CompactListToolbar
            label="Filtros de projetos"
            leading={
              <Tabs
                value={projectScope}
                onValueChange={(value) => updateFilter('scope', value)}
                className="min-w-0 shrink-0"
              >
                <TabsList
                  aria-label="Acesso aos projetos"
                  className="h-9 w-full sm:w-auto"
                >
                  <TabsTrigger value="work">Compartilhados</TabsTrigger>
                  <TabsTrigger value="personal">
                    Meus projetos pessoais
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            }
            filters={
              <Select
                value={archiveFilter || 'all'}
                onValueChange={(value) => updateFilter('status', value)}
              >
                <SelectTrigger
                  aria-label="Estado dos projetos"
                  className="w-28 shrink-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="archived">Arquivados</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
            }
            searchLabel="Pesquisar projetos"
            searchPlaceholder="Pesquisar projetos…"
            search={filter}
            onSearchChange={(value) => updateFilter('q', value)}
            loading={selectedProjects.loading}
            onRefresh={selectedProjects.retry}
            actionLabel="Limpar filtros"
            onAction={() => {
              setLocalFilter('');
              setParams(clearProjectFilters(params));
            }}
          />
          <ProjectCreate
            functions={functions}
            onCreated={(id, type) =>
              navigate(
                '/projects/' +
                  encodeURIComponent(id) +
                  '?tab=details&scope=' +
                  type,
              )
            }
          />
        </div>
      )}
      {recordId && (
        <RecordDrawer
          key={recordId}
          db={db}
          functions={functions}
          uid={uid}
          recordId={recordId}
          search={location.search}
          onClose={() => {
            const next = new URLSearchParams(params);
            next.delete('record');
            setParams(next);
          }}
        />
      )}
      {mode !== 'projects' && (
        <RecordsToolbar
          key={uid + String(revealed)}
          catalog={rawProjects.rows}
          revealed={revealed}
          loading={rawProjects.loading}
          refreshing={
            rawRecords.loading ||
            (mode === 'overview' && selectedProjects.loading)
          }
          onRefresh={() => {
            rawRecords.retry();
            if (mode === 'overview') selectedProjects.retry();
          }}
          error={rawProjects.error}
          params={params}
          search={filter}
          onFilter={updateFilter}
          onClear={() => {
            setLocalFilter('');
            const next = new URLSearchParams(params);
            for (const key of [
              'q',
              'project',
              'topic',
              'fromDate',
              'toDate',
              'recordStatus',
              'timeZone',
            ])
              next.delete(key);
            setParams(next);
          }}
        />
      )}
      {mode !== 'projects' && rawRecords.openCount > 0 && (
        <Alert className="mb-4">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Registros em aberto</AlertTitle>
          <AlertDescription>
            Há registros abertos entre os itens carregados. Confira detalhes
            antes de encerrar; nada será encerrado automaticamente.
            <ul className="my-2 space-y-1">
              {openRows.map((row) => (
                <li key={row.id}>
                  <MetadataLink
                    projectId={text(row.data.projectId, '')}
                    project={
                      rawProjectsById.get(text(row.data.projectId, ''))?.data
                    }
                    revealed={revealed}
                  />
                  {' · '}
                  <RouterLink
                    to={detailPath('records', row.id, location.search)}
                  >
                    Registro iniciado{' '}
                    {date(row.data.startedAt, row.data.timeZone)}
                  </RouterLink>
                </li>
              ))}
            </ul>
            Até 5 registros abertos exibidos neste resumo.
          </AlertDescription>
        </Alert>
      )}
      {mode !== 'projects' &&
        !rawRecords.loading &&
        !rawRecords.error &&
        !rawRecords.complete && (
          <Alert className="mb-4">
            <Info aria-hidden="true" />
            <AlertTitle>Histórico ainda não confirmado</AlertTitle>
            <AlertDescription>
              Dados locais podem estar incompletos. Aguarde a sincronização com
              o servidor antes de concluir sua consulta.
            </AlertDescription>
          </Alert>
        )}
      {mode !== 'records' && (
        <ProjectList
          hideHeading={mode === 'projects'}
          state={filteredProjects}
          catalog={rawProjects.rows}
          revealed={revealed}
        />
      )}
      {mode !== 'projects' && (
        <RecordsList
          state={filteredRecords}
          catalog={rawProjects.rows}
          revealed={revealed}
          pathname={location.pathname}
          search={location.search}
          complete={rawRecords.complete}
          hideHeading={mode === 'records'}
        />
      )}
      {mode === 'records' && (
        <>
          <details className="mt-4 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Sobre o período</summary>
            <p className="mt-2">
              Encerrados e abertos são incluídos quando atravessam o período.
              Nenhuma hora é estimada nesta lista.
            </p>
          </details>
          <div className="flex flex-wrap justify-between gap-3 mt-4 items-center">
            <Button
              disabled={page === 0}
              onClick={() => setPageState({ key: pageKey, page: page - 1 })}
            >
              Anterior
            </Button>
            <p role="status">
              Página {page + 1}·{' '}
              {rawRecords.complete
                ? rawRecords.total + ' registros encontrados'
                : 'resultado parcial'}
            </p>
            <Button
              disabled={(page + 1) * pageSize >= rawRecords.total}
              onClick={() => setPageState({ key: pageKey, page: page + 1 })}
            >
              Próxima
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
