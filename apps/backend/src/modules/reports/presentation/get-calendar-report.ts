import { HttpsError } from 'firebase-functions/v2/https';
import { authorizeReport, type ReportAuth } from './get-project-report.js';
import { ReportContextError } from '../domain/global-estimates.js';
import { calendarInput } from '../application/calendar-input.js';
import {
  executeCalendarReport,
  CalendarReportError,
  type CalendarRepository,
} from '../application/get-calendar-report.js';
export { calendarInput } from '../application/calendar-input.js';
export type { CalendarRepository } from '../application/get-calendar-report.js';
export async function getCalendarReportHandler(
  repository: CalendarRepository,
  data: unknown,
  auth?: ReportAuth,
  asOf = Date.now(),
) {
  authorizeReport(auth);
  const parsed = calendarInput.safeParse(data);
  if (!parsed.success)
    throw new HttpsError(
      'invalid-argument',
      'Seleção, pessoas, período ou fuso inválido.',
    );
  const input = parsed.data,
    uid = auth!.uid;
  if (input.mode === 'own' && input.userIds?.some((id) => id !== uid))
    throw new HttpsError(
      'permission-denied',
      'Modo próprio não permite consultar outras pessoas. Escolha Global explicitamente.',
    );
  try {
    return await executeCalendarReport(repository, input, uid, asOf);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof CalendarReportError)
      throw new HttpsError(error.code, error.message);
    if (error instanceof ReportContextError)
      throw new HttpsError('resource-exhausted', error.message);
    throw new HttpsError(
      'failed-precondition',
      'Não foi possível obter calendário completo e autorizado.',
    );
  }
}
