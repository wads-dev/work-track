import { HttpsError } from 'firebase-functions/v2/https';
import {
  authorizeReport,
  type ReportAuth,
} from '../../reports/presentation/get-project-report.js';
import { ProjectManagementError } from '@work-track/core/registration/domain/project-management';
import {
  projectScopeInput,
  type ProjectScopeRepository,
} from '@work-track/core/registration/domain/project-scope';
export async function changeProjectScopeHandler(
  repository: ProjectScopeRepository,
  data: unknown,
  auth?: ReportAuth,
) {
  authorizeReport(auth);
  const input = projectScopeInput.safeParse(data);
  if (!input.success)
    throw new HttpsError(
      'invalid-argument',
      input.error.issues[0]?.message ?? 'Entrada inválida.',
    );
  try {
    return await repository.changeScope(input.data, auth!.uid);
  } catch (error) {
    if (error instanceof ProjectManagementError)
      throw new HttpsError(error.code, error.message);
    throw new HttpsError('internal', 'Não foi possível alterar o escopo.');
  }
}
