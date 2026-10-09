import { HttpsError } from 'firebase-functions/v2/https';
import { ReportContextError } from '../domain/global-estimates.js';
import type { ProjectReportRepository } from '../domain/project-report.js';
import {
  getProjectReport,
  ReportRequestError,
} from '../application/get-project-report.js';
export interface ReportAuth {
  uid: string;
  token: {
    email?: unknown;
    email_verified?: unknown;
    firebase?: { sign_in_provider?: unknown };
  };
}
export function authorizeReport(auth?: ReportAuth): void {
  if (!auth)
    throw new HttpsError(
      'unauthenticated',
      'Entre com sua conta Google corporativa.',
    );
  if (
    typeof auth.token.email !== 'string' ||
    !/^[^@]+@wads[.]dev$/i.test(auth.token.email) ||
    auth.token.email_verified !== true ||
    auth.token.firebase?.sign_in_provider !== 'google.com'
  )
    throw new HttpsError(
      'permission-denied',
      'Use uma conta Google verificada @wads.dev.',
    );
}
export async function getProjectReportHandler(
  repository: ProjectReportRepository,
  data: unknown,
  auth?: ReportAuth,
  asOf = Date.now(),
) {
  authorizeReport(auth);
  try {
    return await getProjectReport(repository, data, asOf, auth!.uid);
  } catch (error) {
    if (error instanceof ReportContextError)
      throw new HttpsError('resource-exhausted', error.message);
    if (error instanceof ReportRequestError)
      throw new HttpsError(error.code, error.message);
    throw new HttpsError('internal', 'Não foi possível consultar o relatório.');
  }
}
