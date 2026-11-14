import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProgressBar } from './BusinessProgress';
it('renders expected target and person percentages relative to monthly total', () => {
  const html = renderToStaticMarkup(
    <ProgressBar
      value={{
        month: '2026-11',
        businessDays: 20,
        holidayDays: 2,
        weekdayHolidays: 1,
        contractedBusinessDays: 20,
        future: false,
        projected: true,
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
  expect(html).toContain('20 dias úteis · 2 feriados');
  expect(html).not.toContain('Saldo anterior');
});
it('never renders NaN or Infinity for zero targets and keeps overtime visible', () => {
  const html = renderToStaticMarkup(
    <ProgressBar
      value={{
        month: '2026-11',
        businessDays: 20,
        holidayDays: 2,
        weekdayHolidays: 1,
        contractedBusinessDays: 20,
        future: false,
        projected: true,
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
        businessDays: 20,
        holidayDays: 2,
        weekdayHolidays: 1,
        contractedBusinessDays: 20,
        future: false,
        projected: true,
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
it('labels forecasts and shows signed carry without changing monthly delivery', () => {
  const value = {
    month: '2027-01',
    businessDays: 20,
    holidayDays: 1,
    weekdayHolidays: 1,
    contractedBusinessDays: 20,
    future: true,
    projected: true,
    total: 160,
    expected: 0,
    delivered: 0,
    openingBalance: -8,
    closingBalance: -168,
    people: [],
  };
  const html = renderToStaticMarkup(<ProgressBar value={value} />);
  expect(html).toContain('Previsão');
  expect(html).toContain('Saldo anterior: -8h');
  expect(html).toContain('Saldo projetado após a meta mensal: -168h');
  expect(html).toContain('Horas restantes com saldo: 168h');
  expect(html).toContain('0h / 160h');
  const credit = renderToStaticMarkup(
    <ProgressBar
      value={{ ...value, openingBalance: 180, closingBalance: 20 }}
    />,
  );
  expect(credit).toContain('Saldo anterior: +180h');
  expect(credit).toContain('Horas restantes com saldo: 0h');
});
