import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { PrivacyContext } from '../../shared/ui/privacy';
import { metadataNavigation } from '../../shared/ui/MetadataLink';
import { InteractiveChart, type ChartDatum } from './InteractiveChart';

const directory = vi.hoisted(() => {
  const person = {
    uid: 'ana-id',
    displayName: 'Ana Silva',
    email: 'ana@wads.dev',
    photoURL: 'https://example.org/ana.jpg',
  };
  return {
    loading: false,
    name: (uid: string) =>
      uid === person.uid ? person.displayName : undefined,
    person: (uid: string) => (uid === person.uid ? person : undefined),
  };
});
vi.mock('../people/CompanyPeopleContext', () => ({
  useCompanyPeople: () => directory,
}));
// Expose the data passed into the chart and render its tooltip/tick so we test
// identity in all three presentations without needing a browser resize observer.
vi.mock('recharts', () => {
  let data: ChartDatum[] = [];
  const Group = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: Group,
    Bar: Group,
    PieChart: Group,
    Cell: () => null,
    CartesianGrid: () => null,
    XAxis: () => null,
    BarChart: ({
      children,
      data: values,
    }: {
      children: ReactNode;
      data: ChartDatum[];
    }) => {
      data = values;
      return <div data-chart={JSON.stringify(values)}>{children}</div>;
    },
    Pie: ({
      children,
      data: values,
    }: {
      children: ReactNode;
      data: ChartDatum[];
    }) => {
      data = values;
      return <div data-chart={JSON.stringify(values)}>{children}</div>;
    },
    Tooltip: ({ content }: { content: (props: unknown) => ReactNode }) => (
      <div data-tooltip>
        {content({ active: true, payload: [{ payload: data[0] }] })}
      </div>
    ),
    YAxis: ({ tick }: { tick: unknown }) => (
      <svg data-axis>
        {typeof tick === 'function' ? tick({ x: 40, y: 30, index: 0 }) : null}
      </svg>
    ),
  };
});
const render = (
  data: ChartDatum[],
  revealed = false,
  variant: 'bar' | 'pie' = 'bar',
) =>
  renderToStaticMarkup(
    <PrivacyContext.Provider value={{ revealed }}>
      <MemoryRouter>
        <InteractiveChart title="Distribution" data={data} variant={variant} />
      </MemoryRouter>
    </PrivacyContext.Provider>,
  );
const person: ChartDatum = {
  key: 'ana-id',
  kind: 'person',
  uid: 'ana-id',
  label: 'Masked before',
  minutes: 60,
  href: '/people/ana-id?date=2026-10-01',
};

describe('chart person identities are never confidential', () => {
  it('keeps names photos IDs profile navigation tooltip and avatar-only axis visible in both privacy modes', () => {
    const hidden = render([person]);
    expect(hidden).toBe(render([person], true));
    for (const value of [
      'Ana Silva',
      'ana-id',
      'https://example.org/ana.jpg',
      'href="/people/ana-id?date=2026-10-01"',
      'data-tooltip',
      'data-axis',
      'sr-only',
      'Distribution — valores e navegação',
    ])
      expect(hidden).toContain(value);
    expect(hidden).not.toContain('Masked before');
    expect(hidden).toContain('da distribuição');
  });

  it('supports existing caller person UID and neutral missing-directory identity in both modes', () => {
    const data = [
      { ...person, kind: undefined },
      {
        key: 'missing',
        kind: 'person' as const,
        uid: 'missing',
        label: 'not a directory identity',
        minutes: 30,
      },
    ];
    expect(render(data)).toBe(render(data, true));
    expect(render(data)).toContain('Pessoa da empresa');
    expect(render(data)).not.toContain('not a directory identity');
  });

  it('preserves caller masking and link suppression for private projects/topics beside visible people', () => {
    const project = {
      title: 'Secret project',
      confidential: true,
      topics: [{ id: 'secret-topic', title: 'Secret topic' }],
    };
    const projectMetadata = metadataNavigation('private', project, false);
    const topicMetadata = metadataNavigation(
      'private',
      project,
      false,
      'secret-topic',
    );
    const data = [
      person,
      {
        key: 'private',
        kind: 'project' as const,
        label: projectMetadata.label,
        href: projectMetadata.path,
        minutes: 30,
      },
      {
        key: 'private-topic',
        kind: 'topic' as const,
        label: topicMetadata.label,
        href: topicMetadata.path,
        minutes: 15,
      },
    ];
    const hidden = render(data);
    expect(hidden).toContain('Ana Silva');
    expect(hidden).toContain('Projeto reservado');
    expect(hidden).toContain('Tópico reservado');
    expect(hidden).not.toContain('Secret');
    expect(hidden).not.toContain('/projects/private');
    expect(hidden).not.toContain('secret-topic');
  });

  it('never relabels topic/project data as a person merely because a contextual UID exists', () => {
    const html = render([
      { ...person, kind: 'topic', label: 'Tópico reservado', href: undefined },
    ]);
    expect(html).toContain('Tópico reservado');
    expect(html).not.toContain('Ana Silva');
    expect(html).not.toContain('https://example.org/ana.jpg');
  });

  it('keeps amount validation and accessible pie navigation without exposing invalid activity', () => {
    expect(render([{ ...person, minutes: NaN }])).toContain(
      'Nenhum tempo disponível nesta seleção.',
    );
    const html = render(
      [person, { key: 'invalid', label: 'Invalid', minutes: -1 }],
      false,
      'pie',
    );
    expect(html).toContain('Ana Silva');
    expect(html).toContain('href="/people/ana-id?date=2026-10-01"');
    expect(html).not.toContain('Invalid');
  });
});
