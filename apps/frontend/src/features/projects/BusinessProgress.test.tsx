import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProgressBar } from './BusinessProgress';
it('renders expected target and person percentages relative to monthly total', () => {
  const html = renderToStaticMarkup(
    <ProgressBar
      value={{
        month: '2026-11',
        total: 100,
        expected: 40,
        delivered: 20,
        people: [
          { uid: 'a', label: 'Alice', hours: 8 },
          { uid: 'b', label: 'Bob', hours: 12 },
        ],
      }}
    />,
  );
  expect(html).toContain('Alice: 8h · 8% do total do mês');
  expect(html).toContain('Bob: 12h · 12% do total do mês');
  expect(html).toContain('Faltam');
  expect(html).toContain('width:40%');
});
it('never renders NaN or Infinity for zero targets and keeps overtime visible', () => {
  const html = renderToStaticMarkup(
    <ProgressBar
      value={{
        month: '2026-11',
        total: 0,
        expected: 0,
        delivered: 8,
        people: [{ uid: 'a', label: 'Alice', hours: 8 }],
      }}
    />,
  );
  expect(html).not.toMatch(/NaN|Infinity/);
  expect(html).toContain('extras em mês sem meta');
  const overtime = renderToStaticMarkup(
    <ProgressBar
      value={{
        month: '2026-11',
        total: 8,
        expected: 8,
        delivered: 12,
        people: [{ uid: 'a', label: 'Alice', hours: 12 }],
      }}
    />,
  );
  expect(overtime).toContain('150%');
  expect(overtime).toContain('acima da meta mensal');
});
