import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { Functions } from 'firebase/functions';
import { readFileSync } from 'node:fs';
import { ProjectTopics } from './ProjectTopics';

describe('project topics are read-only metadata', () => {
  it('receives embedded-topic repository selection and keeps archived topics visible', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ProjectTopics
          functions={{} as Functions}
          projectId="p"
          project={{
            type: 'work',
            createdBy: 'me',
            archived: false,
            confidential: false,
            topics: [
              { id: 'archived', title: 'Archived history', archived: true },
              {
                id: 'alias',
                title: 'Alias hidden',
                archived: false,
                mergedIntoTopicId: 'archived',
              },
            ],
          }}
        />
      </MemoryRouter>,
    );
    expect(html).toContain('Archived history');
    expect(html).not.toContain('Alias hidden');
    const source = readFileSync(
      new URL('./ProjectTopics.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('selectProjectTopics(project)');
    expect(source).not.toMatch(/\.(filter|slice|find)\(/);
  });
  it('renders a compact list with safe GitHub links and no structural actions', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ProjectTopics
          functions={{} as Functions}
          projectId="p"
          project={{
            type: 'work',
            createdBy: 'me',
            archived: false,
            confidential: false,
            topics: [
              {
                id: 'a',
                title: 'Arquitetura',
                archived: false,
                githubUrl: 'https://github.com/demo/architecture',
              },
              {
                id: 'b',
                title: 'Entrega',
                archived: false,
                githubUrl: 'javascript:alert(1)',
              },
              {
                id: 'c',
                title: 'Mesclado',
                archived: false,
                mergedIntoTopicId: 'a',
              },
            ],
          }}
        />
      </MemoryRouter>,
    );
    expect(html.match(/<li /g)).toHaveLength(2);
    expect(html).toContain('/projects/p/topics/a');
    expect(html).toContain('https://github.com/demo/architecture');
    expect(html).toContain('noopener noreferrer');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('Mesclado');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<input');
  });
  it('keeps audited basic saves direct and complex operations out of the editor', () => {
    const editor = readFileSync(
      new URL('./ProjectEditor.tsx', import.meta.url),
      'utf8',
    );
    expect(editor).toContain("'updateProject'");
    expect(editor).toContain('saveIntent.current.requestId');
    expect(editor).toContain('lock.current = true');
    expect(editor).toContain('project.archived === true');
    expect(editor).toContain('md:grid-cols-2');
    expect(editor).not.toContain('mergeProjects');
    expect(editor).not.toContain('Conferir prévia');
    expect(editor).not.toContain('setReason');
    const access = readFileSync(
      new URL('./ProjectAccess.tsx', import.meta.url),
      'utf8',
    );
    expect(access).toContain('scopeConfirmation(intent, checkedPreview!, ack)');
    expect(access).not.toContain('Conferir prévia');
    expect(access).not.toContain('setReason');
    expect(access).toContain('Entendo e autorizo compartilhar');
  });
});
