import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '../../components/ui/tooltip';
import { MetadataLink } from '../../shared/ui/MetadataLink';
import { date, objects, text } from '../../shared/data';
export function RecordDetails({
  record,
  recordId,
  project,
  revealed,
}: {
  record: Record<string, unknown>;
  recordId: string;
  project: Record<string, unknown> | undefined;
  revealed: boolean;
}) {
  const [copy, setCopy] = useState<'idle' | 'done' | 'error'>('idle');
  return (
    <div className="space-y-5 pt-4">
      <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-5 [&_dt]:mb-1 [&_dt]:text-xs [&_dt]:text-muted-foreground [&_dd]:text-sm [&_dd]:whitespace-pre-wrap [&_dd]:[overflow-wrap:anywhere]">
        <div>
          <dt>Projeto</dt>
          <dd>
            <MetadataLink
              projectId={text(record.projectId, '')}
              project={project}
              revealed={revealed}
            />
          </dd>
        </div>
        <div>
          <dt>Tópicos</dt>
          <dd>
            {objects(record.topicSnapshots)
              .map((topic) => text(topic.title))
              .join(', ') || 'Não informado'}
          </dd>
        </div>
        <div>
          <dt>Início</dt>
          <dd>{date(record.startedAt, 'America/Sao_Paulo')}</dd>
        </div>
        <div>
          <dt>Fim</dt>
          <dd>
            {record.endedAt
              ? date(record.endedAt, 'America/Sao_Paulo')
              : 'Em aberto'}
          </dd>
        </div>
        <div className="col-span-2">
          <dt>Texto original</dt>
          <dd>{text(record.originalText)}</dd>
        </div>
        <div className="col-span-2">
          <dt>Descrição / contexto</dt>
          <dd>{text(record.interpretation)}</dd>
        </div>
      </dl>
      <div className="space-y-2 border-t pt-3 text-xs text-muted-foreground">
        <p>Gravado em {date(record.recordedAt, 'America/Sao_Paulo')}</p>
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 [overflow-wrap:anywhere]">
            ID · {recordId}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label="Copiar ID do registro"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(recordId);
                    setCopy('done');
                  } catch {
                    setCopy('error');
                  }
                }}
              >
                {copy === 'done' ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copiar ID do registro</TooltipContent>
          </Tooltip>
          <span role="status">
            {copy === 'done'
              ? 'Copiado'
              : copy === 'error'
                ? 'Não foi possível copiar'
                : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
