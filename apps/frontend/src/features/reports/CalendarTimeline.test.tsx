import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { PrivacyContext } from '../../shared/ui/privacy';
import { CalendarTimeline } from './CalendarTimeline';
import { TooltipProvider } from '../../components/ui/tooltip';

const render = (showPeople: boolean, revealed: boolean, minutes = 60) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <TooltipProvider>
        <PrivacyContext.Provider value={{ revealed }}>
          <CalendarTimeline
            items={[
              {
                id: 'record',
                uid: 'other',
                projectId: 'project',
                effectiveStartedAt: '2026-10-09T12:00:00Z',
                effectiveEndedAt: new Date(
                  Date.parse('2026-10-09T12:00:00Z') + minutes * 60000,
                ).toISOString(),
                estimated: false,
              },
            ]}
            day="2026-10-09"
            view="day"
            zone="America/Sao_Paulo"
            label={() => 'Projeto reservado'}
            color={() => '#123456'}
            returnTo="/calendar"
            viewerUid="me"
            authorLabel={() => 'Ana Silva'}
            showPeople={showPeople}
            details={() => ({
              topics: 'Entrega',
              summary: 'Corrigir navegação',
            })}
          />
        </PrivacyContext.Provider>
      </TooltipProvider>
    </MemoryRouter>,
  );

it('omits repeated identity for a single selected person', () => {
  const html = render(false, true);
  expect(html).not.toContain('Ana Silva');
  expect(html).toContain('Projeto reservado');
  expect(html).toContain('09:00');
  expect(html).toContain('10:00');
  expect(html).toContain('Entrega');
  expect(html).not.toContain('Corrigir navegação');
  expect(html).not.toContain('min-height:22px');
  expect(html).toContain('hover:!h-auto');
  expect(html).toContain('focus-visible:!h-auto');
  expect(html).toContain('hover:z-40');
  expect(html).toContain('min-height:6.75rem');
  expect(html).toContain('height:6.75rem');
  expect(html).not.toContain('text-[11px]');
});

it('keeps short activities only in the timeline with hover expansion', () => {
  const html = render(false, true, 10);
  expect(html).not.toContain('Atividades curtas');
  expect(html).not.toContain('Detalhes das atividades curtas');
  expect(html).toContain('09:10');
  expect(html).toContain('hover:!h-auto');
  expect(html).toContain('focus-visible:!h-auto');
  expect(html).toContain('min-height:1.125rem');
});

it.each([
  { view: 'day' as const, days: 1 },
  { view: 'three-days' as const, days: 3 },
  { view: 'week' as const, days: 7 },
  { view: 'month' as const, days: 42 },
])(
  'renders idle margins and aligns cards with the ruler in $view',
  ({ view, days }) => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <TooltipProvider>
          <CalendarTimeline
            items={[
              {
                id: 'early',
                effectiveStartedAt: '2026-10-09T04:40:00Z',
                effectiveEndedAt: '2026-10-09T05:00:00Z',
              },
              {
                id: 'short',
                effectiveStartedAt: '2026-10-09T09:37:00Z',
                effectiveEndedAt: '2026-10-09T10:09:00Z',
              },
              {
                id: 'later',
                effectiveStartedAt: '2026-10-09T15:00:00Z',
                effectiveEndedAt: '2026-10-09T16:00:00Z',
              },
            ].map((item) => ({
              ...item,
              projectId: 'project',
              estimated: false,
            }))}
            day="2026-10-09"
            view={view}
            zone="America/Sao_Paulo"
            label={() => 'Projeto'}
            color={() => '#123456'}
            returnTo="/calendar"
            viewerUid="me"
            authorLabel={() => 'Ana Silva'}
            showPeople={false}
          />
        </TooltipProvider>
      </MemoryRouter>,
    );
    const buttons = html
      .split('<button')
      .slice(1)
      .map((part) => part.split('</button>')[0]);
    expect(buttons).toHaveLength(days * 2);
    const columns = Math.min(days, 7);
    expect(html).toContain(
      'grid-template-columns:repeat(' +
        columns +
        ',minmax(15rem,1fr));min-width:' +
        columns * 15 +
        'rem',
    );
    // The full-height event layer must let pointer events reach idle controls,
    // while each activity remains clickable.
    expect(html).toContain(
      'pointer-events-none absolute top-[0.9375rem] left-12 right-0',
    );
    expect(html).toContain('pointer-events-auto absolute min-h-0');
    for (let i = 0; i < buttons.length; i += 2) {
      expect(buttons[i]).toContain('top:8.1875rem;height:2rem');
      expect(buttons[i + 1]).toContain('top:14.7875rem;height:2rem');
    }
    expect(buttons[0]).toContain('aria-expanded="false"');
    expect(buttons[0]).toContain('top:8.1875rem;height:2rem');
    expect(buttons[0]).toContain(
      '<span>… 02:00–06:37</span><span>4h 37min sem atividades</span>',
    );
    expect(buttons[1]).toContain('top:14.7875rem;height:2rem');
    // Short card: top = 108px of activity + a 48px collapsed band; no duration inflation.
    const shortCardStyle = html.match(
      /aria-label="Projeto · 06:37 — 07:09 · 32 min" style="([^"]+)"/,
    )?.[1];
    expect(shortCardStyle).toBeDefined();
    const numericStyle = Object.fromEntries(
      shortCardStyle!.split(';').map((rule) => {
        const [key, value] = rule.split(':');
        return [key, Number.parseFloat(value)];
      }),
    );
    expect(numericStyle.top).toBe(156 / 16);
    expect(numericStyle.height).toBeCloseTo(57.6 / 16);
    expect(numericStyle['min-height']).toBeCloseTo(57.6 / 16);
    // 12:00 ruler: two 48px bands plus the original activity durations.
    expect(html).toContain('top:17.2875rem');
  },
);

it('keeps events and people in confidentiality mode for multiple people', () => {
  expect(render(true, false)).toBe(render(true, true));
  expect(render(true, false)).toContain('Ana Silva');
});
