import { HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { authorizeReport, type ReportAuth } from './get-project-report.js';
import type { PersonalReportRepository } from '../domain/personal-report.js';
import { buildPersonalReport } from '../domain/build-personal-report.js';
const schema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
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
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .optional(),
  })
  .strict()
  .refine(
    (v) =>
      Date.parse(v.to) > Date.parse(v.from) &&
      Date.parse(v.to) - Date.parse(v.from) <= (31 * 24 + 1) * 60 * 60000,
    'Período deve ter até31 dias e fim posterior ao início.',
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
    const page = await repository.readPage(
      auth!.uid,
      input.data.limit,
      input.data.cursor,
    );
    return buildPersonalReport(input.data, page, asOf);
  } catch {
    throw new HttpsError(
      'internal',
      'Não foi possível consultar o relatório pessoal.',
    );
  }
}
