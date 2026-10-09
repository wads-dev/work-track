import { useOwnRecords } from './useOwnRecords';
import { filterRecords, recordPage } from './record-filters';
import {
  QueryToolbar,
  QueryToolbarField,
  QueryPeriodControls,
} from './QueryToolbar';
import { useProjects } from './useProjects';
import { topicDetailsPath } from './routes';
import { MetadataLink } from './MetadataLink';
import { ProjectCreate } from './ProjectCreate';
import { ProjectSelector } from './ProjectSelector';
import { writeUrlTab } from './url-tabs';
import { useEffect, useState, type ReactNode } from 'react';
import { isOpen } from './pending-utils';
import { Alert } from './components/ui/alert';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Card } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './components/ui/tooltip';
import { Skeleton } from './components/ui/skeleton';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { ProjectReport } from './ProjectReport';
import { RecordDrawer } from './RecordDrawer';
import { date, object, objects, text, useRows } from './data';
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  detailPath,
  matchesFilter,
  contextualRecordPath,
  safeReturnTo,
} from './routes';
import { UiIcon } from './UiIcons';
import { usePrivacy, isHidden, safeProject, safeRecord } from './privacy';
import { ProjectEditor } from './ProjectEditor';
import { ProjectAccess } from './ProjectAccess';
import { matchesArchive } from './project-archive';

function DataTable({
  hideHeading = false,
  historical = false,
  complete = true,
  title,
  headers,
  state,
  render,
}: {
  hideHeading?: boolean;
  historical?: boolean;
  complete?: boolean;
  title: string;
  headers: string[];
  state: ReturnType<typeof useRows>;
  render: (data: Record<string, unknown>, id: string) => ReactNode[];
}) {
  return (
    <section aria-label={title} className="mb-8">
      {!hideHeading && <h2 className="text-2xl font-semibold mb-4">{title}</h2>}
      {state.loading ? (
        <div role="status" className="flex flex-row p-4 gap-4">
          <Skeleton className="h-6 w-6 rounded-full" aria-label="Carregando" />
          <span>Carregando {title.toLowerCase()}…</span>
        </div>
      ) : state.error ? (
        <Alert variant="destructive">
          {state.error}
          <Button onClick={state.retry}>Tentar novamente</Button>
        </Alert>
      ) : state.rows.length === 0 ? (
        <Alert>
          {historical && !complete
            ? 'Sem resultados nos dados locais disponíveis. Aguarde a sincronização para consultar todo o histórico.'
            : 'Nenhum dado disponível em ' + title.toLowerCase() + '.'}
        </Alert>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:hidden">
            {state.rows.map((row) => (
              <Card key={row.id} className="p-4">
                {render(row.data, row.id).map((cell, index) => (
                  <div
                    key={headers[index]}
                    className="mb-2 [overflow-wrap:anywhere]"
                  >
                    <p className="text-xs text-muted-foreground">
                      {headers[index]}
                    </p>
                    <div className="text-sm">{cell}</div>
                  </div>
                ))}
              </Card>
            ))}
          </div>
          <div
            tabIndex={0}
            aria-label={title + ' — role para ver todas as colunas'}
            className="overflow-x-auto rounded-xl border bg-card hidden sm:block"
          >
            <Table className="min-w-[720px]">
              <caption>
                {title}
                {title === 'Projetos'
                  ? ' — catálogo autorizado'
                  : historical
                    ? ' — página do histórico'
                    : ' — até 100 itens'}
                {historical
                  ? '. Mais recentes primeiro; datas inválidas ao final.'
                  : '. A ordem não representa os mais recentes.'}
              </caption>
              <TableHeader>
                <TableRow>
                  {headers.map((header) => (
                    <TableHead key={header} scope="col">
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.rows.map((row) => (
                  <TableRow key={row.id}>
                    {render(row.data, row.id).map((cell, index) => (
                      <TableCell
                        key={headers[index]}
                        className="[overflow-wrap:anywhere] whitespace-pre-wrap align-top min-w-[150px] max-w-[360px]"
                      >
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!historical && title !== 'Projetos' && state.rows.length === 100 && (
            <Alert className="mt-2">
              Limite de 100 itens atingido. Esta visão não representa
              necessariamente todos os dados.
            </Alert>
          )}
        </>
      )}
    </section>
  );
}
function topicLabels(data: Record<string, unknown>) {
  const snapshots = objects(data.topicSnapshots);
  return (
    objects(data.topics)
      .map((topic) => {
        const snapshot = snapshots.find((item) => item.id === topic.topicId);
        const title = text(snapshot?.title, text(topic.topicId));
        const allocation =
          typeof topic.percentage === 'number'
            ? ' · ' + topic.percentage + '%'
            : '';
        const duration =
          typeof topic.durationMinutes === 'number'
            ? ' · ' + topic.durationMinutes + ' min'
            : '';
        return title + allocation + duration;
      })
      .join('\n') || 'Não informado'
  );
}
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
  const rawProjects = useProjects(functions, uid);
  const rawRecords = useOwnRecords(db, uid, mode !== 'projects');
  const rawProjectsById = new Map(rawProjects.rows.map((row) => [row.id, row]));
  const projects = {
    ...rawProjects,
    rows: rawProjects.rows.map((row) => ({
      ...row,
      data: safeProject(row.data, revealed),
    })),
  };
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
  const zone = params.get('timeZone') ?? 'America/Sao_Paulo';
  const [pageSize] = useState(50);
  const pageKey = JSON.stringify([uid, revealed, filter, params.toString()]);
  const activePage = pageState.key === pageKey ? pageState.page : 0;
  const projectFilter = params.get('project') ?? '';
  const archiveFilter = params.get('status') ?? 'active';
  const projectScope = params.get('scope') === 'personal' ? 'personal' : 'work';
  useEffect(() => {
    if (params.has('q')) {
      const next = new URLSearchParams(params);
      next.delete('q');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);
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
        {params.has('returnTo') && (
          <Button asChild className="mb-4">
            <RouterLink to={safeReturnTo(params.get('returnTo'))}>
              Voltar ao contexto
            </RouterLink>
          </Button>
        )}
        <Button asChild className="mb-4">
          <RouterLink to={'/projects' + location.search}>
            Voltar aos projetos
          </RouterLink>
        </Button>
        <h2 className="text-2xl font-semibold">
          {text(
            projects.rows.find((item) => item.id === projectId)?.data.title,
            'Projeto indisponível',
          )}
        </h2>
        <p className="text-muted-foreground">
          {text(
            projects.rows.find((item) => item.id === projectId)?.data
              .description,
            'O relatório consulta o projeto diretamente, independente do limite da lista.',
          )}
        </p>
        {!rawProjects.loading &&
          rawProjects.rows.some((row) => row.id === projectId) && (
            <p className="text-sm mt-2">
              {rawProjectsById.get(projectId)?.data.type === 'personal'
                ? 'Pessoal · acesso somente ao dono'
                : 'Compartilhado · usuários autorizados da empresa'}
            </p>
          )}
        <ProjectAccess
          functions={functions}
          uid={uid}
          projectId={projectId}
          project={rawProjectsById.get(projectId)?.data}
          hidden={isHidden(rawProjectsById.get(projectId)?.data, revealed)}
        />
        <Tabs value={projectTab} onValueChange={setProjectTab} className="mt-4">
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
          <TabsContent
            forceMount
            value="details"
            id="project-panel-details"
            aria-labelledby="project-tab-details"
            hidden={projectTab !== 'details'}
          >
            <ProjectEditor
              uid={uid}
              onDeleted={() => navigate('/projects', { replace: true })}
              functions={functions}
              projectId={projectId}
              project={rawProjectsById.get(projectId)?.data}
              hidden={isHidden(rawProjectsById.get(projectId)?.data, revealed)}
            />
          </TabsContent>
          <TabsContent
            forceMount
            value="overview"
            id="project-panel-overview"
            aria-labelledby="project-tab-overview"
            hidden={projectTab !== 'overview'}
          >
            <ProjectReport
              projectLabel={text(
                projects.rows.find((row) => row.id === projectId)?.data.title,
                'Projeto reservado',
              )}
              key={
                projectId +
                String(rawProjectsById.get(projectId)?.data.type) +
                String(rawProjectsById.get(projectId)?.data.updatedAt) +
                String(rawProjectsById.has(projectId))
              }
              projectId={projectId}
              functions={functions}
              hidden={isHidden(rawProjectsById.get(projectId)?.data, revealed)}
              search={location.search}
              uid={uid}
            />
          </TabsContent>
        </Tabs>
      </section>
    );
  const filteredProjects = {
    ...projects,
    rows: projects.rows.filter(
      (row) =>
        (rawProjectsById.get(row.id)?.data.type === 'personal'
          ? 'personal'
          : 'work') === projectScope &&
        matchesArchive(rawProjectsById.get(row.id)?.data, archiveFilter) &&
        matchesFilter(
          [
            row.id,
            rawProjectsById.get(row.id)?.data.title,
            rawProjectsById.get(row.id)?.data.description,
            ...objects(rawProjectsById.get(row.id)?.data.topics).map(
              (topic) => topic.title,
            ),
          ],
          filter,
        ),
    ),
  };
  let recordFilterError = '';
  let matchingRecords: typeof rawRecords.rows;
  try {
    matchingRecords = filterRecords(
      rawRecords.rows,
      {
        project: projectFilter,
        topic: topicFilter,
        query: '',
        fromDate,
        toDate,
        zone,
        status: params.get('recordStatus') ?? 'all',
      },
      objects(rawProjectsById.get(projectFilter)?.data.topics),
    );
  } catch (error) {
    recordFilterError =
      error instanceof Error ? error.message : 'Período inválido';
    matchingRecords = [];
  }
  const safeRecordsById = new Map(records.rows.map((row) => [row.id, row]));
  const matchingSafeRecords = matchingRecords
    .map((row) => safeRecordsById.get(row.id))
    .filter((row): row is (typeof records.rows)[number] => row !== undefined)
    .filter((row) =>
      matchesFilter(
        [
          row.id,
          row.data.originalText,
          row.data.interpretation,
          object(row.data.projectSnapshot).title,
          topicLabels(row.data),
        ],
        filter,
      ),
    );
  const page = Math.min(
    activePage,
    Math.max(0, Math.ceil(matchingSafeRecords.length / pageSize) - 1),
  );
  const filteredRecords = {
    ...records,
    error: recordFilterError || records.error,
    rows:
      mode === 'records'
        ? recordPage(matchingSafeRecords, page, pageSize)
        : matchingSafeRecords,
  };
  const topicOptions = objects(rawProjectsById.get(projectFilter)?.data.topics);
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
          <div className="mb-4 grid grid-cols-1 items-center gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Tabs
              value={projectScope}
              onValueChange={(value) => updateFilter('scope', value)}
            >
              <TabsList aria-label="Acesso aos projetos">
                <TabsTrigger value="work">Compartilhados</TabsTrigger>
                <TabsTrigger value="personal">
                  Meus projetos pessoais
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <ProjectCreate
              functions={functions}
              onCreated={(id, type) => {
                navigate(
                  '/projects/' +
                    encodeURIComponent(id) +
                    '?tab=details&scope=' +
                    type,
                );
              }}
            />
          </div>
          <section
            aria-label="Filtros de projetos"
            className="mb-4 grid grid-cols-1 items-start gap-4 md:grid-cols-3 rounded-xl border bg-card p-4 sm:p-6"
          >
            {mode === 'projects' && (
              <div className="min-w-0 space-y-1.5">
                <Label>Estado dos projetos</Label>
                <Select
                  value={archiveFilter || '__all__'}
                  onValueChange={(value) =>
                    updateFilter('status', value === '__all__' ? '' : value)
                  }
                >
                  <SelectTrigger aria-label="Estado dos projetos">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativos</SelectItem>
                    <SelectItem value="archived">Arquivados</SelectItem>
                    <SelectItem value="all">Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Label className="grid min-w-0 gap-1.5">
              Pesquisar projetos
              <Input
                value={filter}
                onChange={(event) => updateFilter('q', event.target.value)}
              />
            </Label>
            <Button
              onClick={() => {
                const next = new URLSearchParams(params);
                setLocalFilter('');
                next.delete('q');
                next.delete('project');
                next.delete('status');
                setParams(next);
              }}
              className="whitespace-nowrap"
            >
              Limpar filtros
            </Button>
          </section>
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
      {mode !== 'projects' && records.rows.some((row) => isOpen(row.data)) && (
        <Alert className="mb-4">
          Há registros abertos entre os itens carregados. Confira detalhes antes
          de encerrar; nada será encerrado automaticamente.
          <ul>
            {records.rows
              .filter((row) => isOpen(row.data))
              .slice(0, 5)
              .map((row) => (
                <li key={row.id}>
                  <MetadataLink
                    projectId={text(row.data.projectId, '')}
                    project={
                      rawProjects.rows.find((p) => p.id === row.data.projectId)
                        ?.data
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
        </Alert>
      )}
      {mode !== 'projects' && (
        <QueryToolbar
          label="Filtros de registros"
          actions={
            <>
              {' '}
              {rawRecords.error && (
                <Button onClick={rawRecords.retry}>Tentar novamente</Button>
              )}
              <Button
                className="whitespace-nowrap"
                onClick={() => {
                  const next = new URLSearchParams(params);
                  setLocalFilter('');
                  next.delete('q');
                  for (const key of [
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
              >
                Limpar filtros
              </Button>
            </>
          }
          secondary={
            <>
              {' '}
              <QueryToolbarField kind="search">
                {' '}
                <Label className="grid gap-1.5">
                  Pesquisar registros
                  <Input
                    value={filter}
                    onChange={(event) => updateFilter('q', event.target.value)}
                  />
                </Label>
              </QueryToolbarField>
              <QueryToolbarField kind="standard">
                {' '}
                <div className="space-y-1.5">
                  <Label>Assunto / tópico</Label>
                  <Select
                    value={topicFilter || '__all__'}
                    disabled={!projectFilter}
                    onValueChange={(value) =>
                      updateFilter('topic', value === '__all__' ? '' : value)
                    }
                  >
                    <SelectTrigger aria-label="Assunto / tópico">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos os assuntos</SelectItem>
                      {topicOptions.map((topic) => (
                        <SelectItem key={text(topic.id)} value={text(topic.id)}>
                          {isHidden(
                            rawProjectsById.get(projectFilter)?.data,
                            revealed,
                          )
                            ? 'Assunto reservado'
                            : text(topic.title)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </QueryToolbarField>
              <QueryToolbarField kind="standard">
                {' '}
                <Label className="grid gap-1.5">
                  Fuso do período
                  <Input
                    value={zone}
                    onChange={(e) => updateFilter('timeZone', e.target.value)}
                  />
                </Label>
              </QueryToolbarField>
              <QueryToolbarField kind="standard">
                {' '}
                <div className="space-y-1.5">
                  <Label>Estado do registro</Label>
                  <Select
                    value={(params.get('recordStatus') ?? 'all') || '__all__'}
                    onValueChange={(value) =>
                      updateFilter(
                        'recordStatus',
                        value === '__all__' ? '' : value,
                      )
                    }
                  >
                    <SelectTrigger aria-label="Estado do registro">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="open">Em aberto</SelectItem>
                      <SelectItem value="closed">Encerrados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </QueryToolbarField>{' '}
            </>
          }
          className="mb-4"
        >
          <QueryPeriodControls
            fromDate={fromDate}
            toDate={toDate}
            onFromChange={(value) => updateFilter('fromDate', value)}
            onToChange={(value) => updateFilter('toDate', value)}
          />
          <QueryToolbarField kind="project">
            <ProjectSelector
              key={uid + String(revealed)}
              projects={rawProjects.rows.map((row) => ({
                id: row.id,
                label: text(
                  safeProject(row.data, revealed).title,
                  'Projeto reservado',
                ),
                searchText:
                  text(row.data.title, '') +
                  ' ' +
                  text(row.data.description, ''),
              }))}
              projectId={projectFilter}
              loading={rawProjects.loading}
              error={rawProjects.error}
              onChange={(id) => updateFilter('project', id)}
            />
          </QueryToolbarField>
        </QueryToolbar>
      )}
      {mode !== 'projects' && (
        <p className="text-xs text-muted-foreground">
          {rawRecords.complete
            ? 'Histórico completo sincronizado.'
            : 'Dados locais podem estar incompletos; aguardando sincronização com o servidor.'}{' '}
          Mais recentes primeiro; datas inválidas ao final.
        </p>
      )}
      {mode !== 'records' && (
        <DataTable
          hideHeading={mode === 'projects'}
          title="Projetos"
          headers={['Projeto', 'Descrição', 'Tópicos', 'Criado em']}
          state={filteredProjects}
          render={(data, id) => [
            <MetadataLink
              projectId={id}
              project={rawProjects.rows.find((p) => p.id === id)?.data}
              revealed={revealed}
            />,
            text(data.description),
            <div className="flex flex-col gap-2">
              {objects(data.topics).length === 0 && 'Não informado'}
              {objects(data.topics).map((topic, index) => (
                <Badge
                  key={text(topic.id, String(index))}
                  variant="secondary"
                  className="max-w-full self-start whitespace-normal"
                  asChild={
                    !!text(topic.id, '') &&
                    !isHidden(
                      rawProjects.rows.find((p) => p.id === id)?.data,
                      revealed,
                    )
                  }
                >
                  {text(topic.id, '') &&
                  !isHidden(
                    rawProjects.rows.find((p) => p.id === id)?.data,
                    revealed,
                  ) ? (
                    <RouterLink
                      to={
                        topicDetailsPath(id, text(topic.id)) +
                        '?returnTo=' +
                        encodeURIComponent(location.pathname + location.search)
                      }
                    >
                      {text(topic.title)}
                    </RouterLink>
                  ) : (
                    <span>{text(topic.title)}</span>
                  )}
                </Badge>
              ))}
            </div>,
            date(data.createdAt),
          ]}
        />
      )}
      {mode !== 'projects' && (
        <DataTable
          hideHeading={mode === 'records'}
          historical
          complete={rawRecords.complete}
          title="Meus registros"
          headers={['Projeto / tópicos', 'Início / fim', 'Detalhes']}
          state={filteredRecords}
          render={(data, id) => [
            <>
              <MetadataLink
                projectId={text(data.projectId, '')}
                project={
                  rawProjects.rows.find((p) => p.id === data.projectId)?.data
                }
                revealed={revealed}
              />
              <p className="whitespace-pre-wrap text-sm">
                {objects(data.topics).map((t, index) => (
                  <span key={index}>
                    {index > 0 ? ' · ' : ''}
                    {text(t.topicId, '') ? (
                      <MetadataLink
                        projectId={text(data.projectId, '')}
                        project={
                          rawProjects.rows.find((p) => p.id === data.projectId)
                            ?.data
                        }
                        revealed={revealed}
                        topicId={text(t.topicId)}
                      />
                    ) : (
                      'Assunto indisponível'
                    )}
                  </span>
                ))}
              </p>
            </>,
            <>
              {date(data.startedAt, data.timeZone)}
              <br />
              {data.endedAt
                ? date(data.endedAt, data.timeZone)
                : 'Fim não informado'}
            </>,
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" asChild>
                  <RouterLink
                    to={contextualRecordPath(
                      location.pathname,
                      location.search,
                      id,
                    )}
                    aria-label="Abrir detalhes e auditoria do registro"
                  >
                    <UiIcon kind="detail" />
                  </RouterLink>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Abrir detalhes e auditoria</TooltipContent>
            </Tooltip>,
          ]}
        />
      )}
      {mode === 'records' && (
        <>
          <p className="text-xs">
            Período: sobreposição para encerrados; data de início para abertos,
            sem estimar horas.
          </p>
          <div className="flex flex-row gap-4 mt-4 items-center">
            <Button
              disabled={page === 0}
              onClick={() => setPageState({ key: pageKey, page: page - 1 })}
            >
              Anterior
            </Button>
            <p role="status">
              Página {page + 1}·{' '}
              {rawRecords.complete
                ? matchingSafeRecords.length + ' registros encontrados'
                : 'resultado parcial'}
            </p>
            <Button
              disabled={(page + 1) * pageSize >= matchingSafeRecords.length}
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
