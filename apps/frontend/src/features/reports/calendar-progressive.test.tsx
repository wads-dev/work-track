import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CalendarDayProgress } from './CalendarDayProgress';
import { calendarDuration } from './calendar-duration';
it('uses indeterminate progress without disclosing a fake computed zero', () => {
  const html = renderToStaticMarkup(
    <CalendarDayProgress
      day="2026-11-11"
      progress={[
        {
          projectId: 'p',
          expected: 8,
          dailyHours: 8,
          delivered: 0,
          calculationPending: true,
        },
      ]}
      label={() => 'Projeto'}
      color={() => '#123456'}
    />,
  );
  expect(html).toContain('calculando horas');
  expect(html).toContain('animate-pulse');
  expect(html).not.toContain('0.0h');
  expect(
    calendarDuration({
      effectiveStartedAt: '2026-11-11T12:00:00Z',
      effectiveEndedAt: '2026-11-11T15:00:00Z',
      loggedMinutes: 180,
      minutes: 0,
      calculationPending: true,
    }),
  ).toBe('… (registrado: 3h)');
});
