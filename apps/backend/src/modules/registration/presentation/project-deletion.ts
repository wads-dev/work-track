import { z } from 'zod';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  authorizeReport,
  type ReportAuth,
} from '../../reports/presentation/get-project-report.js';
import type { FirestoreProjectDeletionRepository } from '../infrastructure/firestore-project-deletion.js';
const projectId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const exportInput = z.object({ projectId }).strict();
const deleteInput = z
  .object({
    projectId,
    snapshotToken: z.string().regex(/^[a-f0-9]{64}$/),
    confirmed: z.literal(true),
    downloadAttested: z.literal(true),
  })
  .strict();
export async function projectDeletionHandler(
  repository: Pick<
    FirestoreProjectDeletionRepository,
    'exportProject' | 'deleteProject'
  >,
  kind: 'export' | 'delete',
  data: unknown,
  auth?: ReportAuth,
) {
  authorizeReport(auth);
  const input = (kind === 'export' ? exportInput : deleteInput).safeParse(data);
  if (!input.success)
    throw new HttpsError(
      'invalid-argument',
      'Informe projeto; exclusão exige token da exportação, confirmação explícita e atestado de download (não comprova arquivo salvo).',
    );
  try {
    if (kind === 'export')
      return await repository.exportProject(input.data.projectId, auth!.uid);
    return await repository.deleteProject(
      input.data.projectId,
      auth!.uid,
      (input.data as z.infer<typeof deleteInput>).snapshotToken,
    );
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      'internal',
      'Falha na exportação/exclusão atômica; nenhuma exclusão parcial.',
    );
  }
}
