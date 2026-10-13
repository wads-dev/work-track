import { expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { CalendarTimeline } from './CalendarTimeline';
import { CalendarHistory } from './CalendarHistory';
import { calendarEventDetails } from './calendar-event-details';
import { TooltipProvider } from '../../components/ui/tooltip';

// Inspect the tooltip body in SSR without Radix's client-only portal. The actual
// timeline/history, tooltip root/trigger, links, details and layout still render.
vi.mock('../../components/ui/tooltip', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/ui/tooltip')>()),
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <aside data-test-tooltip="">{children}</aside>
  ),
}));

const render = ({
  estimated = true,
  minutes = 10,
  uid = 'me',
  history = false,
  hidden = false,
} = {}) => {
  const item = {
    id: 'record',
    uid,
    projectId: 'project',
    estimated,
    effectiveStartedAt: '2026-10-09T12:00:00Z',
    effectiveEndedAt: new Date(
      Date.parse('2026-10-09T12:00:00Z') + minutes * 60000,
    ).toISOString(),
    topics: [{ label: 'Secret topic' }],
  };
  const props = {
    items: [item],
    zone: 'America/Sao_Paulo',
    label: () => (hidden ? 'Projeto reservado' : 'Projeto'),
    color: () => '#123456',
    returnTo: '/calendar?view=week',
    viewerUid: 'me',
    authorLabel: () => 'Ana',
    showPeople: false,
    details: () =>
      calendarEventDetails(
        item,
        { ...item, interpretation: 'Secret summary' },
        { confidential: hidden },
        false,
        'me',
      ),
  };
  return renderToStaticMarkup(
    <MemoryRouter>
      <TooltipProvider>
        {history ? (
          <CalendarHistory
            {...props}
            weeks={['2026-10-05']}
            occurrences={[{ week: '2026-10-05', occurrenceCount: 1 }]}
          />
        ) : (
          <CalendarTimeline {...props} day="2026-10-09" view="day" />
        )}
      </TooltipProvider>
    </MemoryRouter>,
  );
};
const withoutTooltips = (html: string) =>
  html.replace(/<aside data-test-tooltip="">[\s\S]*?<\/aside>/g, '');
const visibleText = (html: string) =>
  withoutTooltips(html).replace(/<[^>]*>/g, '');

it.each(['me', 'other'])(
  'shows exactly one estimate icon beside the time, never as footer text, for %s',
  (uid) => {
    const html = render({ uid });
    expect(visibleText(html)).not.toMatch(/estimad|estimativa|◷/i);
    expect(withoutTooltips(html).match(/<svg /g)).toHaveLength(1);
    expect(html).toMatch(
      /inline-flex items-center gap-1"><span>09:00 – 09:10<\/span><svg [^>]*aria-hidden="true"/,
    );
    expect(html).toContain(
      'aria-label="Projeto · 09:00 — 09:10 · 10 min · Estimado"',
    );
    expect(html).toContain('Secret topic · Secret summary');
    expect(html).toContain('min-height:1.125rem;height:1.125rem');
    expect(html).toContain('hover:!h-auto');
    expect(html).toContain('focus-visible:!h-auto');
    if (uid === 'me')
      expect(html).toContain('href="/calendar?view=week&amp;record=record"');
    else expect(html).not.toContain('href=');
  },
);

it('does not mark closed actual intervals as estimated', () => {
  const html = render({ estimated: false });
  expect(html).not.toContain('<svg ');
  expect(html).not.toContain('Estimado');
  expect(html).toContain('min-height:1.125rem;height:1.125rem');
});

it.each(['me', 'other'])(
  'keeps zero-duration markers reachable and icon-only for %s',
  (uid) => {
    const html = render({ uid, minutes: 0 });
    expect(visibleText(html)).not.toMatch(/estimad|estimativa|◷/i);
    expect(visibleText(html)).toContain('Sem duração');
    expect(withoutTooltips(html).match(/<svg /g)).toHaveLength(1);
    expect(html).toMatch(
      /inline-flex items-center gap-1"><span>09:00 – 09:00<\/span><svg /,
    );
    expect(html).toContain(
      'aria-label="09:00 · Projeto · Estimado · sem duração"',
    );
    expect(html).toContain(
      'title="09:00 · Projeto · Estimado · sem duração · Secret topic · Secret summary"',
    );
    if (uid === 'me')
      expect(html).toContain('href="/calendar?view=week&amp;record=record"');
    else expect(html).toContain('tabindex="0"');
  },
);

it('inherits the icon-only indicator in paginated calendar history', () => {
  const html = render({ history: true });
  expect(visibleText(html)).not.toMatch(/estimad|estimativa|◷/i);
  expect(withoutTooltips(html).match(/<svg /g)).toHaveLength(1);
  expect(html).toContain('min-height:1.125rem;height:1.125rem');
  expect(html).toContain(' · Estimado');
});

it.each([0, 10])(
  'does not expose hidden details through the indicator, aria or tooltip (%s minutes)',
  (minutes) => {
    const html = render({ hidden: true, minutes });
    expect(html).not.toContain('Secret topic');
    expect(html).not.toContain('Secret summary');
    expect(html).toContain('Tópicos reservados');
    expect(html).toContain('Conteúdo oculto.');
    expect(visibleText(html)).not.toMatch(/estimad|estimativa|◷/i);
    expect(withoutTooltips(html).match(/<svg /g)).toHaveLength(1);
  },
);
