import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectAppearance } from '@work-track/core/registration/domain/project-color';
import {
  chartPresentation,
  createMetadataPresentationRepository,
  readTopicMetadata,
} from './metadata-presentation-repository';
import type { Row } from '../../shared/data';

const reads = vi.hoisted(() => ({
  getDocFromCache: vi.fn(),
  getDocsFromCache: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
}));
vi.mock('firebase/firestore', async (original) => ({
  ...(await original<typeof import('firebase/firestore')>()),
  ...reads,
}));
beforeEach(() => vi.clearAllMocks());
const catalog: Row[] = [
  {
    id: 'other',
    data: {
      type: 'work',
      createdBy: 'alice',
      archived: false,
      confidential: false,
      topics: [],
      title: 'Other',
      color: '#f97316',
    },
  },
  {
    id: 'private',
    data: {
      type: 'work',
      createdBy: 'alice',
      archived: false,
      title: 'Private project',
      description: 'Private activity',
      confidential: true,
      color: '#123abc',
      topics: [
        { id: 'private-topic', title: 'Private topic', archived: false },
      ],
    },
  },
  {
    id: 'selected',
    data: {
      type: 'work',
      createdBy: 'alice',
      archived: false,
      confidential: false,
      title: 'Selected',
      topics: [{ id: 't', title: 'Selected topic', archived: false }],
    },
  },
];

describe('embedded metadata presentation joins', () => {
  it('returns structural joined project/topic metadata without selecting screen datasets', () => {
    const repository = createMetadataPresentationRepository(catalog, false);
    expect(repository.project('selected')).toMatchObject({
      id: 'selected',
      project: { title: 'Selected' },
      topics: [{ id: 't', title: 'Selected topic', archived: false }],
    });
    expect(repository.project('missing')).toBeUndefined();
    expect(repository.project('private')?.topics).toEqual([]);
    expect(JSON.stringify(repository.project('private'))).not.toContain(
      'Private',
    );
    expect(
      createMetadataPresentationRepository(catalog, true).project('private')
        ?.topics,
    ).toEqual([
      { id: 'private-topic', title: 'Private topic', archived: false },
    ]);
  });

  it('rejects merged aliases and malformed topics while retaining canonical labels', () => {
    const topics = [
      {
        id: 'old',
        title: 'Obsolete',
        archived: false,
        mergedIntoTopicId: 'intermediate',
      },
      { id: 'intermediate', archived: false, mergedIntoTopicId: 'current' },
      { id: 'current', title: 'Current topic', archived: false },
    ];
    expect(readTopicMetadata({ topics }, 'old')).toBeUndefined();
    expect(readTopicMetadata({ topics }, 'intermediate')).toBeUndefined();
    expect(readTopicMetadata({ topics }, 'current')).toEqual({
      id: 'current',
      title: 'Current topic',
    });
    expect(readTopicMetadata({ topics }, 'missing')).toBeUndefined();
    for (const topic of [
      { id: 'a' },
      { id: 'a', archived: null },
      { id: 'a', archived: 'false' },
      { id: 'a', archived: false, mergedIntoTopicId: undefined },
    ])
      expect(readTopicMetadata({ topics: [topic] }, 'a')).toBeUndefined();
    expect(
      readTopicMetadata(
        { topics: [{ id: 'a', title: 'Archived', archived: true }] },
        'a',
      ),
    ).toEqual({ id: 'a', title: 'Archived' });
    expect(
      readTopicMetadata(
        {
          topics: [
            { id: 'a', mergedIntoTopicId: 'b' },
            { id: 'b', mergedIntoTopicId: 'a' },
          ],
        },
        'a',
      ),
    ).toBeUndefined();
    expect(
      readTopicMetadata(
        {
          topics: [
            { id: 'a', archived: false },
            { id: 'a', archived: false },
          ],
        },
        'a',
      ),
    ).toBeUndefined();
    expect(
      readTopicMetadata({ topics: [{ id: 'a', mergedIntoTopicId: 42 }] }, 'a'),
    ).toBeUndefined();
    expect(
      readTopicMetadata({ topics: [{ id: 'a', archived: false }] }, 'a'),
    ).toEqual({
      id: 'a',
      title: 'Tópico',
    });
  });

  it('preserves complete-catalog collision policy and excludes confidential configured color', () => {
    const repository = createMetadataPresentationRepository(catalog, false);
    const colors = [
      { id: 'other', color: '#f97316' },
      { id: 'private', color: undefined },
      { id: 'selected', color: undefined },
    ];
    expect(repository.color('other')).toBe('#f97316');
    expect(repository.color('private')).not.toBe('#123abc');
    expect(repository.color('selected')).toBe(
      new ProjectAppearance({ id: 'selected' }).getColor(colors),
    );
    expect(repository.color('missing')).toBe(
      new ProjectAppearance({ id: 'missing' }).getColor(colors),
    );
    expect(
      createMetadataPresentationRepository([...catalog].reverse(), false).color(
        'selected',
      ),
    ).toBe(repository.color('selected'));
    expect(
      createMetadataPresentationRepository(catalog, true).color('private'),
    ).toBe('#123abc');
  });

  it('does not retain identities or topics after receiving a new account/ACL catalog', () => {
    const before = createMetadataPresentationRepository(catalog, true);
    expect(before.project('private')?.topics).toHaveLength(1);
    const after = createMetadataPresentationRepository([], true);
    expect(after.project('private')).toBeUndefined();
    expect(readTopicMetadata(undefined, 'private-topic')).toBeUndefined();
  });

  it('performs no cache queries, remote reads or listeners for repeated labels/colors/chart joins', () => {
    const repository = createMetadataPresentationRepository(catalog, false);
    for (let i = 0; i < 20; i++) {
      repository.project('selected');
      repository.color('selected');
      readTopicMetadata(catalog[2]!.data, 't');
      chartPresentation(
        [{ uid: 'person', label: 'Person', minutes: 20 }],
        () => 'Public identity',
      );
    }
    for (const read of Object.values(reads))
      expect(read).not.toHaveBeenCalled();
  });
});

describe('chart presentation identities', () => {
  it('keeps person identity/navigation while preserving caller-masked project/topic labels', () => {
    const name = vi.fn(() => 'Ana Silva');
    const person = {
      kind: 'person' as const,
      uid: 'ana-id',
      label: 'Ana',
      minutes: 60,
      href: '/people/ana-id',
    };
    const project = {
      kind: 'project' as const,
      uid: 'ana-id',
      label: 'Projeto reservado',
      minutes: 30,
    };
    const topic = {
      kind: 'topic' as const,
      label: 'Tópico reservado',
      minutes: 15,
    };
    expect(chartPresentation([person, project, topic], name)).toEqual([
      { ...person, label: 'Ana Silva' },
      project,
      topic,
    ]);
    expect(name).toHaveBeenCalledExactlyOnceWith('ana-id');
  });

  it('validates amounts without using a business filter or inferring missing identities', () => {
    const data = [
      { uid: 'missing', label: 'uid must not be fallback', minutes: 30 },
      { label: 'Visible project', minutes: 15 },
      ...[0, -1, NaN, Infinity].map((minutes) => ({
        label: 'Invalid',
        minutes,
      })),
    ];
    expect(chartPresentation(data, () => undefined)).toEqual([
      { ...data[0], label: 'Pessoa da empresa' },
      data[1],
    ]);
  });
});
