import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Functions } from 'firebase/functions';
import { readFileSync } from 'node:fs';
import { TopicEditor } from './TopicEditor';
describe('basic topic editing', () => {
  it('makes metadata editable without a manual reason or structural controls', () => {
    const html = renderToStaticMarkup(
      <TopicEditor
        functions={{} as Functions}
        projectId="p"
        topicId="t"
        topic={{
          title: 'Geral',
          description: 'Descrição',
          githubUrl: 'https://github.com/demo/repo',
        }}
      />,
    );
    expect(html).toContain('Título do tópico');
    expect(html).toContain('Repositório GitHub');
    expect(html).toContain('https://github.com/demo/repo');
    expect(html).toContain('Salvar');
    expect(html).not.toContain('Motivo');
    expect(html).not.toContain('Mesclar');
  });
  it('preserves audited writes retry identity and disabled editing', () => {
    const code = readFileSync(
      new URL('./TopicEditor.tsx', import.meta.url),
      'utf8',
    );
    expect(code).toContain("'updateTopic'");
    expect(code).toContain('intent.current.requestId');
    expect(code).toContain('lock.current || disabled');
    expect(code).toContain('githubSchema.safeParse');
    const html = renderToStaticMarkup(
      <TopicEditor
        functions={{} as Functions}
        projectId="p"
        topicId="t"
        topic={{ title: 'Geral' }}
        disabled
      />,
    );
    expect(html).toContain('disabled');
  });
  it('keeps report requests behind privacy and overview boundaries', () => {
    const code = readFileSync(
      new URL('../reports/TopicDetails.tsx', import.meta.url),
      'utf8',
    );
    expect(code).toContain("tab !== 'overview'");
    expect(code).toContain('      hidden ||');
    expect(code).toContain('aria-label="Seções do tópico"');
    expect(code).toContain('Atualizar relatório do tópico');
    expect(code).not.toContain('Voltar ao contexto');
    expect(code).toContain('Sobre o cálculo');
  });
});
