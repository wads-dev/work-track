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
  expect(html).toContain('min-height:108px');
  expect(html).toContain('height:108px');
  expect(html).not.toContain('text-[11px]');
});

it('keeps short activities only in the timeline with hover expansion', () => {
  const html = render(false, true, 10);
  expect(html).not.toContain('Atividades curtas');
  expect(html).not.toContain('Detalhes das atividades curtas');
  expect(html).toContain('09:10');
  expect(html).toContain('hover:!h-auto');
  expect(html).toContain('focus-visible:!h-auto');
  expect(html).toContain('min-height:18px');
});

it('keeps events and people in confidentiality mode for multiple people', () => {
  expect(render(true, false)).toBe(render(true, true));
  expect(render(true, false)).toContain('Ana Silva');
});
