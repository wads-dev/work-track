import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { MetadataLink, metadataNavigation } from './MetadataLink';

const project = {
  createdBy: 'me',
  type: 'work',
  archived: false,
  confidential: false,
  title: 'Current project',
  topics: [
    {
      id: 'existing',
      title: 'Obsolete topic',
      archived: true,
      mergedIntoTopicId: 'current',
    },
    { id: 'current', title: 'Canonical topic', archived: false },
  ],
};
const render = (
  data: Record<string, unknown> | undefined,
  revealed: boolean,
  topicId?: string,
) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/records?project=p&fromDate=2026-10-01']}>
      <MetadataLink
        projectId="p"
        project={data}
        revealed={revealed}
        topicId={topicId}
      />
    </MemoryRouter>,
  );

describe('metadata presentation links', () => {
  it('renders canonical topic links with design-system classes and full return context', () => {
    const html = render(project, false, 'current');
    expect(html).toContain('Canonical topic');
    expect(html).not.toContain('Obsolete topic');
    expect(html).toContain(
      'href="/projects/p/topics/current?returnTo=%2Frecords%3Fproject%3Dp%26fromDate%3D2026-10-01"',
    );
    expect(html).toContain('text-primary underline-offset-4 hover:underline');
    expect(html).toContain('[overflow-wrap:anywhere]');
  });

  it('never emits confidential label, topic identity or navigation until revealed', () => {
    const hidden = { ...project, confidential: true };
    for (const topicId of [undefined, 'existing']) {
      const html = render(hidden, false, topicId);
      expect(html).toContain(
        topicId ? 'Tópico reservado' : 'Projeto reservado',
      );
      expect(html).not.toContain('href=');
      expect(html).not.toContain('Current project');
      expect(html).not.toContain('Canonical topic');
      expect(html).not.toContain('existing');
    }
    expect(render(hidden, true, 'current')).toContain('Canonical topic');
    expect(render(hidden, true, 'existing')).toContain('Tópico indisponível');
  });

  it('stays neutral for missing parents or topics and rejects aliases even with an available target', () => {
    for (const revealed of [false, true]) {
      expect(render(undefined, revealed, 'existing')).not.toContain('href=');
      const alias = render(project, revealed, 'existing');
      expect(alias).toContain('Tópico indisponível');
      expect(alias).not.toContain('href=');
      expect(alias).not.toContain('Canonical topic');
      expect(metadataNavigation('p', project, revealed, 'missing')).toEqual({
        label: 'Tópico indisponível',
      });
    }
    expect(
      metadataNavigation(
        'p',
        {
          ...project,
          topics: [
            { id: 'existing', archived: true, mergedIntoTopicId: 'missing' },
          ],
        },
        true,
        'existing',
      ),
    ).toEqual({ label: 'Tópico indisponível' });
  });
});
