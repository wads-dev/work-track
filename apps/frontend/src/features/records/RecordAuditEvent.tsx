import { date, object, objects, text } from '../../shared/data';
const names: Record<string, string> = {
  projectId: 'Projeto',
  topics: 'Tópicos',
  startedAt: 'Início',
  endedAt: 'Fim',
  interpretation: 'Descrição / contexto',
  originalText: 'Texto original',
  interruptions: 'Interrupções',
  timeZone: 'Fuso histórico',
  commandAt: 'Momento da instrução',
};
export function RecordAuditEvent({
  event,
}: {
  event: Record<string, unknown>;
}) {
  const before = object(event.before),
    after = object(event.after);
  const changed = Object.keys(names).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
  const display = (record: Record<string, unknown>, key: string) => {
    if (key === 'projectId')
      return text(
        object(record.projectSnapshot).title,
        text(record.projectId, 'Não informado'),
      );
    if (key === 'topics')
      return (
        objects(record.topics)
          .map((t) => {
            const snapshot = objects(record.topicSnapshots).find(
              (s) => s.id === t.topicId,
            );
            return (
              text(snapshot?.title, text(t.topicId)) +
              (t.percentage !== undefined ? ' · ' + t.percentage + '%' : '') +
              (t.durationMinutes !== undefined
                ? ' · ' + t.durationMinutes + ' min'
                : '')
            );
          })
          .join(', ') || 'Não informado'
      );
    if (['startedAt', 'endedAt', 'commandAt'].includes(key))
      return record[key]
        ? date(record[key], 'America/Sao_Paulo')
        : key === 'endedAt'
          ? 'Em aberto'
          : 'Não informado';
    return typeof record[key] === 'object'
      ? JSON.stringify(record[key])
      : text(record[key], 'Não informado');
  };
  return (
    <article className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <p className="text-sm font-medium">
          {date(event.updatedAt ?? event.recordedAt, 'America/Sao_Paulo')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Autor · {text(event.authorUid, 'Não informado')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {text(event.reason, 'Alteração registrada')}
        </p>
      </div>
      {changed.map((key) => (
        <div key={key}>
          <h4 className="mb-1 text-xs font-medium">{names[key]}</h4>
          <dl className="grid min-w-0 grid-cols-2 gap-3 text-sm [&_dd]:whitespace-pre-wrap [&_dd]:[overflow-wrap:anywhere]">
            <div>
              <dt className="text-xs text-muted-foreground">Antes</dt>
              <dd>{display(before, key)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Depois</dt>
              <dd>{display(after, key)}</dd>
            </div>
          </dl>
        </div>
      ))}
      {!changed.length && (
        <p className="text-sm text-muted-foreground">
          Evento registrado sem alteração nos campos exibidos.
        </p>
      )}
    </article>
  );
}
