import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { CalendarHistory } from './CalendarHistory';
import { hours } from './report-chart';
const renders = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock('./CalendarTimeline', () => ({
  CalendarTimeline: ({ items, day }: { items: unknown[]; day: string }) => {
    renders.items.push(items);
    return (
      <p data-timeline-week={day}>{items.length} complete report intervals</p>
    );
  },
}));
const weeks = Array.from({ length: 9 }, (_, index) =>
  new Date(Date.UTC(2026, 0, 5 + index * 7)).toISOString().slice(0, 10),
);
const items = [
  {
    id: 'long',
    projectId: 'p',
    effectiveStartedAt: '2026-01-05T00:00:00Z',
    effectiveEndedAt: '2026-03-09T00:00:00Z',
    estimated: false,
  },
  {
    id: 'open',
    projectId: 'p',
    effectiveStartedAt: '2026-03-02T08:00:00Z',
    effectiveEndedAt: '2026-03-02T14:00:00Z',
    estimated: true,
  },
];
const props = {
  items,
  weeks,
  occurrences: weeks.map((week, index) => ({
    week,
    occurrenceCount: index + 1,
  })),
  zone: 'UTC',
  label: () => 'Project',
  color: () => '#000',
  returnTo: '/calendar',
  viewerUid: 'me',
  authorLabel: () => 'Me',
};
it('renders four occupied weeks per repository viewport and forwards all report intervals unchanged', () => {
  for (const [page, expected] of [
    [0, 4],
    [1, 4],
    [2, 1],
  ] as const) {
    renders.items.splice(0);
    const report = {
      totalMinutes: 960,
      closedMinutes: 600,
      estimatedMinutes: 360,
    };
    const before = structuredClone(report);
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/calendar?historyPage=' + page]}>
        <p>
          {hours(report.totalMinutes)} total · {hours(report.estimatedMinutes)}{' '}
          estimadas
        </p>
        <CalendarHistory {...props} />
      </MemoryRouter>,
    );
    expect(html.match(/data-timeline-week=/g)).toHaveLength(expected);
    expect(html).toContain('9 semanas');
    expect(html).toContain('16 h total');
    expect(html).toContain('6 h estimadas');
    expect(html).toContain('totais abrangem todo o histórico autorizado');
    expect(renders.items).toHaveLength(expected);
    expect(renders.items.every((value) => value === items)).toBe(true);
    expect(report).toEqual(before);
  }
});
it('clamps URL pages and preserves actual per-week occurrence counts', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={['/calendar?historyPage=999']}>
      <CalendarHistory {...props} />
    </MemoryRouter>,
  );
  expect(html).toContain('página 3 de 3');
  expect(html).toContain('9 registros iniciados nesta semana');
  expect(html).not.toContain('data-timeline-week="2026-01-05"');
});
it('renders empty state without inventing weeks', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <CalendarHistory {...props} weeks={[]} occurrences={[]} />
    </MemoryRouter>,
  );
  expect(html).toContain('Nenhuma semana com atividade');
  expect(html).not.toContain('data-timeline-week');
});
it('delegates computed pagination without business filters or slicing in the view', () => {
  const source = readFileSync(
    new URL('./CalendarHistory.tsx', import.meta.url),
    'utf8',
  );
  expect(source).toContain('selectCalendarHistoryPage(');
  expect(source).not.toMatch(/\.(filter|slice|find)\(/);
});
