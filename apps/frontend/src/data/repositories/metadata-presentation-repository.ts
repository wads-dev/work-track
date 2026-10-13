import { ProjectAppearance } from '@work-track/core/registration/domain/project-color';
import { objects, text, type Row } from '../../shared/data';
import { safeProject } from '../../shared/ui/privacy';
import { canonicalCatalogTopic } from './browser-detail-repository';

/** Presentation joins over the complete, already authorized/selected parent
 * documents. This is not a screen dataset query or a second snapshot cache:
 * parent document selection/ACL checks belong to the native cache repository.
 * Firestore cannot project or query an element by ID inside the embedded topics
 * array (nor follow mergedIntoTopicId chains). That unsupported subdocument
 * lookup is resolved here, without additional local/remote reads or listeners.
 */
export function readTopicMetadata(
  project: Record<string, unknown> | undefined,
  requestedTopicId: string,
): { id: string; title: string } | undefined {
  const topics = objects(project?.topics);
  const canonical = canonicalCatalogTopic(topics, requestedTopicId);
  if (!canonical) return undefined;
  const byId = new Map(topics.map((topic) => [text(topic.id, ''), topic]));
  const topic = byId.get(canonical);
  return topic
    ? { id: canonical, title: text(topic.title, 'Tópico') }
    : undefined;
}

/** Validate chart amounts and join already authorized person identities. This
 * does not select activities: project/topic labels and navigation are passed
 * through exactly as projected by the caller's confidentiality/ACL boundary.
 */
export function chartPresentation<
  T extends {
    kind?: 'person' | 'project' | 'topic';
    uid?: string;
    label: string;
    minutes: number;
  },
>(data: readonly T[], personName: (uid: string) => string | undefined): T[] {
  return data
    .filter((item) => Number.isFinite(item.minutes) && item.minutes > 0)
    .map((item) =>
      item.uid && (!item.kind || item.kind === 'person')
        ? { ...item, label: personName(item.uid) || 'Pessoa da empresa' }
        : item,
    );
}

/** Keyed presentation metadata, never a replacement for supported Firestore
 * project selection. Do not pass a filtered/paginated color catalog. Maps are
 * request-local joins; they retain no data between renders/accounts/ACL updates.
 */
export function createMetadataPresentationRepository(
  catalog: readonly Row[],
  revealed: boolean,
) {
  const byId = new Map(
    catalog.map((row) => {
      const project = safeProject(row.data, revealed);
      return [
        row.id,
        {
          id: row.id,
          project,
          topics: objects(project.topics),
          color: project.color,
        },
      ] as const;
    }),
  );
  const colors = Array.from(byId.values(), ({ id, color }) => ({ id, color }));
  return {
    project: (id: string) => byId.get(id),
    color: (id: string) =>
      new ProjectAppearance(byId.get(id) ?? { id }).getColor(colors),
  };
}
