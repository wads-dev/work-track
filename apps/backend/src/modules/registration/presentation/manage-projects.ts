import { HttpsError } from 'firebase-functions/v2/https';
import {
  authorizeReport,
  type ReportAuth,
} from '../../reports/presentation/get-project-report.js';
import {
  ProjectManagementError,
  updateProjectInput,
  mergeProjectsInput,
  type ProjectManagementRepository,
} from '../domain/project-management.js';
export async function manageProjectHandler(
  repository: ProjectManagementRepository,
  kind: 'update' | 'merge',
  data: unknown,
  auth?: ReportAuth,
) {
  authorizeReport(auth);
  try {
    if (kind === 'update') {
      const input = updateProjectInput.safeParse(data);
      if (!input.success)
        throw new HttpsError(
          'invalid-argument',
          input.error.issues[0]?.message ?? 'Entrada inválida.',
        );
      return await repository.updateProject(input.data, auth!.uid);
    }
    const input = mergeProjectsInput.safeParse(data);
    if (!input.success)
      throw new HttpsError(
        'invalid-argument',
        input.error.issues[0]?.message ?? 'Entrada inválida.',
      );
    return await repository.mergeProjects(input.data, auth!.uid);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof ProjectManagementError)
      throw new HttpsError(error.code, error.message);
    throw new HttpsError('internal', 'Não foi possível gerenciar projetos.');
  }
}
