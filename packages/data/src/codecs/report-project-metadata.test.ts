import { describe, expect, it } from 'vitest';
import { canAccessProject } from '@work-track/core/registration/domain/project-access';
import {
  decodeReportProjectMetadata,
  type ReportProjectMetadataMode,
} from './report-project-metadata.js';

const modes: ReportProjectMetadataMode[] = [
  'admin',
  'personal-web',
  'authorized-web',
];
describe('report project metadata reader modes', () => {
  it.each(modes)(
    'fails closed for missing and malformed types in %s',
    (mode) => {
      expect(
        canAccessProject(decodeReportProjectMetadata({}, mode), 'alice'),
      ).toBe(false);
      for (const type of [undefined, null, false, 0, {}, [], 'unknown']) {
        const metadata = decodeReportProjectMetadata(
          { type, createdBy: 'alice' },
          mode,
        );
        expect(metadata.type).not.toBeUndefined();
        expect(canAccessProject(metadata, 'alice')).toBe(false);
      }
      expect(
        canAccessProject(
          decodeReportProjectMetadata(
            { type: 'personal', createdBy: 'alice' },
            mode,
          ),
          'alice',
        ),
      ).toBe(true);
      expect(
        canAccessProject(
          decodeReportProjectMetadata(
            { type: 'personal', createdBy: 'bob' },
            mode,
          ),
          'alice',
        ),
      ).toBe(false);
    },
  );

  it('preserves all-or-none Admin vs personal filtering vs authorized raw topics', () => {
    const topic = {
      id: 'code',
      title: 'Code',
      mergedIntoTopicId: 42,
      extra: 'historical',
    };
    const topics = [topic, null, { id: 'bad' }];
    const raw = {
      type: 'work',
      topics,
      custom: { retained: true },
      archived: 'historical',
      mergedInto: 42,
    };
    expect(decodeReportProjectMetadata(raw, 'admin')).toMatchObject({
      topics: [],
      archived: true,
      mergedInto: undefined,
    });
    const own = decodeReportProjectMetadata(raw, 'personal-web');
    expect(own.topics).toEqual([topic]);
    expect(own.topics[0]).toBe(topic);
    expect(own).not.toHaveProperty('custom');
    const authorized = decodeReportProjectMetadata(raw, 'authorized-web');
    expect(authorized).toMatchObject(raw);
    expect(authorized.topics).toBe(topics);
    expect(raw.topics).toBe(topics);
  });

  it('Admin strips topic extras only when every entry is valid', () => {
    const topic = {
      id: 'code',
      title: 'Code',
      mergedIntoTopicId: 'canonical',
      extra: 'raw',
    };
    expect(
      decodeReportProjectMetadata({ topics: [topic] }, 'admin').topics,
    ).toEqual([{ id: 'code', title: 'Code', mergedIntoTopicId: 'canonical' }]);
    for (const mode of modes) {
      for (const topics of [undefined, null, 'bad', {}]) {
        expect(decodeReportProjectMetadata({ topics }, mode).topics).toEqual(
          [],
        );
      }
    }
  });
});
