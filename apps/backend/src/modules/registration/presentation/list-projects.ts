import { z } from 'zod';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  authorizeReport,
  type ReportAuth,
} from '../../reports/presentation/get-project-report.js';
import {
  ProjectManagementError,
  safeId,
} from '@work-track/core/registration/domain/project-management';

import type { Project } from '@work-track/core/registration/domain/work-model';
export interface ProjectsPageRepository {
  listProjectsPage(
    uid: string,
    input: z.infer<typeof listProjectsInput>,
  ): Promise<{ projects: Project[]; nextCursor: string | null }>;
}
export const listProjectsInput = z
  .object({
    scope: z.enum(['all', 'personal', 'work']).default('all'),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: safeId.optional(),
    includeArchived: z.boolean().default(false),
  })
  .strict();
export async function listProjectsHandler(
  repository: ProjectsPageRepository,
  data: unknown,
  auth?: ReportAuth,
) {
  authorizeReport(auth);
  const parsed = listProjectsInput.safeParse(data);
  if (!parsed.success)
    throw new HttpsError('invalid-argument', 'Consulta de projetos inválida.');
  try {
    return await repository.listProjectsPage(auth!.uid, parsed.data);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof ProjectManagementError)
      throw new HttpsError(error.code, error.message);
    throw new HttpsError('internal', 'Não foi possível listar projetos.');
  }
}
