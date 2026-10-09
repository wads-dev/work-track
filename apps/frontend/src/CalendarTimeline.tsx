import { Box, Button, Paper, Tooltip, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { addDays, calendarDays, midnight, type View } from './calendar-utils';
import { layoutDay, type Timed } from './timeline-layout';
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
  const days = calendarDays(day, view);
  const pxPerHour = 64;
  const time = (instant: number) =>
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'shortOffset',
    }).format(new Date(instant));
  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Eixo temporal no fuso {zone}. Altura proporcional ao intervalo; eventos
        muito curtos têm mínimo visual de 24 px para leitura, sem alterar
        duração. Sobreposições ficam em colunas. Em dias de horário de verão,
        horas repetidas/suprimidas seguem o instante real.
      </Typography>
      <Box
        sx={{ overflowX: 'auto' }}
        tabIndex={0}
        aria-label="Linha do tempo; role horizontalmente para ver todos os dias"
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(' + days.length + ',minmax(210px,1fr))',
            minWidth: days.length * 210,
            gap: 1,
          }}
        >
          {days.map((key) => {
            const start = Date.parse(midnight(key, zone)),
              end = Date.parse(midnight(addDays(key, 1), zone));
            const height = ((end - start) / 3600000) * pxPerHour;
            const events = layoutDay(items, start, end);
            return (
              <Paper key={key} sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <Typography
                  component="h3"
                  variant="subtitle2"
                  sx={{ p: 1, textAlign: 'center' }}
                >
                  {key}
                </Typography>
                <Box sx={{ height, position: 'relative', ml: 8, mr: 1 }}>
                  {Array.from(
                    { length: Math.ceil((end - start) / 3600000) + 1 },
                    (_, i) => (
                      <Box
                        key={i}
                        sx={{
                          position: 'absolute',
                          top: i * pxPerHour,
                          left: 0,
                          right: 0,
                          borderTop: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            position: 'absolute',
                            right: '100%',
                            pr: 1,
                            whiteSpace: 'nowrap',
                            transform: 'translateY(-50%)',
                          }}
                        >
                          {time(Math.min(end, start + i * 3600000))}
                        </Typography>
                      </Box>
                    ),
                  )}
                  {events.map((event) => {
                    const caption =
                      label(event.item.projectId) +
                      ' · ' +
                      time(event.start) +
                      ' — ' +
                      time(event.end) +
                      (event.item.estimated ? ' · Estimado' : '') +
                      (event.overlap ? ' · Sobreposição' : '');
                    return (
                      <Tooltip key={event.item.id} title={caption}>
                        <Button
                          component={RouterLink}
                          to={
                            '/records/' +
                            encodeURIComponent(event.item.id) +
                            '?returnTo=' +
                            encodeURIComponent(returnTo)
                          }
                          aria-label={caption}
                          sx={{
                            position: 'absolute',
                            top: event.top * height,
                            height: Math.max(event.height * height, 24),
                            minHeight: 24,
                            left: (event.column / event.columns) * 100 + '%',
                            width: 100 / event.columns + '%',
                            minWidth: 0,
                            p: 0.5,
                            border: '1px solid',
                            borderColor: color(event.item.projectId),
                            borderLeft:
                              '4px solid ' + color(event.item.projectId),
                            bgcolor: 'background.paper',
                            color: 'text.primary',
                            overflow: 'hidden',
                            display: 'block',
                            textAlign: 'left',
                            zIndex: 1,
                            fontSize: 11,
                            lineHeight: 1.15,
                          }}
                        >
                          {caption}
                        </Button>
                      </Tooltip>
                    );
                  })}
                </Box>
              </Paper>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
