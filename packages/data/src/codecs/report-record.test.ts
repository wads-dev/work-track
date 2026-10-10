import { describe, expect, it } from 'vitest';
import {
  decodePersonalReportRecord,
  reportRecordSchema,
} from './report-record.js';

const fact = {
  uid: 'payload',
  projectId: 'project',
  startedAt: 'legacy-not-an-iso-date',
  timeZone: 'legacy-zone',
  originalText: 'private',
};
describe('explicit report record reader modes', () => {
  it.each([undefined, null, 'legacy-ended'])(
    'keeps nullish end normalization without validating legacy timestamps %s',
    (endedAt) => {
      const raw = { ...fact, endedAt };
      const schemas = [
        reportRecordSchema('admin-owned'),
        reportRecordSchema('admin-company'),
        reportRecordSchema('admin-project'),
        reportRecordSchema('authorized-web'),
        reportRecordSchema('personal-web'),
      ];
      for (const schema of schemas) {
        const parsed = schema.parse(raw);
        expect(parsed.endedAt).toBe(endedAt ?? undefined);
        expect(parsed.topics).toEqual([]);
        expect(parsed).not.toHaveProperty('originalText');
      }
      expect(raw.endedAt).toBe(endedAt);
    },
  );

  it('keeps nonnegative Admin/company/personal and permissive negative project/authorized modes distinct', () => {
    for (const field of ['percentage', 'durationMinutes']) {
      const raw = { ...fact, topics: [{ topicId: '', [field]: -1 }] };
      expect(reportRecordSchema('admin-owned').safeParse(raw).success).toBe(
        false,
      );
      expect(reportRecordSchema('admin-company').safeParse(raw).success).toBe(
        false,
      );
      expect(reportRecordSchema('personal-web').safeParse(raw).success).toBe(
        false,
      );
      expect(reportRecordSchema('admin-project').parse(raw).topics).toEqual(
        raw.topics,
      );
      expect(reportRecordSchema('authorized-web').parse(raw).topics).toEqual(
        raw.topics,
      );
      for (const number of [0, 1]) {
        const nonnegative = {
          ...raw,
          topics: [{ topicId: '', [field]: number }],
        };
        expect(
          reportRecordSchema('admin-owned').safeParse(nonnegative).success,
        ).toBe(true);
        expect(
          reportRecordSchema('admin-company').safeParse(nonnegative).success,
        ).toBe(true);
        expect(
          reportRecordSchema('personal-web').safeParse(nonnegative).success,
        ).toBe(true);
      }
      for (const number of [NaN, Infinity, -Infinity, null, '1']) {
        const invalid = { ...raw, topics: [{ topicId: 't', [field]: number }] };
        for (const schema of [
          reportRecordSchema('admin-owned'),
          reportRecordSchema('admin-company'),
          reportRecordSchema('admin-project'),
          reportRecordSchema('authorized-web'),
          reportRecordSchema('personal-web'),
        ]) {
          expect(schema.safeParse(invalid).success).toBe(false);
        }
      }
    }
  });

  it('defaults null topics only in personal Web, retaining its raw topic extras', () => {
    const raw = { ...fact, topics: null };
    expect(reportRecordSchema('personal-web').parse(raw).topics).toEqual([]);
    for (const schema of [
      reportRecordSchema('admin-owned'),
      reportRecordSchema('admin-company'),
      reportRecordSchema('admin-project'),
      reportRecordSchema('authorized-web'),
    ]) {
      expect(schema.safeParse(raw).success).toBe(false);
    }
    const topics = [{ topicId: 't', percentage: 0, extra: 'retained' }];
    expect(
      decodePersonalReportRecord({ ...fact, topics }, 'r', 'alice'),
    ).toMatchObject({ uid: 'alice', id: 'r', topics });
    expect(
      decodePersonalReportRecord({ ...fact, topics }, 'r', 'alice').topics,
    ).toBe(topics);
    expect(
      reportRecordSchema('admin-owned').parse({ ...fact, topics }).topics,
    ).toEqual([{ topicId: 't', percentage: 0 }]);
  });

  it('requires payload UID only in company/project/authorized and preserves own path-ID checks', () => {
    const own: Partial<typeof fact> = { ...fact };
    delete own.uid;
    expect(reportRecordSchema('admin-owned').safeParse(own).success).toBe(true);
    expect(reportRecordSchema('personal-web').safeParse(own).success).toBe(
      true,
    );
    for (const schema of [
      reportRecordSchema('admin-company'),
      reportRecordSchema('admin-project'),
      reportRecordSchema('authorized-web'),
    ]) {
      expect(schema.safeParse(own).success).toBe(false);
    }
    for (const projectId of ['', 'nested/project']) {
      expect(
        reportRecordSchema('personal-web').safeParse({ ...own, projectId })
          .success,
      ).toBe(false);
      expect(
        reportRecordSchema('admin-owned').safeParse({ ...own, projectId })
          .success,
      ).toBe(true);
    }
    expect(() =>
      decodePersonalReportRecord(
        { ...own, projectId: 'bad/path', topics: 'bad' },
        'r',
        'alice',
      ),
    ).toThrow('registro inválido');
    expect(() =>
      decodePersonalReportRecord({ ...own, topics: 'bad' }, 'r', 'alice'),
    ).toThrow('tópicos inválidos');
  });
});
