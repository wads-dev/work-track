import { describe, expect, it } from 'vitest';
import {
  decodeReportProjectMetadata,
  type ReportProjectMetadataMode,
} from './report-project-metadata.js';
const modes: ReportProjectMetadataMode[] = [
  'admin',
  'personal-web',
  'authorized-web',
];
const fact = {
  type: 'work',
  createdBy: 'alice',
  archived: false,
  confidential: false,
  topics: [{ id: 't', title: 'Topic', archived: false }],
};
describe('canonical project metadata', () => {
  it.each(modes)('preserves validated multiplier histories in %s', (mode) => {
    const timeMultipliers = {
      alice: [
        { multiplier: 0, effectiveFrom: null },
        { multiplier: 1.5, effectiveFrom: '2026-01-01T00:00:00-03:00' },
      ],
    };
    expect(
      decodeReportProjectMetadata({ ...fact, timeMultipliers }, mode)
        .timeMultipliers,
    ).toEqual(timeMultipliers);
    expect(() =>
      decodeReportProjectMetadata(
        {
          ...fact,
          timeMultipliers: { alice: [{ multiplier: -1, effectiveFrom: null }] },
        },
        mode,
      ),
    ).toThrow();
  });
  it.each(modes)('accepts explicit state in %s', (mode) => {
    expect(decodeReportProjectMetadata(fact, mode)).toEqual(fact);
  });
  it.each(modes)('rejects topic alias chains in %s', (mode) => {
    for (const mergedIntoTopicId of ['target', '', null]) {
      expect(() =>
        decodeReportProjectMetadata(
          {
            ...fact,
            topics: [
              { id: 'old', title: 'Old', archived: false, mergedIntoTopicId },
              { id: 'target', title: 'Target', archived: false },
            ],
          },
          mode,
        ),
      ).toThrow();
    }
    expect(() =>
      decodeReportProjectMetadata(
        {
          ...fact,
          topics: [
            {
              id: 'old',
              title: 'Old',
              archived: false,
              mergedIntoTopicId: 'middle',
            },
            {
              id: 'middle',
              title: 'Middle',
              archived: false,
              mergedIntoTopicId: 'target',
            },
            { id: 'target', title: 'Target', archived: false },
          ],
        },
        mode,
      ),
    ).toThrow();
  });
  it.each(modes)('rejects missing storage state in %s', (mode) => {
    for (const field of [
      'type',
      'createdBy',
      'archived',
      'confidential',
      'topics',
    ]) {
      const raw: Record<string, unknown> = { ...fact };
      delete raw[field];
      expect(() => decodeReportProjectMetadata(raw, mode)).toThrow();
    }
    expect(() =>
      decodeReportProjectMetadata(
        { ...fact, topics: [{ id: 't', title: 'Topic' }] },
        mode,
      ),
    ).toThrow();
  });
  it.each(modes)(
    'rejects malformed fields without dropping topics in %s',
    (mode) => {
      for (const patch of [
        { type: null },
        { type: 'unknown' },
        { archived: 0 },
        { confidential: 'false' },
        { topics: null },
        { topics: [null] },
        { topics: [{ id: 't', title: 'Topic', archived: 'false' }] },
      ]) {
        expect(() =>
          decodeReportProjectMetadata({ ...fact, ...patch }, mode),
        ).toThrow();
      }
    },
  );
});
