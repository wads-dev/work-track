import {
  collection,
  documentId,
  getDocsFromCache,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import { canAccessProject } from '@work-track/core/registration/domain/project-access';
import { objects, text, type Row } from '../../shared/data';
import { isHidden, safeProject } from '../../shared/ui/privacy';
import type { ProjectOption } from '../../features/projects/project-search';
import { traceFirestore } from '../sync/firestore-diagnostics';

export type EditorTopic = {
  topicId: string;
  percentage?: number;
  durationMinutes?: number;
};
export type EditorOptionsSelection = {
  projectId: string;
  revealed: boolean;
  selectedTopics: readonly EditorTopic[];
};
export type EditorOptions = {
  projects: ProjectOption[];
  topics: { id: string; title: string; selected?: EditorTopic }[];
  hidden: boolean;
};
export const emptyEditorOptions: EditorOptions = {
  projects: [],
  topics: [],
  hidden: true,
};

/** The parent document was already selected/authorized by the caller. Firestore
 * cannot project or query properties of maps inside the embedded topics array
 * (array-contains only compares complete values), including merged aliases. */
export function selectProjectTopics(project: Record<string, unknown>) {
  return objects(project.topics).filter((topic) => !topic.mergedIntoTopicId);
}

/** Residual over native-query candidates, also usable with prepared test data.
 * Firestore inequalities omit absent fields. Legacy archived/mergedInto/mergeLock
 * and confidential fields default to active/unmerged/unlocked/public, so their
 * falsy-or-absent predicates cannot be expressed by a Firestore query. Retaining
 * the current selected project intentionally overrides only these states, not ACL.
 * Embedded topic eligibility/retention has the array-of-map limitation above. */
export function prepareEditorOptions(
  authorizedCandidates: readonly Row[],
  selection: EditorOptionsSelection,
  selectedProject?: Record<string, unknown>,
): EditorOptions {
  const hidden = isHidden(selectedProject, selection.revealed);
  const selectedTopics = new Map(
    selection.selectedTopics.map((topic) => [topic.topicId, topic]),
  );
  return {
    hidden,
    projects: authorizedCandidates
      .filter(
        (row) =>
          row.id === selection.projectId ||
          (!isHidden(row.data, selection.revealed) &&
            !row.data.archived &&
            !row.data.mergedInto &&
            !row.data.mergeLock),
      )
      .map((row) => {
        const title = text(safeProject(row.data, selection.revealed).title);
        return { id: row.id, label: title, searchText: title };
      }),
    topics: hidden
      ? []
      : objects(selectedProject?.topics)
          .filter(
            (topic) =>
              (!topic.archived && !topic.mergedIntoTopicId) ||
              selectedTopics.has(text(topic.id, '')),
          )
          .map((topic) => ({
            id: text(topic.id),
            title: text(topic.title),
            selected: selectedTopics.get(text(topic.id, '')),
          })),
  };
}

/** Screen options query the native persistent cache by the current session ID
 * allowlist, then revalidate current parent ACLs. Never query remotely or create
 * an options listener; global workspace synchronization owns cache population. */
export class EditorOptionsRepository {
  constructor(
    private readonly db: Firestore,
    private readonly uid: string,
    private readonly authorizedIds: ReadonlySet<string>,
  ) {}

  async read(selection: EditorOptionsSelection): Promise<EditorOptions> {
    if (!this.uid) return emptyEditorOptions;
    // ID validation is a security boundary, not a business dataset filter.
    const ids = [...this.authorizedIds].filter((id) => id && !id.includes('/'));
    const rows: Row[] = [];
    for (let start = 0; start < ids.length; start += 30) {
      traceFirestore('cache.read', {
        collection: 'projects',
        source: 'editor-options',
      });
      const result = await getDocsFromCache(
        query(
          collection(this.db, 'projects'),
          where(documentId(), 'in', ids.slice(start, start + 30)),
        ),
      );
      traceFirestore('cache.result', {
        collection: 'projects',
        source: 'editor-options',
        count: result.size,
      });
      for (const document of result.docs) {
        const data = document.data();
        if (
          this.authorizedIds.has(document.id) &&
          canAccessProject(data, this.uid)
        )
          rows.push({ id: document.id, data });
      }
    }
    let selectedProject: Record<string, unknown> | undefined;
    if (
      selection.projectId &&
      !selection.projectId.includes('/') &&
      this.authorizedIds.has(selection.projectId)
    ) {
      traceFirestore('cache.read', {
        collection: 'projects',
        source: 'editor-options-parent',
      });
      const selected = await getDocsFromCache(
        query(
          collection(this.db, 'projects'),
          where(documentId(), '==', selection.projectId),
        ),
      );
      traceFirestore('cache.result', {
        collection: 'projects',
        source: 'editor-options-parent',
        count: selected.size,
      });
      const document = selected.docs[0];
      const data = document?.data();
      if (
        document?.id === selection.projectId &&
        data &&
        canAccessProject(data, this.uid)
      )
        selectedProject = data;
    }
    return prepareEditorOptions(rows, selection, selectedProject);
  }
}

/** Form-state command, not retrieval: preserve existing user-entered allocations
 * on checkbox changes and avoid duplicate assignments. */
export function setEditorTopicChecked(
  topics: readonly EditorTopic[],
  topicId: string,
  checked: boolean,
): EditorTopic[] {
  if (checked)
    return topics.some((topic) => topic.topicId === topicId)
      ? [...topics]
      : [...topics, { topicId }];
  return topics.filter((topic) => topic.topicId !== topicId);
}
