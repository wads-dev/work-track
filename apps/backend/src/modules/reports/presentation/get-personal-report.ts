import { HttpsError } from 'firebase-functions/v2/https';

import { ReportContextError } from '../domain/global-estimates.js';
import { z } from 'zod';
import { authorizeReport, type ReportAuth } from './get-project-report.js';
import type { PersonalReportRepository } from '../domain/personal-report.js';
import { executePersonalReport } from '../application/get-personal-report.js';
const schema = z
  .object({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    projectId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .optional(),
    timeZone: z
      .string()
      .max(100)
      .refine((zone) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      }),
    limit: z.number().int().min(1).max(500).default(200),
    includeArchived: z.boolean().default(false),
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .optional(),
  })
  .strict()
  .refine(
    (v) =>
      !v.from ||
      !v.to ||
      Boolean(
        v.from &&
        v.to &&
        Date.parse(v.to) > Date.parse(v.from) &&
        Date.parse(v.to) - Date.parse(v.from) <= (93 * 24 + 1) * 60 * 60000,
      ),
    'Período deve ter até 93 dias e 1 hora e fim posterior ao início.',
  );
export async function getPersonalReportHandler(
  repository: PersonalReportRepository,
  data: unknown,
  auth?: ReportAuth,
  asOf = Date.now(),
) {
  authorizeReport(auth);
  const input = schema.safeParse(data);
  if (!input.success)
    throw new HttpsError(
      'invalid-argument',
      'Período, fuso, limite ou cursor inválido.',
    );
  try {
    return await executePersonalReport(repository, input.data, auth!.uid, asOf);
  } catch (error) {
    if (error instanceof ReportContextError)
      throw new HttpsError('resource-exhausted', error.message);
    throw new HttpsError(
      'internal',
      'Não foi possível consultar o relatório pessoal.',
    );
  }
}
