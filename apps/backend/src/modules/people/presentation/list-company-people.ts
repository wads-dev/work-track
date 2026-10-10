import { HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import {
  authorizeReport,
  type ReportAuth,
} from '../../reports/presentation/get-project-report.js';
import type { CompanyPeopleRepository } from '../domain/company-person.js';

const schema = z
  .object({
    pageToken: z.string().min(1).max(2048).optional(),
    pageSize: z.number().int().min(1).max(100).default(100),
  })
  .strict();

export async function listCompanyPeopleHandler(
  repository: CompanyPeopleRepository,
  data: unknown,
  auth?: ReportAuth,
) {
  authorizeReport(auth);
  const input = schema.safeParse(data);
  if (!input.success)
    throw new HttpsError('invalid-argument', 'Página ou limite inválido.');
  try {
    const page = await repository.readPage(
      input.data.pageSize,
      input.data.pageToken,
    );
    return {
      people: page.people.map((person) => ({
        uid: person.uid,
        displayName: person.displayName,
        email: person.email,
        photoURL: person.photoURL,
      })),
      nextPageToken: page.nextPageToken,
    };
  } catch {
    // Do not expose Admin Auth error messages, submitted tokens or credentials.
    throw new HttpsError(
      'internal',
      'Não foi possível consultar as pessoas da empresa.',
    );
  }
}
