import { z } from 'zod';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  authorizeReport,
  type ReportAuth,
} from '../../reports/presentation/get-project-report.js';
import {
  ProjectManagementError,
  safeId,
} from '../domain/project-management.js';
import {
  canAccessProject,
  effectiveProjectType,
} from '../domain/project-access.js';
import type { WorkRepository } from '../domain/work-model.js';
export const listProjectsInput = z
  .object({
    scope: z.enum(['all', 'personal', 'work']).default('all'),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: safeId.optional(),
    includeArchived: z.boolean().default(false),
  })
  .strict();
export async function listProjectsHandler(
  repository: Pick<WorkRepository, 'listProjects'>,
  data: unknown,
  auth?: ReportAuth,
) {
  authorizeReport(auth);
  const parsed = listProjectsInput.safeParse(data);
  if (!parsed.success)
    throw new HttpsError('invalid-argument', 'Consulta de projetos inválida.');
  try {
    const input = parsed.data;
    const visible = (await repository.listProjects(auth!.uid))
      .filter(
        (p) =>
          canAccessProject(p, auth!.uid) &&
          (input.scope === 'all' || effectiveProjectType(p) === input.scope) &&
          (input.includeArchived || (!p.archived && !p.mergedInto)),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    const offset = input.cursor
      ? visible.findIndex((p) => p.id === input.cursor) + 1
      : 0;
    if (input.cursor && offset === 0)
      throw new HttpsError('invalid-argument', 'Cursor inválido.');
    const projects = visible.slice(offset, offset + input.limit);
    return {
      projects,
      nextCursor:
        offset + projects.length < visible.length ? projects.at(-1)!.id : null,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof ProjectManagementError)
      throw new HttpsError(error.code, error.message);
    throw new HttpsError('internal', 'Não foi possível listar projetos.');
  }
}
