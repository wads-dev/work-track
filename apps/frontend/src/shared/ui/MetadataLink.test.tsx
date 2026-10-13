import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { MetadataLink, metadataNavigation } from './MetadataLink';

const project = {
  title: 'Current project',
  topics: [
    { id: 'existing', title: 'Obsolete topic', mergedIntoTopicId: 'current' },
    { id: 'current', title: 'Canonical topic' },
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
    const html = render(project, false, 'existing');
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
    expect(render(hidden, true, 'existing')).toContain('Canonical topic');
  });

  it('stays neutral when the selected parent disappears or merge target is unavailable', () => {
    for (const revealed of [false, true]) {
      expect(render(undefined, revealed, 'existing')).not.toContain('href=');
      expect(metadataNavigation('p', project, revealed, 'missing')).toEqual({
        label: 'Tópico indisponível',
      });
    }
    expect(
      metadataNavigation(
        'p',
        { topics: [{ id: 'existing', mergedIntoTopicId: 'missing' }] },
        true,
        'existing',
      ),
    ).toEqual({ label: 'Tópico indisponível' });
  });
});
