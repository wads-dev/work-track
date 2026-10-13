/* eslint-disable @typescript-eslint/require-await -- Test doubles preserve async repository rejection contracts without database I/O. */
import type { ProjectReportRepository } from '@work-track/core/reports/domain/project-report';
import type { ClientPersonalReportRepository } from './personal-report-repository.js';
/** TEST DOUBLE ONLY. Personal selection stays separate from full personal-v3 context. */
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
    readPage: async (projectId, limit, cursor, viewerUid, selection) => {
      if (viewerUid !== uid) throw new Error('Visualizador não autorizado.');
      const project = await own.readPersonalProject(projectId, uid);
      if (!project) return null;
      const page = await own.readPage(uid, limit, cursor, {
        ...selection,
        projectId,
        includeArchived: selection ? selection.includeArchived : true,
      });
      return {
        records: page.records,
        personal: true,
        archived: Boolean(project.archived || project.mergedInto),
        topics: project.topics,
        topicLabels: Object.fromEntries(
          project.topics.map((t) => [t.id, t.title]),
        ),
        nextCursor: page.nextCursor,
      };
    },
    userLabels: async (uids) => {
      if (uids.some((value) => value !== uid))
        throw new Error('Identidades de projeto pessoal não autorizadas.');
      return Object.fromEntries(uids.map((value) => [value, 'Você']));
    },
  };
}
