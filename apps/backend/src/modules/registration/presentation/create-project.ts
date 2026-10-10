import { HttpsError } from 'firebase-functions/v2/https';
import {
  authorizeReport,
  type ReportAuth,
} from '../../reports/presentation/get-project-report.js';
import { ProjectManagementError } from '@work-track/core/registration/domain/project-management';
import {
  projectInput,
  type WorkRepository,
} from '@work-track/core/registration/domain/work-model';
export async function createProjectHandler(
  repository: Pick<WorkRepository, 'createProject'>,
  data: unknown,
  auth?: ReportAuth,
) {
  authorizeReport(auth);
  const parsed = projectInput.safeParse(data);
  if (!parsed.success)
    throw new HttpsError(
      'invalid-argument',
      'Informe explicitamente tipo personal (pessoal, somente proprietário) ou work (corporativo, compartilhado), título e descrição.',
    );
  try {
    return await repository.createProject(parsed.data, auth!.uid);
  } catch (error) {
    if (error instanceof ProjectManagementError)
      throw new HttpsError(error.code, error.message);
    throw new HttpsError('internal', 'Não foi possível criar projeto.');
  }
}
