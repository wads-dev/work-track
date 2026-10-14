import { z } from 'zod';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';

export type ReportRecordMode =
  | 'admin-owned'
  | 'admin-company'
  | 'admin-project'
  | 'authorized-web'
  | 'personal-web';

const instant = z.iso.datetime({ offset: true });
const fields = {
  projectId: z.string().regex(/^[^/]+$/),
  startedAt: instant,
  endedAt: instant.nullable().transform((value) => value ?? undefined),
  deletedAt: z
    .unknown()
    .refine((value) => value !== undefined, 'deletedAt obrigatório'),
  timeZone: z.string().refine((zone) => {
    try {
      if (/^[+-]/.test(zone)) return false;
      new Intl.DateTimeFormat('en', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, 'Fuso IANA inválido'),
};
const topics = z.array(
  z.object({
    topicId: z.string(),
    percentage: z.number().finite().nonnegative().optional(),
    durationMinutes: z.number().finite().nonnegative().optional(),
  }),
);
const adminOwnedSchema = z.object({ ...fields, topics });
const adminCompanySchema = z.object({ uid: z.string(), ...fields, topics });
const personalWebSchema = adminOwnedSchema;

/** All reader modes enforce the same storage contract. */
export function reportRecordSchema(
  mode: 'admin-owned',
): typeof adminOwnedSchema;
export function reportRecordSchema(
  mode: 'admin-company',
): typeof adminCompanySchema;
export function reportRecordSchema(
  mode: 'admin-project' | 'authorized-web',
): typeof adminCompanySchema;
export function reportRecordSchema(
  mode: 'personal-web',
): typeof personalWebSchema;
export function reportRecordSchema(mode: ReportRecordMode) {
  switch (mode) {
    case 'admin-owned':
      return adminOwnedSchema;
    case 'admin-company':
      return adminCompanySchema;
    case 'admin-project':
    case 'authorized-web':
      return adminCompanySchema;
    case 'personal-web':
      return personalWebSchema;
  }
}

/** Owner comes from the scoped subscription, not an untrusted payload field. */
export function decodePersonalReportRecord(
  data: Readonly<Record<string, unknown>>,
  id: string,
  uid: string,
): ReportSourceRecord {
  const parsed = personalWebSchema.safeParse(data);
  if (!parsed.success) {
    const invalidFields = parsed.error.issues.some(
      (issue) => issue.path[0] !== 'topics',
    );
    throw new Error(
      invalidFields
        ? 'Contexto global contém registro inválido.'
        : 'Contexto global contém tópicos inválidos.',
    );
  }
  return { ...parsed.data, id, uid };
}
