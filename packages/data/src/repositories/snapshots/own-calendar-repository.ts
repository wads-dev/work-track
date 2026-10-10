import type { CalendarRepository } from '@work-track/core/reports/application/get-calendar-report';
import { ReportContextError } from '@work-track/core/reports/domain/global-estimates';
import type { ClientPersonalReportRepository } from './personal-report-repository.js';
/** Own facts remain directly readable; no corporate listing is authorized by current Rules. */
export function ownCalendarRepository(
  own: ClientPersonalReportRepository,
  viewerUid: string,
): CalendarRepository {
  return {
    own,
    company: {
      readPage: async () => {
        throw new ReportContextError(
          'Diretório corporativo indisponível para leitura direta pelas Rules atuais.',
        );
      },
      loadContext: async () => {
        throw new Error(
          'Contexto corporativo não autorizado neste repositório.',
        );
      },
      readTopics: async () => {
        throw new Error(
          'Tópicos corporativos não autorizados neste repositório.',
        );
      },
      archivedProjectIds: (ids) => own.archivedProjectIds(ids),
      userLabels: async (uids) => {
        if (uids.some((uid) => uid !== viewerUid))
          throw new Error('Identidade corporativa não autorizada.');
        return Object.fromEntries(uids.map((uid) => [uid, 'Você']));
      },
    },
    revalidate: async (records, uid, mode) => {
      if (uid !== viewerUid) throw new Error('Visualizador incompatível.');
      if (mode === 'global') {
        if (records.length)
          throw new Error('Registros corporativos não autorizados.');
        return [];
      }
      const visible = new Set(
        (await own.loadContext([viewerUid])).map((r) => r.id),
      );
      return records.filter((r) => r.uid === viewerUid && visible.has(r.id));
    },
  };
}
