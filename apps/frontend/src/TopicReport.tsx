import { PersonIdentity } from './PersonIdentity';
import { cn } from './lib/utils';
import { Label } from './components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from './components/ui/select';
import { Card } from './components/ui/card';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { hours } from './report-chart';
import { InteractiveChart } from './InteractiveChart';
import { Link as RouterLink } from 'react-router-dom';

import { topicDetailsPath } from './routes';

/** View model only: callers must supply server-calculated allocations and safe labels. */
export type TopicReportBucket = {
  projectId: string;
  topicId: string | null;
  projectLabel: string;
  topicLabel: string;
  minutes: number;
  detailsAvailable?: boolean;
  people: { key: string; label: string; minutes: number; uid?: string }[];
};
export const topicBucketKey = (
  bucket: Pick<TopicReportBucket, 'projectId' | 'topicId'>,
) => JSON.stringify([bucket.projectId, bucket.topicId]);

export function TopicReport({
  buckets,
  personal = false,
  unassignedMinutes = 0,
}: {
  buckets: TopicReportBucket[];
  personal?: boolean;
  unassignedMinutes?: number;
}) {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const selected = params.get('topic') ?? '';
  const setSelected = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('topic', value);
    else next.delete('topic');
    navigate({
      pathname: location.pathname,
      search: next.toString() ? '?' + next.toString() : '',
      hash: location.hash,
    });
  };
  const active = buckets.find((bucket) => topicBucketKey(bucket) === selected);
  return (
    <Card className="gap-0 py-0">
      <section
        aria-label="Tempo por tópico"
        className={cn('p-4 sm:p-5 min-w-0')}
      >
        <div className={cn('flex flex-col gap-4')}>
          <h3 className={cn('text-lg font-semibold')}>Tempo por tópico</h3>
          <p className={cn('text-sm text-muted-foreground')}>
            Distribuição informada pelo relatório. Tópicos de projetos
            diferentes permanecem separados; tempo sem divisão não é repartido
            automaticamente.
          </p>
          <p className={cn('text-base')}>
            Não distribuído: {hours(unassignedMinutes)}. Tempo sem atribuição
            válida; não é distribuído por projeto ou pessoa.
          </p>
          {buckets.length === 0 ? (
            <p className={cn('text-base text-muted-foreground')}>
              Nenhum tópico com tempo neste escopo.
            </p>
          ) : (
            <>
              <Label className="flex min-w-0 flex-col items-stretch gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {'Tópico e projeto'}
                </span>
                <Select
                  value={(active ? selected : '') || '__all__'}
                  onValueChange={(value) =>
                    setSelected(value === '__all__' ? '' : value)
                  }
                >
                  <SelectTrigger aria-label={'Tópico e projeto'}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os tópicos</SelectItem>
                    {buckets.map((bucket) => (
                      <SelectItem
                        key={topicBucketKey(bucket)}
                        value={topicBucketKey(bucket)}
                      >
                        {bucket.projectLabel} ·{' '}
                        {bucket.topicId === null
                          ? 'Não distribuído'
                          : bucket.topicLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Label>
              <InteractiveChart
                title="Tempo por tópico"
                variant="bar"
                data={(active ? [active] : buckets).map((bucket) => ({
                  key: topicBucketKey(bucket),
                  label: bucket.projectLabel + ' · ' + bucket.topicLabel,
                  minutes: bucket.minutes,
                  ...(bucket.detailsAvailable && bucket.topicId !== null
                    ? {
                        href:
                          topicDetailsPath(bucket.projectId, bucket.topicId) +
                          '?returnTo=' +
                          encodeURIComponent(
                            location.pathname + location.search,
                          ),
                      }
                    : { onSelect: () => setSelected(topicBucketKey(bucket)) }),
                }))}
              />
              <ul className={cn('list-none p-0 m-0')}>
                {(active ? [active] : buckets).map((bucket) => (
                  <li
                    key={topicBucketKey(bucket)}
                    className={cn('py-3 border-b')}
                  >
                    <div className={cn('flex flex-row justify-between gap-4')}>
                      <div className={cn('min-w-0 [overflow-wrap:anywhere]')}>
                        <p className={cn('text-base')}>
                          {bucket.topicId === null ? (
                            'Não distribuído'
                          ) : bucket.detailsAvailable && bucket.topicId ? (
                            <RouterLink
                              onClick={(e) => e.stopPropagation()}
                              to={
                                topicDetailsPath(
                                  bucket.projectId,
                                  bucket.topicId,
                                ) +
                                '?returnTo=' +
                                encodeURIComponent(
                                  location.pathname + location.search,
                                )
                              }
                              className={cn(
                                'text-primary underline-offset-4 hover:underline',
                              )}
                            >
                              {bucket.topicLabel}
                            </RouterLink>
                          ) : (
                            bucket.topicLabel
                          )}
                        </p>
                        <span className={cn('text-xs text-muted-foreground')}>
                          {bucket.detailsAvailable ? (
                            <RouterLink
                              to={
                                '/projects/' +
                                encodeURIComponent(bucket.projectId) +
                                '?returnTo=' +
                                encodeURIComponent(
                                  location.pathname + location.search,
                                )
                              }
                              className={cn(
                                'text-primary underline-offset-4 hover:underline',
                              )}
                            >
                              {bucket.projectLabel}
                            </RouterLink>
                          ) : (
                            bucket.projectLabel
                          )}
                        </span>
                      </div>
                      <p
                        className={cn(
                          'text-base whitespace-nowrap tabular-nums',
                        )}
                      >
                        {hours(bucket.minutes)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              {active && (
                <div>
                  <h4 className={cn('text-base font-medium')}>
                    {personal
                      ? 'Meu tempo neste tópico'
                      : 'Pessoas neste tópico'}
                  </h4>
                  <InteractiveChart
                    title={
                      personal
                        ? 'Meu tempo neste tópico'
                        : 'Pessoas neste tópico'
                    }
                    variant="bar"
                    data={active.people.map((person) => ({
                      ...person,
                      uid: active.detailsAvailable ? person.uid : undefined,
                      href:
                        !personal && active.detailsAvailable && person.uid
                          ? '/people/' +
                            encodeURIComponent(person.uid) +
                            location.search
                          : undefined,
                    }))}
                  />
                  <ul className={cn('list-none p-0 m-0')}>
                    {active.people.map((person) => (
                      <li
                        key={person.key}
                        className={cn('flex justify-between gap-4 py-2')}
                      >
                        <p className={cn('text-base [overflow-wrap:anywhere]')}>
                          <PersonIdentity
                            uid={
                              active.detailsAvailable ? person.uid : undefined
                            }
                            fallback={person.label}
                          />
                        </p>
                        <p className={cn('text-base whitespace-nowrap')}>
                          {hours(person.minutes)}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {active.people.length === 0 && (
                    <p className={cn('text-sm text-muted-foreground')}>
                      Detalhamento por pessoa indisponível neste escopo.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </Card>
  );
}
