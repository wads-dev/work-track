import { HttpsError } from 'firebase-functions/v2/https';
import {
  authorizeReport,
  type ReportAuth,
} from '../../reports/presentation/get-project-report.js';
import {
  RecordEditError,
  updateRecordInput,
  type RecordEditingRepository,
} from '../domain/record-edit.js';
export async function updateRecordHandler(
  repository: RecordEditingRepository,
  data: unknown,
  auth?: ReportAuth,
) {
  authorizeReport(auth);
  const input = updateRecordInput.safeParse(data);
  if (!input.success)
    throw new HttpsError(
      'invalid-argument',
      input.error.issues[0]?.message ?? 'Alteração inválida.',
    );
  try {
    return await repository.updateRecord(input.data, auth!.uid);
  } catch (error) {
    if (error instanceof RecordEditError)
      throw new HttpsError(error.code, error.message);
    throw new HttpsError('internal', 'Não foi possível editar o registro.');
  }
}
