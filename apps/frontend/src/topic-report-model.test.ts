import { it, expect } from 'vitest';
import { topicBuckets, type ReportTopic } from './topic-report-model';
const topic: ReportTopic = {
  projectId: 'p',
  topicId: 'same',
  label: 'Secret topic',
  minutes: 60,
  byUser: [{ uid: 'raw-user', label: 'Pessoa 1', minutes: 60 }],
};
it('masks project and topic before view model for confidential and unknown metadata', () => {
  for (const metadata of [
    undefined,
    { title: 'Secret project', confidential: true },
  ]) {
    const result = topicBuckets([topic], () => metadata, false);
    expect(result[0].projectLabel).toBe('Projeto reservado');
    expect(result[0].topicLabel).toBe('Tópico reservado');
    expect(JSON.stringify(result)).not.toContain('Secret');
    expect(JSON.stringify(result)).not.toContain('raw-user');
  }
});
it('keeps authorized project-qualified allocations unchanged', () => {
  const result = topicBuckets(
    [topic, { ...topic, projectId: 'other' }],
    (id) => ({ title: id }),
    false,
  );
  expect(result.map((b) => b.projectId)).toEqual(['p', 'other']);
  expect(result.map((b) => b.minutes)).toEqual([60, 60]);
  expect(result).toHaveLength(2);
});
it('personal drilldown contains only self with neutral label and never synthesizes residual', () => {
  const result = topicBuckets(
    [
      {
        ...topic,
        byUser: [
          ...topic.byUser,
          { uid: 'foreign', label: 'Foreign', minutes: 5 },
        ],
      },
    ],
    () => ({ title: 'Project' }),
    false,
    'raw-user',
  );
  expect(result[0].people).toEqual([{ key: '0', label: 'Você', minutes: 60 }]);
  expect(result.every((b) => b.topicId !== null)).toBe(true);
});
it('missing label does not fall back to uid', () => {
  const result = topicBuckets(
    [{ ...topic, byUser: [{ uid: 'secretuid', label: '', minutes: 60 }] }],
    () => ({ title: 'Project' }),
    false,
  );
  expect(result[0].people[0].label).toBe('Pessoa');
  expect(JSON.stringify(result)).not.toContain('secretuid');
});
