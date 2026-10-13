import { expect, it } from 'vitest';
import { calendarEventDetails } from './calendar-event-details';
const item = {
  id: 'r',
  uid: 'other',
  projectId: 'p',
  topics: [{ label: 'Entrega' }],
};
const records = [
  {
    ...item,
    interpretation: 'Corrigir navegação',
    originalText: 'Texto original',
  },
];
it('shows topic and summary from matching authorized record without additional reads', () => {
  expect(calendarEventDetails(item, records[0], {}, false, 'me')).toEqual({
    topics: 'Entrega',
    summary: 'Corrigir navegação',
  });
});
it('never exposes topic or text from confidential or missing projects', () => {
  for (const project of [undefined, { confidential: true }])
    expect(
      calendarEventDetails(item, records[0], project, false, 'me'),
    ).toEqual({
      topics: 'Tópicos reservados',
      summary: 'Conteúdo oculto.',
    });
});
it('matches owner and project as well as id and uses original text fallback', () => {
  expect(
    calendarEventDetails({ ...item, uid: 'me' }, records[0], {}, true, 'me')
      .summary,
  ).toBe('Sem descrição informada');
  expect(
    calendarEventDetails(
      item,
      { ...item, originalText: 'Original' },
      {},
      true,
      'me',
    ).summary,
  ).toBe('Original');
});
it('ignores a prepared source for a different project and keeps blank text fallback', () => {
  expect(
    calendarEventDetails(
      item,
      { ...item, projectId: 'another', originalText: 'Wrong project' },
      {},
      true,
      'me',
    ).summary,
  ).toBe('Sem descrição informada');
  expect(
    calendarEventDetails(
      item,
      { ...item, interpretation: ' ', originalText: ' ' },
      {},
      true,
      'me',
    ).summary,
  ).toBe('Sem descrição informada');
});
