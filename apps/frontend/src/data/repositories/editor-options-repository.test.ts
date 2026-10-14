import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { nativeCache } from './firestore-report-fixture';
vi.mock(
  'firebase/firestore',
  async () =>
    (await import('./firestore-report-fixture')).nativeCache.firestore,
);
import {
  EditorOptionsRepository,
  emptyEditorOptions,
  prepareEditorOptions,
  selectProjectTopics,
  setEditorTopicChecked,
} from './editor-options-repository';
const selection = {
  projectId: 'p',
  revealed: false,
  selectedTopics: [
    { topicId: 'old', percentage: 75 },
    { topicId: 'active', durationMinutes: 15 },
  ],
};
beforeEach(() => nativeCache.reset());
afterEach(() => {
  expect(nativeCache.getDocs).not.toHaveBeenCalled();
  expect(nativeCache.getDocsFromServer).not.toHaveBeenCalled();
  expect(nativeCache.onSnapshot).not.toHaveBeenCalled();
});
it('queries current authorized project IDs natively and preserves existing active options', async () => {
  nativeCache.seed([
    {
      path: 'projects/p',
      data: {
        archived: false,
        confidential: false,
        type: 'work',
        createdBy: 'me',
        title: 'Project',
        topics: [
          { archived: false, id: 'active', title: 'Active' },
          { id: 'old', title: 'Old', archived: true },
          { id: 'unused', title: 'Unavailable', archived: true },
        ],
      },
    },
    {
      path: 'projects/hidden',
      data: {
        archived: false,
        type: 'work',
        createdBy: 'me',
        topics: [],
        title: 'Secret',
        confidential: true,
      },
    },
    {
      path: 'projects/archived',
      data: {
        confidential: false,
        type: 'work',
        createdBy: 'me',
        topics: [],
        title: 'Archive',
        archived: true,
      },
    },
    {
      path: 'projects/merged',
      data: {
        archived: false,
        confidential: false,
        type: 'work',
        createdBy: 'me',
        topics: [],
        title: 'Merged',
        mergedInto: 'p',
      },
    },
    {
      path: 'projects/locked',
      data: {
        archived: false,
        confidential: false,
        type: 'work',
        createdBy: 'me',
        topics: [],
        title: 'Locked',
        mergeLock: { requestId: 'merge' },
      },
    },
    {
      path: 'projects/foreign',
      data: {
        archived: false,
        confidential: false,
        title: 'Foreign',
        type: 'personal',
        createdBy: 'other',
        topics: [],
      },
    },
    {
      path: 'projects/invalid',
      data: {
        archived: false,
        confidential: false,
        title: 'Invalid',
        type: 'invalid',
        createdBy: 'me',
        topics: [],
      },
    },
    {
      path: 'projects/revoked',
      data: {
        archived: false,
        confidential: false,
        type: 'work',
        createdBy: 'me',
        topics: [],
        title: 'Revoked',
      },
    },
  ]);
  const ids = [
    'p',
    'hidden',
    'archived',
    'merged',
    'locked',
    'foreign',
    'invalid',
  ];
  const repository = new EditorOptionsRepository(
    nativeCache.db,
    'me',
    new Set(ids),
  );
  const result = await repository.read(selection);
  expect(nativeCache.getDocsFromCache).toHaveBeenCalledWith({
    base: 'projects',
    constraints: [
      { field: '__name__', op: 'in', value: ids },
      { field: 'archived', op: '==', value: false },
      { field: 'confidential', op: '==', value: false },
    ],
  });
  expect(nativeCache.getDocsFromCache).toHaveBeenCalledWith({
    base: 'projects',
    constraints: [{ field: '__name__', op: '==', value: 'p' }],
  });
  expect(result.projects).toEqual([
    { id: 'p', label: 'Project', searchText: 'Project' },
  ]);
  expect(result.topics.map((topic) => topic.id)).toEqual(['active', 'old']);
  expect(result.topics[1].selected).toEqual(selection.selectedTopics[0]);
  expect(result.topics[0].selected).toEqual(selection.selectedTopics[1]);
  expect(result.hidden).toBe(false);
});
it('retains current archived/locked project and selected retired topics without exposing confidential text', async () => {
  nativeCache.seed([
    {
      path: 'projects/p',
      data: {
        type: 'work',
        createdBy: 'me',
        title: 'Secret',
        confidential: true,
        archived: true,
        mergedInto: 'destination',
        mergeLock: true,
        topics: [{ id: 'old', title: 'Secret topic', archived: true }],
      },
    },
  ]);
  const repository = new EditorOptionsRepository(
    nativeCache.db,
    'me',
    new Set(['p']),
  );
  const masked = await repository.read(selection);
  expect(masked.projects).toEqual([
    { id: 'p', label: 'Projeto reservado', searchText: 'Projeto reservado' },
  ]);
  expect(masked.topics).toEqual([]);
  expect(masked.hidden).toBe(true);
  expect(JSON.stringify(masked)).not.toContain('Secret');
  const revealed = await repository.read({ ...selection, revealed: true });
  expect(revealed.projects[0].label).toBe('Secret');
  expect(revealed.topics[0].selected?.percentage).toBe(75);
});
it('retention never bypasses current ACL, allowlist, uid isolation or malformed IDs', async () => {
  nativeCache.seed([
    {
      path: 'projects/foreign',
      data: {
        archived: false,
        confidential: false,
        title: 'Foreign',
        type: 'personal',
        createdBy: 'other',
        topics: [],
      },
    },
    {
      path: 'projects/revoked',
      data: {
        archived: false,
        confidential: false,
        type: 'work',
        createdBy: 'me',
        topics: [],
        title: 'Revoked',
      },
    },
  ]);
  const repo = new EditorOptionsRepository(
    nativeCache.db,
    'me',
    new Set(['foreign', '../bad']),
  );
  expect(await repo.read({ ...selection, projectId: 'foreign' })).toEqual(
    emptyEditorOptions,
  );
  expect(await repo.read({ ...selection, projectId: 'revoked' })).toEqual(
    emptyEditorOptions,
  );
  expect(
    await new EditorOptionsRepository(
      nativeCache.db,
      '',
      new Set(['foreign']),
    ).read(selection),
  ).toEqual(emptyEditorOptions);
  expect(
    nativeCache.getDocsFromCache.mock.calls[0][0].constraints[0].value,
  ).toEqual(['foreign']);
  nativeCache.getDocsFromCache.mockClear();
  expect(
    await new EditorOptionsRepository(nativeCache.db, 'me', new Set()).read(
      selection,
    ),
  ).toEqual(emptyEditorOptions);
  expect(nativeCache.getDocsFromCache).not.toHaveBeenCalled();
});
it('batches native in queries at Firestore limit without truncating options', async () => {
  const ids = Array.from(
    { length: 65 },
    (_, index) => 'p' + String(index).padStart(2, '0'),
  );
  nativeCache.seed(
    ids.map((id) => ({
      path: 'projects/' + id,
      data: {
        archived: false,
        confidential: false,
        type: 'work',
        createdBy: 'me',
        topics: [],
        title: id,
      },
    })),
  );
  const result = await new EditorOptionsRepository(
    nativeCache.db,
    'me',
    new Set(ids),
  ).read(selection);
  expect(result.projects).toHaveLength(65);
  expect(
    nativeCache.getDocsFromCache.mock.calls.map(
      ([target]) => (target.constraints[0].value as string[]).length,
    ),
  ).toEqual([30, 30, 5]);
});
it.each([
  {
    topics: [
      {
        id: 'alias',
        title: 'Alias',
        archived: false,
        mergedIntoTopicId: 'active',
      },
    ],
  },
  {
    topics: [
      {
        id: 'alias',
        title: 'Alias',
        archived: false,
        mergedIntoTopicId: undefined,
      },
    ],
  },
  { topics: [{ id: 'missing', title: 'Missing archive flag' }] },
  {
    topics: [
      { id: 'invalid', title: 'Invalid archive flag', archived: 'false' },
    ],
  },
])('never retains noncanonical selected project topics: %s', async (patch) => {
  const data = {
    type: 'work',
    createdBy: 'me',
    archived: false,
    confidential: false,
    title: 'Project',
    ...patch,
  };
  nativeCache.seed([{ path: 'projects/p', data }]);
  expect(
    await new EditorOptionsRepository(
      nativeCache.db,
      'me',
      new Set(['p']),
    ).read(selection),
  ).toEqual(emptyEditorOptions);
  expect(data).toMatchObject(patch);
});
it.each(['type', 'createdBy', 'archived', 'confidential', 'topics'])(
  'never retains selected project missing explicit %s',
  async (field) => {
    const data: Record<string, unknown> = {
      type: 'work',
      createdBy: 'me',
      archived: false,
      confidential: false,
      topics: [],
      title: 'Project',
    };
    delete data[field];
    nativeCache.seed([{ path: 'projects/p', data }]);
    expect(
      await new EditorOptionsRepository(
        nativeCache.db,
        'me',
        new Set(['p']),
      ).read(selection),
    ).toEqual(emptyEditorOptions);
    expect(data).not.toHaveProperty(field);
  },
);
it('propagates cache failures instead of falling back to stale arrays or remote reads', async () => {
  nativeCache.getDocsFromCache.mockRejectedValueOnce(new Error('cache failed'));
  await expect(
    new EditorOptionsRepository(nativeCache.db, 'me', new Set(['p'])).read(
      selection,
    ),
  ).rejects.toThrow('cache failed');
});
it('embedded topic residual keeps archived metadata and excludes merged aliases', () => {
  expect(
    selectProjectTopics({
      topics: [
        { archived: false, id: 'active' },
        { id: 'archive', archived: true },
        { archived: false, id: 'merged', mergedIntoTopicId: 'active' },
      ],
    }).map((topic) => topic.id),
  ).toEqual(['active', 'archive']);
});
it('prepared options and checkbox commands preserve allocations without mutating input', () => {
  const topics = [
    { topicId: 'old', percentage: 75 },
    { topicId: 'active', durationMinutes: 15 },
  ];
  const result = prepareEditorOptions(
    [
      {
        id: 'p',
        data: {
          archived: false,
          confidential: false,
          type: 'work',
          createdBy: 'me',
          title: 'Project',
          topics: [
            { id: 'old', archived: true },
            { archived: false, id: 'active' },
          ],
        },
      },
    ],
    { ...selection, selectedTopics: topics },
    {
      type: 'work',
      createdBy: 'me',
      archived: false,
      confidential: false,
      title: 'Project',
      topics: [
        { id: 'old', archived: true },
        { archived: false, id: 'active' },
      ],
    },
  );
  expect(result.topics[0].selected).toEqual(topics[0]);
  expect(setEditorTopicChecked(topics, 'old', true)).toEqual(topics);
  expect(setEditorTopicChecked(topics, 'old', false)).toEqual([topics[1]]);
  expect(setEditorTopicChecked(topics, 'new', true)).toEqual([
    ...topics,
    { topicId: 'new' },
  ]);
  expect(topics).toHaveLength(2);
});
