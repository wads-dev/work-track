import { Alert, Box, Button, Paper, Tooltip, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import {
  addDays,
  calendarDays,
  midnight,
  range,
  type View,
} from './calendar-utils';
import { commonSpan, layoutDay, type Timed } from './timeline-layout';
type Event = Timed & { projectId: string; estimated: boolean };
export function CalendarTimeline({
  items,
  day,
  view,
  zone,
  label,
  color,
  returnTo,
}: {
  items: Event[];
  day: string;
  view: View;
  zone: string;
  label: (id: string) => string;
  color: (id: string) => string;
  returnTo: string;
}) {
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
  const height = (span.last - span.first) * px;
  const clock = (m: number) =>
    String(Math.floor(m / 60)).padStart(2, '0') +
    ':' +
    String(m % 60).padStart(2, '0');
  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Intervalo horário comum de {clock(span.first)} a {clock(span.last)}.
        Altura proporcional à duração real. Eventos curtos são marcadores com
        detalhes na lista abaixo. Sobreposições em colunas.
      </Typography>
      <Box
        sx={{ overflowX: 'auto', p: 1 }}
        tabIndex={0}
        aria-label="Linha do tempo alinhada; role para ver todos os dias"
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(' + Math.min(days.length, 7) + ',minmax(240px,1fr))',
            minWidth: Math.min(days.length, 7) * 240,
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
                {Array.from(
                  { length: (span.last - span.first) / 60 + 1 },
                  (_, i) => (
                    <Box
                      key={i}
                      sx={{
                        position: 'absolute',
                        top: 15 + i * 60 * px,
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
                        {clock(span.first + i * 60)}
                      </Typography>
                      <Box
                        sx={{
                          ml: 6,
                          borderTop: '1px solid',
                          borderColor: 'divider',
                        }}
                      />
                    </Box>
                  ),
                )}
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
                      <Tooltip key={e.item.id} title={caption}>
                        <Button
                          component={RouterLink}
                          to={
                            '/records/' +
                            encodeURIComponent(e.item.id) +
                            '?returnTo=' +
                            encodeURIComponent(returnTo)
                          }
                          aria-label={caption}
                          sx={{
                            position: 'absolute',
                            top: Math.max(0, (e.wallStart - span.first) * px),
                            height: (e.wallEnd - e.wallStart) * px,
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
              {d.events.length > 0 && (
                <Box
                  component="ul"
                  aria-label="Lista legível de intervalos"
                  sx={{
                    m: 0,
                    pl: 2,
                    mt: 1,
                    '& li': { overflowWrap: 'anywhere', fontSize: 11 },
                  }}
                >
                  {d.events.map((e) => (
                    <li key={e.item.id}>
                      <Button
                        component={RouterLink}
                        to={
                          '/records/' +
                          encodeURIComponent(e.item.id) +
                          '?returnTo=' +
                          encodeURIComponent(returnTo)
                        }
                        sx={{
                          fontSize: 11,
                          p: 0.25,
                          minWidth: 0,
                          textAlign: 'left',
                          display: 'block',
                        }}
                      >
                        {time(e.start)}–{time(e.end)} {label(e.item.projectId)}{' '}
                        {e.item.estimated ? '◷' : ''}
                        {e.overlap ? '⇆' : ''}
                      </Button>
                    </li>
                  ))}
                </Box>
              )}
            </Paper>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
