import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { TopicReport, topicBucketKey } from './TopicReport';
import { topicBuckets, type ReportTopic } from './topic-report-model';
import { PrivacyContext } from '../../shared/ui/privacy';
vi.mock('./InteractiveChart', () => ({
  InteractiveChart: ({
    title,
    data,
  }: {
    title: string;
    data: {
      key: string;
      label: string;
      minutes: number;
      uid?: string;
      href?: string;
    }[];
  }) => (
    <section aria-label={title}>
      {data.map((item) => (
        <p key={item.key} data-person-uid={item.uid}>
          {item.label} {item.minutes}
          {item.href && <a href={item.href}>Person route</a>}
        </p>
      ))}
    </section>
  ),
}));
const topics: ReportTopic[] = [
  {
    projectId: 'p',
    topicId: 'same',
    label: 'Secret topic',
    minutes: 120,
    byUser: [
      { uid: 'me', label: 'My identity', minutes: 90 },
      { uid: 'other', label: 'Other identity', minutes: 30 },
    ],
  },
  {
    projectId: 'q',
    topicId: 'same',
    label: 'Public topic',
    minutes: 60,
    byUser: [],
  },
];
it('selects project-qualified bucket via repository without changing unassigned totals', () => {
  const buckets = topicBuckets(topics, (id) => ({ title: id }), true);
  const html = renderToStaticMarkup(
    <MemoryRouter
      initialEntries={[
        '/reports?topic=' + encodeURIComponent(topicBucketKey(buckets[1])),
      ]}
    >
      <TopicReport buckets={buckets} unassignedMinutes={45} />
    </MemoryRouter>,
  );
  expect(html).toContain('Public topic');
  expect(html).not.toContain('Secret topic');
  expect(html).toContain('Não distribuído: 0,75 h');
  expect(buckets.map((bucket) => bucket.minutes)).toEqual([120, 60]);
});
it('shows people identity and profile navigation even when project and topic content are concealed', () => {
  const buckets = topicBuckets(
    [topics[0]],
    () => ({ title: 'Secret project', confidential: true }),
    false,
  );
  const html = renderToStaticMarkup(
    <PrivacyContext value={{ revealed: false }}>
      <MemoryRouter
        initialEntries={[
          '/reports?topic=' + encodeURIComponent(topicBucketKey(buckets[0])),
        ]}
      >
        <TopicReport buckets={buckets} />
      </MemoryRouter>
    </PrivacyContext>,
  );
  expect(html).toContain('Projeto reservado');
  expect(html).toContain('Tópico reservado');
  expect(html).not.toContain('Secret');
  expect(html).toContain('My identity');
  expect(html).toContain('Other identity');
  expect(html).toContain('data-person-uid="other"');
  expect(html).toContain('/people/other');
  expect(html).not.toContain('/projects/p/topics/same');
});
it('personal defensive byUser validation excludes foreign identities without changing allocation', () => {
  const buckets = topicBuckets(
    [topics[0]],
    () => ({ title: 'Project' }),
    false,
    'me',
  );
  const html = renderToStaticMarkup(
    <MemoryRouter
      initialEntries={[
        '/reports?topic=' + encodeURIComponent(topicBucketKey(buckets[0])),
      ]}
    >
      <TopicReport buckets={buckets} personal />
    </MemoryRouter>,
  );
  expect(html).toContain('Meu tempo neste tópico');
  expect(html).toContain('data-person-uid="me"');
  expect(html).not.toContain('Other identity');
  expect(html).not.toContain('/people/other');
  expect(html).toContain('2 h');
  expect(buckets[0].minutes).toBe(120);
});
it('ignores invalid selected bucket URL while retaining all complete allocations', () => {
  const buckets = topicBuckets(topics, (id) => ({ title: id }), true);
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={['/reports?topic=malformed']}>
      <TopicReport buckets={buckets} />
    </MemoryRouter>,
  );
  expect(html).toContain('Secret topic');
  expect(html).toContain('Public topic');
});
it('delegates selection without business filters and never privacy-gates people identity', () => {
  const source = readFileSync(
    new URL('./TopicReport.tsx', import.meta.url),
    'utf8',
  );
  expect(source).toMatch(
    /selectTopicReportBuckets\(\s*buckets,\s*selected,?\s*\)/,
  );
  expect(source).not.toMatch(/\.(filter|slice|find)\(/);
  expect(source).not.toContain('active.detailsAvailable ? person.uid');
});
