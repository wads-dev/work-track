import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Alert, AlertTitle, AlertDescription } from './alert';
it('does not put direct text into a zero-width grid column', () => {
  const html = renderToStaticMarkup(
    <Alert>Nenhum dado disponível em projetos.</Alert>,
  );
  expect(html).not.toContain('grid-cols-[0_1fr]');
  expect(html).toContain('relative block');
  expect(html).toContain('Nenhum dado disponível em projetos.');
});
it('keeps structured and icon alerts supported', () => {
  const html = renderToStaticMarkup(
    <Alert>
      <svg />
      <AlertTitle>Aviso</AlertTitle>
      <AlertDescription>Texto completo</AlertDescription>
    </Alert>,
  );
  expect(html).toContain('has-[&gt;svg]:grid');
  expect(html).toContain('data-slot="alert-description"');
});
