import { z } from 'zod';
import type { ReportSourceRecord } from '@work-track/core/reports/domain/project-report';

export type ReportRecordMode =
  | 'admin-owned'
  | 'admin-company'
  | 'admin-project'
  | 'authorized-web'
  | 'personal-web';

const fields = {
  projectId: z.string(),
  startedAt: z.string(),
  endedAt: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  timeZone: z.string(),
};
const nonnegativeTopics = z
  .array(
    z.object({
      topicId: z.string(),
      percentage: z.number().finite().nonnegative().optional(),
      durationMinutes: z.number().finite().nonnegative().optional(),
    }),
  )
  .default([]);
const legacyTopics = z
  .array(
    z.object({
      topicId: z.string(),
      percentage: z.number().optional(),
      durationMinutes: z.number().optional(),
    }),
  )
  .default([]);
const adminOwnedSchema = z.object({ ...fields, topics: nonnegativeTopics });
const adminCompanySchema = z.object({
  uid: z.string(),
  ...fields,
  topics: nonnegativeTopics,
});
const legacySchema = z.object({
  uid: z.string(),
  ...fields,
  topics: legacyTopics,
});
const personalTopics = z
  .custom<ReportSourceRecord['topics']>(
    (value) =>
      Array.isArray(value) &&
      (value as unknown[]).every((topic) => {
        if (!topic || typeof topic !== 'object') return false;
        const allocation = topic as Record<string, unknown>;
        return (
          typeof allocation.topicId === 'string' &&
          [allocation.percentage, allocation.durationMinutes].every(
            (number) =>
              number === undefined ||
              (typeof number === 'number' &&
                Number.isFinite(number) &&
                number >= 0),
          )
        );
      }),
  )
  .nullish()
  .transform((value) => value ?? []);
const personalWebSchema = z.object({
  ...fields,
  projectId: z.string().regex(/^[^/]+$/),
  topics: personalTopics,
});

/** No default mode: callers must preserve their reader's historical tolerance. */
export function reportRecordSchema(
  mode: 'admin-owned',
): typeof adminOwnedSchema;
export function reportRecordSchema(
  mode: 'admin-company',
): typeof adminCompanySchema;
export function reportRecordSchema(
  mode: 'admin-project' | 'authorized-web',
): typeof legacySchema;
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
      return legacySchema;
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
