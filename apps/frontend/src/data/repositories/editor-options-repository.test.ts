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
    { topicId: 'alias', durationMinutes: 15 },
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
        type: 'work',
        title: 'Project',
        topics: [
          { id: 'active', title: 'Active' },
          { id: 'old', title: 'Old', archived: true },
          { id: 'alias', title: 'Alias', mergedIntoTopicId: 'active' },
          { id: 'unused', title: 'Unavailable', archived: true },
        ],
      },
    },
    {
      path: 'projects/hidden',
      data: { type: 'work', title: 'Secret', confidential: true },
    },
    {
      path: 'projects/archived',
      data: { type: 'work', title: 'Archive', archived: true },
    },
    {
      path: 'projects/merged',
      data: { type: 'work', title: 'Merged', mergedInto: 'p' },
    },
    {
      path: 'projects/locked',
      data: {
        type: 'work',
        title: 'Locked',
        mergeLock: { requestId: 'merge' },
      },
    },
    {
      path: 'projects/foreign',
      data: { title: 'Foreign', type: 'personal', createdBy: 'other' },
    },
    { path: 'projects/invalid', data: { title: 'Invalid', type: 'invalid' } },
    { path: 'projects/revoked', data: { type: 'work', title: 'Revoked' } },
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
    constraints: [{ field: '__name__', op: 'in', value: ids }],
  });
  expect(nativeCache.getDocsFromCache).toHaveBeenCalledWith({
    base: 'projects',
    constraints: [{ field: '__name__', op: '==', value: 'p' }],
  });
  expect(result.projects).toEqual([
    { id: 'p', label: 'Project', searchText: 'Project' },
  ]);
  expect(result.topics.map((topic) => topic.id)).toEqual([
    'active',
    'old',
    'alias',
  ]);
  expect(result.topics[1].selected).toEqual(selection.selectedTopics[0]);
  expect(result.topics[2].selected).toEqual(selection.selectedTopics[1]);
  expect(result.hidden).toBe(false);
});
it('retains current archived/locked project and selected retired topics without exposing confidential text', async () => {
  nativeCache.seed([
    {
      path: 'projects/p',
      data: {
        type: 'work',
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
      data: { title: 'Foreign', type: 'personal', createdBy: 'other' },
    },
    { path: 'projects/revoked', data: { type: 'work', title: 'Revoked' } },
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
      data: { type: 'work', title: id },
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
        { id: 'active' },
        { id: 'archive', archived: true },
        { id: 'merged', mergedIntoTopicId: 'active' },
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
          type: 'work',
          title: 'Project',
          topics: [{ id: 'old', archived: true }, { id: 'active' }],
        },
      },
    ],
    { ...selection, selectedTopics: topics },
    {
      title: 'Project',
      topics: [{ id: 'old', archived: true }, { id: 'active' }],
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
