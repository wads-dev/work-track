import { describe, it, expect } from 'vitest';
import { safeReturnTo, topicDetailsPath } from '../../app/routes';
import {
  canonicalCatalogTopic,
  validateTopicReport,
  type TopicDetailReport,
} from './topic-details';
import { topicBuckets } from './topic-report-model';
const sample = (): TopicDetailReport => ({
  policy: 'topic-report-v3',
  scope: 'all-selected',
  projectId: 'p',
  topicId: 't',
  requestedTopicId: 't',
  topicLabel: 'T',
  mode: 'own',
  viewerUid: 'me',
  asOf: '2026-10-09T00:00:00Z',
  occurrenceCount: 1,
  firstRecordStartedAt: '1999-01-04T00:00:00Z',
  lastRecordStartedAt: '1999-01-04T00:00:00Z',
  totalMinutes: 0,
  closedMinutes: 0,
  estimatedMinutes: 0,
  fullRecordMinutes: 0,
  unassignedMinutes: 0,
  participants: [
    {
      uid: 'me',
      label: 'You',
      occurrenceCount: 1,
      firstRecordStartedAt: '1999-01-04T00:00:00Z',
      lastRecordStartedAt: '1999-01-04T00:00:00Z',
      assignedMinutes: 0,
      closedMinutes: 0,
      estimatedMinutes: 0,
      fullRecordMinutes: 0,
    },
  ],
  intervals: [],
  warnings: [],
  page: { limit: 2000, nextCursor: null, partial: false },
});
describe('topic details facts and privacy', () => {
  it('zero-minute actual occurrence retains historical dates independently of current asOf or intervals', () => {
    expect(
      validateTopicReport(sample(), 'me', 'p', 't', 't').occurrenceCount,
    ).toBe(1);
  });
  it('empty authorized topic requires null facts', () => {
    const d = {
      ...sample(),
      occurrenceCount: 0,
      firstRecordStartedAt: null,
      lastRecordStartedAt: null,
      participants: [],
    };
    expect(
      validateTopicReport(d, 'me', 'p', 't', 't').firstRecordStartedAt,
    ).toBeNull();
    expect(() =>
      validateTopicReport(
        { ...d, firstRecordStartedAt: sample().asOf },
        'me',
        'p',
        't',
        't',
      ),
    ).toThrow();
  });
  it('rejects mismatched owner scope partial query and foreign personal author', () => {
    for (const d of [
      { ...sample(), viewerUid: 'foreign' },
      { ...sample(), scope: 'partial' },
      { ...sample(), page: { limit: 2000, nextCursor: null, partial: true } },
      {
        ...sample(),
        participants: [{ ...sample().participants[0], uid: 'foreign' }],
      },
    ])
      expect(() => validateTopicReport(d, 'me', 'p', 't', 't')).toThrow();
  });
  it('alias canonical resolution is explicit and missing cyclic failclosed', () => {
    expect(
      canonicalCatalogTopic(
        [{ id: 'old', mergedIntoTopicId: 't' }, { id: 't' }],
        'old',
      ),
    ).toBe('t');
    expect(
      canonicalCatalogTopic([{ id: 'old', mergedIntoTopicId: 'old' }], 'old'),
    ).toBeNull();
    expect(canonicalCatalogTopic([], 'missing')).toBeNull();
  });
  it('hidden report has no details link and no real label until reveal', () => {
    const topic = {
      projectId: 'p',
      topicId: 't',
      label: 'Secret',
      minutes: 0,
      byUser: [],
    };
    const project = () => ({ title: 'SecretProject', confidential: true });
    expect(topicBuckets([topic], project, false)[0]).toMatchObject({
      detailsAvailable: false,
      topicLabel: 'Tópico reservado',
    });
    expect(topicBuckets([topic], project, true)[0].detailsAvailable).toBe(true);
  });
});
describe('canonical nested topic route allowlist', () => {
  it('encodes each identity and preserves prior context search separately', () => {
    expect(topicDetailsPath('p space', 't?x')).toBe(
      '/projects/p%20space/topics/t%3Fx',
    );
    expect(
      safeReturnTo('/projects/p/topics/t?topic=%5B%22p%22%2C%22t%22%5D'),
    ).toContain('/projects/p/topics/t?topic=');
  });
  it('rejects external routes encoded slashes backslashes double encoding and invalid nested paths', () => {
    for (const p of [
      'https://evil.test',
      '//evil.test',
      '/projects/p/topics/t/extra',
      '/projects/%2f/topics/t',
      '/projects/p/topics/%255c',
      '/projects/%2e%2e/topics/t',
      '/calendar/t',
      '/projects/p/topics/t\\x',
    ])
      expect(safeReturnTo(p)).toBe('/app');
    for (const id of ['..', 'x/y', 'x\\y'])
      expect(() => topicDetailsPath('p', id)).toThrow();
  });
});
