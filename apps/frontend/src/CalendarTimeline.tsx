import { useState } from 'react';
import { Alert, Box, Button, Paper, Tooltip, Typography } from '@mui/material';
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
}) {
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
  );
  if (!span)
    return (
      <Alert severity="info">
        Nenhum intervalo nesta página para exibir na linha do tempo.
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
    { length: (span.last - span.first) / 60 + 1 },
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
    <Box>
      <Box
        sx={{ overflowX: 'auto', p: 1 }}
        tabIndex={0}
        aria-label="Linha do tempo alinhada; role para ver todos os dias"
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns:
              view === 'month'
                ? 'repeat(7,minmax(100px,1fr))'
                : 'repeat(' + Math.min(days.length, 7) + ',minmax(240px,1fr))',
            minWidth: view === 'month' ? 700 : Math.min(days.length, 7) * 240,
            gap: 1,
          }}
        >
          {data.map((d) => (
            <Paper key={d.key} sx={{ p: 1, borderRadius: 2 }}>
              <Typography
                component="h3"
                variant="subtitle2"
                sx={{
                  textAlign: 'center',
                  height: 48,
                  position: 'relative',
                  minWidth: 0,
                }}
              >
                {d.key}
              </Typography>
              {d.outside && (
                <Typography
                  variant="caption"
                  sx={{
                    position: 'absolute',
                    mt: -3,
                    fontSize: 10,
                    maxWidth: 210,
                    overflowWrap: 'anywhere',
                  }}
                >
                  Fora do mês consultado — sem cobertura
                </Typography>
              )}
              <Box sx={{ height: height + 30, position: 'relative', pl: 6 }}>
                {ticks.map((minute, i) => (
                  <Box
                    key={i}
                    sx={{
                      position: 'absolute',
                      top: 15 + projectMinute(minute, segments),
                      left: 0,
                      right: 0,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        position: 'absolute',
                        left: 0,
                        width: 42,
                        lineHeight: 1,
                        transform: 'translateY(-50%)',
                      }}
                    >
                      {clock(minute)}
                    </Typography>
                    <Box
                      sx={{
                        ml: 6,
                        borderTop: '1px solid',
                        borderColor: 'divider',
                      }}
                    />
                  </Box>
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
                      sx={{
                        position: 'absolute',
                        top: 15 + s.top,
                        left: 48,
                        right: 0,
                        height: s.collapsed ? 32 : 24,
                        minHeight: 0,
                        p: 0,
                        fontSize: 10,
                        zIndex: 2,
                        bgcolor: 'action.hover',
                      }}
                    >
                      … {clock(s.start)}–{clock(s.end)} ·{' '}
                      {(s.end - s.start) / 60}h sem atividades
                    </Button>
                  ))}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 15,
                    left: 48,
                    right: 0,
                    height,
                  }}
                >
                  {d.events.map((e) => {
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
                        title={
                          (e.item.uid ? authorLabel(e.item.uid) + ' · ' : '') +
                          caption
                        }
                      >
                        <Button
                          component={
                            e.item.uid && e.item.uid !== viewerUid
                              ? 'span'
                              : RouterLink
                          }
                          to={
                            e.item.uid && e.item.uid !== viewerUid
                              ? undefined
                              : contextualRecordPath(
                                  returnTo.split('?')[0],
                                  returnTo.includes('?')
                                    ? '?' +
                                        returnTo.split('?').slice(1).join('?')
                                    : '',
                                  e.item.id,
                                )
                          }
                          tabIndex={0}
                          aria-label={
                            (e.item.uid
                              ? authorLabel(e.item.uid) + ' · '
                              : '') + caption
                          }
                          sx={{
                            position: 'absolute',
                            top: projectMinute(e.wallStart, segments),
                            height:
                              projectMinute(e.wallEnd, segments) -
                              projectMinute(e.wallStart, segments),
                            minHeight: 0,
                            left: (e.column / e.columns) * 100 + '%',
                            width: 100 / e.columns + '%',
                            minWidth: 0,
                            p: 0,
                            borderRadius: 0.5,
                            boxSizing: 'border-box',
                            border: '1px solid',
                            borderColor: color(e.item.projectId),
                            borderLeft: '4px solid ' + color(e.item.projectId),
                            bgcolor: 'background.paper',
                            color: 'text.primary',
                            overflow: 'hidden',
                            textAlign: 'left',
                            display: 'block',
                            fontSize: 11,
                            lineHeight: 1.15,
                          }}
                        >
                          {(e.wallEnd - e.wallStart) * px >= 22 ? (
                            <Typography
                              component="span"
                              sx={{
                                display: 'block',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                fontSize: 11,
                                px: 0.5,
                              }}
                            >
                              {e.item.uid
                                ? authorLabel(e.item.uid) + ' · '
                                : ''}
                              {time(e.start)} {label(e.item.projectId)}
                              {e.item.estimated ? ' ◷' : ''}
                              {e.overlap ? ' ⇆' : ''}
                            </Typography>
                          ) : (
                            <Box
                              component="span"
                              aria-hidden="true"
                              sx={{
                                display: 'block',
                                width: '100%',
                                height: '100%',
                                bgcolor: color(e.item.projectId),
                              }}
                            />
                          )}
                        </Button>
                      </Tooltip>
                    );
                  })}
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
