import { expect, it } from 'vitest';
import { pauseInput, validateSource, validateSpeech } from './pause.js';
const now = Date.parse('2026-10-09T15:00:00Z'),
  input = pauseInput.parse({
    resumedAt: '2026-10-09T15:00:00Z',
    durationMinutes: 30,
    requestId: 'pause',
    reason: 'Almoço',
    originalUtterance: 'Pausei30minutos',
  });
const source = {
  uid: 'a',
  projectId: 'p',
  requestId: 'source',
  startedAt: '2026-10-09T13:00:00Z',
  timeZone: 'UTC',
  originalText: 'Original',
  interpretation: 'Trabalho',
  projectSnapshot: { title: 'P' },
  topicSnapshots: [],
};
const project = {
  id: 'p',
  title: 'Projeto',
  description: 'desc',
  createdBy: 'a',
  createdAt: 'date',
  type: 'personal' as const,
  topics: [],
};
it('closes at speech minus explicit minutes without modifying evidence', () => {
  expect(validateSource(source, project, input, 'a', now)).toBe(
    '2026-10-09T14:30:00.000Z',
  );
  expect(source.originalText).toBe('Original');
});
it('rejects future, exactly24h old and invalid duration before persistence', () => {
  expect(() =>
    validateSpeech({ ...input, resumedAt: '2026-10-09T15:00:01Z' }, now),
  ).toThrow();
  expect(() =>
    validateSpeech({ ...input, resumedAt: '2026-10-08T15:00:00Z' }, now),
  ).toThrow();
  for (const durationMinutes of [0, -1, 1440, Infinity, NaN])
    expect(pauseInput.safeParse({ ...input, durationMinutes }).success).toBe(
      false,
    );
});
it('rejects old/closed/foreign and pause preceding start', () => {
  for (const patch of [
    { startedAt: '2026-10-08T15:00:00Z' },
    { endedAt: input.resumedAt },
    { uid: 'b' },
    { startedAt: '2026-10-09T14:50:00Z' },
  ])
    expect(() =>
      validateSource({ ...source, ...patch }, project, input, 'a', now),
    ).toThrow();
  expect(() =>
    validateSource(source, { ...project, createdBy: 'b' }, input, 'a', now),
  ).toThrow('Projeto não encontrado.');
});
it('rejects malformed project topic catalog with clean error', () => {
  expect(() =>
    validateSource(
      source,
      { ...project, topics: undefined } as unknown as typeof project,
      input,
      'a',
      now,
    ),
  ).toThrow('Contexto de projeto/tópicos inválido');
});
it('rejects archived context and absolute topic minutes without repartition', () => {
  expect(() =>
    validateSource(source, { ...project, archived: true }, input, 'a', now),
  ).toThrow();
  expect(() =>
    validateSource(
      { ...source, topics: [{ topicId: 't', durationMinutes: 10 }] },
      project,
      input,
      'a',
      now,
    ),
  ).toThrow('Durações absolutas');
});
