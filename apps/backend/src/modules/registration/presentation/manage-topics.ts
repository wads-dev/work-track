import { HttpsError } from 'firebase-functions/v2/https';
import {
  authorizeReport,
  type ReportAuth,
} from '../../reports/presentation/get-project-report.js';
import { ProjectManagementError } from '../domain/project-management.js';
import {
  mergeTopicsInput,
  listTopicMergesInput,
  type TopicManagementRepository,
} from '../domain/topic-management.js';
export async function manageTopicsHandler(
  repository: TopicManagementRepository,
  kind: 'merge' | 'history',
  data: unknown,
  auth?: ReportAuth,
) {
  authorizeReport(auth);
  try {
    if (kind === 'history') {
      const parsed = listTopicMergesInput.safeParse(data);
      if (!parsed.success)
        throw new HttpsError(
          'invalid-argument',
          'Consulta de auditoria inválida.',
        );
      return await repository.listTopicMerges(parsed.data, auth!.uid);
    }
    const parsed = mergeTopicsInput.safeParse(data);
    if (!parsed.success)
      throw new HttpsError(
        'invalid-argument',
        parsed.error.issues[0]?.message ?? 'Mesclagem inválida.',
      );
    return await repository.mergeTopics(parsed.data, auth!.uid);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof ProjectManagementError)
      throw new HttpsError(error.code, error.message);
    throw new HttpsError('internal', 'Não foi possível gerenciar tópicos.');
  }
}
