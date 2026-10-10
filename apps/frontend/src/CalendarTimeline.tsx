import { cn } from './lib/utils';
import { PersonIdentity } from './PersonIdentity';
import { useCompanyPeople } from './CompanyPeopleContext';
import { usePrivacy } from './privacy';
import { Button } from './components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from './components/ui/tooltip';
import { Card } from './components/ui/card';
import { Alert, AlertDescription } from './components/ui/alert';
import { useState } from 'react';

import { contextualRecordPath } from './routes';
import { Link as RouterLink } from 'react-router-dom';
import {
  addDays,
  calendarDays,
  midnight,
  range,
  type View,
} from './calendar-utils';
import {
  commonSpan,
  layoutDay,
  commonGaps,
  axisSegments,
  projectMinute,
  type Timed,
} from './timeline-layout';
type Event = Timed & { uid?: string; projectId: string; estimated: boolean };
export function CalendarTimeline({
  items,
  day,
  view,
  zone,
  label,
  color,
  returnTo,
  viewerUid,
  authorLabel,
  renderProject,
  detailsAvailable,
}: {
  items: Event[];
  day: string;
  view: View;
  zone: string;
  label: (id: string) => string;
  color: (id: string) => string;
  returnTo: string;
  viewerUid: string;
  authorLabel: (uid: string) => string;
  detailsAvailable?: (projectId: string) => boolean;
  renderProject?: (id: string) => import('react').ReactNode;
}) {
  const directory = useCompanyPeople();
  const { revealed } = usePrivacy();
  const identity = (item: Event) => {
    const available = detailsAvailable
      ? detailsAvailable(item.projectId)
      : label(item.projectId) !== 'Projeto reservado';
    const personUid = available ? item.uid || viewerUid : undefined;
    const fallback = personUid ? authorLabel(personUid) : 'Pessoa';
    return {
      personUid,
      fallback,
      personLabel:
        revealed && personUid
          ? directory.name(personUid) || fallback
          : 'Pessoa',
    };
  };
  const [expansion, setExpansion] = useState<{
    period: string;
    keys: string[];
  }>({ period: '', keys: [] });
  const period = day + '-' + view;
  const coverage = range(day, view, zone);
  const days = calendarDays(day, view);
  const time = (instant: number) =>
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(instant));
  const minute = (instant: number) => {
    const p = new Intl.DateTimeFormat('en', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    return (
      Number(p.find((x) => x.type === 'hour')?.value) * 60 +
      Number(p.find((x) => x.type === 'minute')?.value)
    );
  };
  const data = days.map((key) => {
    const start = Date.parse(midnight(key, zone)),
      end = Date.parse(midnight(addDays(key, 1), zone));
    return {
      key,
      start,
      end,
      outside:
        key < coverage.first || key >= addDays(coverage.first, coverage.count),
      events: layoutDay(
        key < coverage.first || key >= addDays(coverage.first, coverage.count)
          ? []
          : items,
        start,
        end,
      ).map((e) => ({
        ...e,
        wallStart: e.start === start ? 0 : minute(e.start),
        wallEnd: e.end === end ? 1440 : minute(e.end),
      })),
    };
  });
  const span = commonSpan(
    data.flatMap((d) =>
      d.events.map((e) => ({ start: e.wallStart, end: e.wallEnd })),
    ),
  ) ?? { first: 0, last: 0 };
  if (!data.some((d) => d.events.length))
    return (
      <Alert>
        <AlertDescription>
          Nenhum intervalo nesta página para exibir na linha do tempo.
        </AlertDescription>
      </Alert>
    );
  const px = 1.1;
  const gaps = commonGaps(
    data.flatMap((d) =>
      d.events.map((e) => ({ start: e.wallStart, end: e.wallEnd })),
    ),
    span.first,
    span.last,
  );
  const expanded = expansion.period === period ? expansion.keys : [];
  const segments = axisSegments(span.first, span.last, gaps, expanded, px);
  const height = segments.reduce((sum, segment) => sum + segment.height, 0);
  const ticks = Array.from(
    { length: span.last > span.first ? (span.last - span.first) / 60 + 1 : 0 },
    (_, i) => span.first + i * 60,
  ).filter(
    (minute) =>
      !segments.some((s) => s.collapsed && minute > s.start && minute < s.end),
  );
  const clock = (m: number) =>
    String(Math.floor(m / 60)).padStart(2, '0') +
    ':' +
    String(m % 60).padStart(2, '0');
  return (
    <div>
      <div
        tabIndex={0}
        aria-label="Linha do tempo alinhada; role para ver todos os dias"
        className={cn('overflow-x-auto p-2')}
      >
        <div
          className={cn('grid gap-2')}
          style={{
            gridTemplateColumns:
              view === 'month'
                ? 'repeat(7,minmax(100px,1fr))'
                : 'repeat(' + Math.min(days.length, 7) + ',minmax(240px,1fr))',
            minWidth: view === 'month' ? 700 : Math.min(days.length, 7) * 240,
          }}
        >
          {data.map((d) => (
            <Card key={d.key} className={cn('gap-0 p-2 rounded-lg')}>
              <h3
                className={cn(
                  'text-sm font-medium text-center h-12 relative min-w-0',
                )}
              >
                {d.key}
              </h3>
              {d.outside && (
                <span
                  className={cn(
                    'text-xs absolute -mt-6 text-[10px] max-w-[210px] [overflow-wrap:anywhere]',
                  )}
                >
                  Fora do mês consultado — sem cobertura
                </span>
              )}
              <div
                className={cn('relative pl-12')}
                style={{ height: height + 30 }}
              >
                {ticks.map((minute, i) => (
                  <div
                    key={i}
                    className={cn('absolute left-0 right-0')}
                    style={{ top: 15 + projectMinute(minute, segments) }}
                  >
                    <span
                      className={cn(
                        'text-xs absolute left-0 w-[42px] leading-none -translate-y-1/2',
                      )}
                    >
                      {clock(minute)}
                    </span>
                    <div className={cn('ml-12 border-t')} />
                  </div>
                ))}
                {segments
                  .filter((s) =>
                    gaps.some((g) => g.start === s.start && g.end === s.end),
                  )
                  .map((s) => (
                    <Button
                      key={s.start}
                      aria-expanded={!s.collapsed}
                      aria-label={
                        (s.collapsed ? 'Expandir' : 'Recolher') +
                        ' intervalo ' +
                        clock(s.start) +
                        '–' +
                        clock(s.end) +
                        ' sem atividades em todos os dias'
                      }
                      onClick={() => {
                        const key = s.start + '-' + s.end;
                        setExpansion({
                          period,
                          keys: expanded.includes(key)
                            ? expanded.filter((k) => k !== key)
                            : [...expanded, key],
                        });
                      }}
                      variant="ghost"
                      className={cn(
                        'absolute left-12 right-0 min-h-0 p-0 text-[10px] z-[2] bg-muted',
                      )}
                      style={{ top: 15 + s.top, height: s.collapsed ? 32 : 24 }}
                    >
                      … {clock(s.start)}–{clock(s.end)} ·{' '}
                      {(s.end - s.start) / 60}h sem atividades
                    </Button>
                  ))}
                <div
                  className={cn('absolute top-[15px] left-12 right-0')}
                  style={{ height }}
                >
                  {d.events
                    .filter((e) => !e.point)
                    .map((e) => {
                      const { personUid, fallback, personLabel } = identity(
                        e.item,
                      );
                      const caption =
                        label(e.item.projectId) +
                        ' · ' +
                        time(e.start) +
                        ' — ' +
                        time(e.end) +
                        ' · ' +
                        new Intl.NumberFormat('pt-BR', {
                          maximumFractionDigits: 1,
                        }).format((e.end - e.start) / 60000) +
                        ' min' +
                        (e.item.estimated ? ' · Estimado' : '') +
                        (e.overlap ? ' · Sobreposição' : '');
                      return (
                        <Tooltip
                          key={JSON.stringify([
                            e.item.uid || viewerUid,
                            e.item.id,
                          ])}
                        >
                          <TooltipTrigger asChild>
                            <Button
                              tabIndex={0}
                              aria-label={personLabel + ' · ' + caption}
                              asChild
                              variant="ghost"
                              className={cn(
                                'absolute min-h-[22px] hover:!h-auto hover:z-40 hover:shadow-lg focus-visible:!h-auto focus-visible:z-40 focus-visible:shadow-lg group min-w-0 p-0 rounded box-border border border-l-4 bg-card text-foreground overflow-hidden text-left block text-[11px] leading-[1.15]',
                              )}
                              style={{
                                top: projectMinute(e.wallStart, segments),
                                minHeight: Math.max(
                                  22,
                                  projectMinute(e.wallEnd, segments) -
                                    projectMinute(e.wallStart, segments),
                                ),
                                height:
                                  projectMinute(e.wallEnd, segments) -
                                  projectMinute(e.wallStart, segments),
                                left: (e.column / e.columns) * 100 + '%',
                                width: 100 / e.columns + '%',
                                borderColor: color(e.item.projectId),
                              }}
                            >
                              {e.item.uid && e.item.uid !== viewerUid ? (
                                <span tabIndex={0}>
                                  <span
                                    className={cn(
                                      'text-base block whitespace-nowrap overflow-hidden text-ellipsis group-hover:whitespace-normal group-focus-visible:whitespace-normal [overflow-wrap:anywhere] text-[11px] px-1',
                                    )}
                                  >
                                    <PersonIdentity
                                      uid={personUid}
                                      fallback={fallback}
                                    />
                                    {' · '}
                                    {time(e.start)} · {label(e.item.projectId)}
                                    {e.item.estimated ? ' ◷' : ''}
                                    {e.overlap ? ' ⇆' : ''}
                                  </span>
                                </span>
                              ) : (
                                <RouterLink
                                  to={
                                    contextualRecordPath(
                                      returnTo.split('?')[0],
                                      returnTo.includes('?')
                                        ? '?' +
                                            returnTo
                                              .split('?')
                                              .slice(1)
                                              .join('?')
                                        : '',
                                      e.item.id,
                                    ) ?? '#'
                                  }
                                >
                                  <span
                                    className={cn(
                                      'text-base block whitespace-nowrap overflow-hidden text-ellipsis group-hover:whitespace-normal group-focus-visible:whitespace-normal [overflow-wrap:anywhere] text-[11px] px-1',
                                    )}
                                  >
                                    <PersonIdentity
                                      uid={personUid}
                                      fallback={fallback}
                                    />
                                    {' · '}
                                    {time(e.start)} · {label(e.item.projectId)}
                                    {e.item.estimated ? ' ◷' : ''}
                                    {e.overlap ? ' ⇆' : ''}
                                  </span>
                                </RouterLink>
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <PersonIdentity
                              uid={personUid}
                              fallback={fallback}
                            />
                            {' · '}
                            {caption}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                </div>
              </div>
              {/* Normal flow keeps simultaneous points reachable even inside
                  collapsed gaps or outside the interval axis span. */}
              {d.events.some((e) => e.point) && (
                <section
                  aria-label={'Marcadores estimados de ' + d.key}
                  className="mt-2 min-w-0"
                >
                  <h4 className="text-xs font-medium mb-1">
                    Estimados · sem duração
                  </h4>
                  <ul className="flex flex-col gap-1">
                    {d.events
                      .filter((e) => e.point)
                      .map((e) => {
                        const { personUid, fallback, personLabel } = identity(
                          e.item,
                        );
                        const caption =
                          personLabel +
                          ' · ' +
                          time(e.start) +
                          ' · ' +
                          label(e.item.projectId) +
                          ' · Estimado · sem duração';
                        const className =
                          'block min-h-8 rounded border border-l-4 px-2 py-1 text-xs whitespace-normal [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-ring';
                        return (
                          <li
                            key={JSON.stringify([
                              e.item.uid || viewerUid,
                              e.item.id,
                            ])}
                          >
                            {e.item.uid && e.item.uid !== viewerUid ? (
                              <span
                                tabIndex={0}
                                aria-label={caption}
                                className={className}
                                style={{ borderColor: color(e.item.projectId) }}
                              >
                                <PersonIdentity
                                  uid={personUid}
                                  fallback={fallback}
                                />
                                {' · '}
                                {time(e.start)} · {label(e.item.projectId)} ·
                                Estimado · sem duração
                              </span>
                            ) : (
                              <RouterLink
                                aria-label={caption}
                                className={className}
                                style={{ borderColor: color(e.item.projectId) }}
                                to={
                                  contextualRecordPath(
                                    returnTo.split('?')[0],
                                    returnTo.includes('?')
                                      ? '?' +
                                          returnTo.split('?').slice(1).join('?')
                                      : '',
                                    e.item.id,
                                  ) ?? '#'
                                }
                              >
                                <PersonIdentity
                                  uid={personUid}
                                  fallback={fallback}
                                />
                                {' · '}
                                {time(e.start)} · {label(e.item.projectId)} ·
                                Estimado · sem duração
                              </RouterLink>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                </section>
              )}
            </Card>
          ))}
        </div>
      </div>
      {renderProject && (
        <div className={cn('flex flex-row gap-2 flex-wrap mt-2')}>
          {Array.from(new Set(items.map((i) => i.projectId))).map((id) => (
            <div key={id}>{renderProject(id)}</div>
          ))}
        </div>
      )}
    </div>
  );
}
