import { describe, expect, it } from 'vitest';
import { registerInput, type Project } from './work-model.js';
import { searchProjects } from './project-search.js';
const base = {
  projectId: 'project',
  startedAt: '2026-10-08T21:00:00-03:00',
  timeZone: 'America/Sao_Paulo',
  originalText: 'Comecei vinte minutos atrás',
  interpretation: 'Início relativo à fala',
  requestId: 'event-1',
};
describe('work registration', () => {
  it('accepts open periods and preserves relative context without inventing end', () => {
    const value = registerInput.parse(base);
    expect(value.endedAt).toBeUndefined();
    expect(value.originalText).toBe(base.originalText);
  });
  it('accepts multiple topics without inferred distribution', () => {
    expect(
      registerInput.parse({
        ...base,
        topics: [{ topicId: 'a' }, { topicId: 'b' }],
      }).topics,
    ).toEqual([{ topicId: 'a' }, { topicId: 'b' }]);
  });
  it('rejects reversed times duplicate topics invalid zones and excessive allocation', () => {
    for (const extra of [
      { endedAt: '2026-10-08T20:00:00-03:00' },
      { timeZone: 'Invalid/Zone' },
      { topics: [{ topicId: 'a' }, { topicId: 'a' }] },
      {
        topics: [
          { topicId: 'a', percentage: 60 },
          { topicId: 'b', percentage: 60 },
        ],
      },
    ])
      expect(registerInput.safeParse({ ...base, ...extra }).success).toBe(
        false,
      );
  });
  it('requires offset rather than guessing timezone', () => {
    expect(
      registerInput.safeParse({ ...base, startedAt: '2026-10-08T21:00:00' })
        .success,
    ).toBe(false);
  });
});
describe('project matching', () => {
  const project: Project = {
    id: 'p',
    title: 'Wads Work Track',
    description: 'Organização pessoal de atividades e rotina',
    topics: [{ id: 'general', title: 'Geral', description: 'Geral' }],
    createdBy: 'user',
    createdAt: '',
  };
  it('finds spelling approximations and description words', () => {
    expect(searchProjects([project], 'work trak', 20)[0]?.id).toBe('p');
    expect(searchProjects([project], 'organizacao', 20)[0]?.id).toBe('p');
  });
  it('lists projects with empty query', () => {
    expect(searchProjects([project], '', 20)).toHaveLength(1);
  });
});
