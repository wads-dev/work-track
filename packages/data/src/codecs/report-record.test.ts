import { describe, expect, it } from 'vitest';
import {
  decodePersonalReportRecord,
  reportRecordSchema,
} from './report-record.js';
const fact = {
  uid: 'payload',
  projectId: 'project',
  startedAt: '2026-10-08T09:00:00-03:00',
  endedAt: null,
  deletedAt: null,
  timeZone: 'America/Sao_Paulo',
  topics: [],
};
const schemas = [
  reportRecordSchema('admin-owned'),
  reportRecordSchema('admin-company'),
  reportRecordSchema('admin-project'),
  reportRecordSchema('authorized-web'),
  reportRecordSchema('personal-web'),
];
describe('canonical storage records', () => {
  it('normalizes only explicit null ends and preserves tombstones', () => {
    for (const schema of schemas) {
      expect(schema.parse(fact).endedAt).toBeUndefined();
      for (const deletedAt of [null, false, 0, '', {}, [], 'removed']) {
        expect(schema.parse({ ...fact, deletedAt }).deletedAt).toEqual(
          deletedAt,
        );
      }
      const endedAt = '2026-10-08T10:00:00Z';
      expect(schema.parse({ ...fact, endedAt }).endedAt).toBe(endedAt);
    }
  });
  it('rejects absent required storage fields instead of defaulting', () => {
    for (const field of [
      'endedAt',
      'deletedAt',
      'topics',
      'startedAt',
      'timeZone',
    ]) {
      const raw: Record<string, unknown> = { ...fact };
      delete raw[field];
      for (const schema of schemas)
        expect(schema.safeParse(raw).success).toBe(false);
      expect(() => decodePersonalReportRecord(raw, 'r', 'alice')).toThrow();
    }
  });
  it('rejects malformed timestamps zones and topic allocations in every mode', () => {
    for (const patch of [
      { endedAt: undefined },
      { endedAt: 'bad' },
      { endedAt: '2026-10-08T10:00:00' },
      { startedAt: '2026-02-30T10:00:00Z' },
      { startedAt: 'bad' },
      { timeZone: 'bad' },
      { timeZone: '+03:00' },
      { topics: null },
      { topics: undefined },
      { topics: [{ topicId: 't', percentage: -1 }] },
      { topics: [{ topicId: 't', durationMinutes: Infinity }] },
    ])
      for (const schema of schemas)
        expect(schema.safeParse({ ...fact, ...patch }).success).toBe(false);
  });
  it('takes owner identity from the scope and strips private extras', () => {
    expect(
      decodePersonalReportRecord(
        { ...fact, originalText: 'private' },
        'r',
        'alice',
      ),
    ).toMatchObject({ id: 'r', uid: 'alice', deletedAt: null });
    expect(
      decodePersonalReportRecord(
        { ...fact, originalText: 'private' },
        'r',
        'alice',
      ),
    ).not.toHaveProperty('originalText');
  });
});
