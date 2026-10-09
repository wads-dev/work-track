import type { ProjectReportRepository } from '../../backend/src/modules/reports/domain/project-report';
import type { ClientPersonalReportRepository } from './personal-report-repository';
/** Personal project selection uses the full authorized owner context for personal-v3. */
export function personalProjectReportRepository(
  own: ClientPersonalReportRepository,
  uid: string,
): ProjectReportRepository {
  return {
    loadContext: async (uids, owner) => {
      if (owner !== uid || uids.some((value) => value !== uid))
        throw new Error('Contexto de projeto pessoal não autorizado.');
      return own.loadContext([uid]);
    },
    readPage: async (projectId, limit, cursor, viewerUid) => {
      if (viewerUid !== uid) throw new Error('Visualizador não autorizado.');
      const project = await own.readPersonalProject(projectId, uid);
      if (!project) return null;
      const records = (await own.loadContext([uid]))
        .filter((r) => r.projectId === projectId)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .filter((r) => !cursor || r.id > cursor);
      const page = records.slice(0, limit);
      return {
        records: page,
        personal: true,
        archived: Boolean(project.archived || project.mergedInto),
        topics: project.topics,
        topicLabels: Object.fromEntries(
          project.topics.map((t) => [t.id, t.title]),
        ),
        nextCursor: records.length > limit ? page.at(-1)!.id : null,
      };
    },
    userLabels: async (uids) => {
      if (uids.some((value) => value !== uid))
        throw new Error('Identidades de projeto pessoal não autorizadas.');
      return Object.fromEntries(uids.map((value) => [value, 'Você']));
    },
  };
}
