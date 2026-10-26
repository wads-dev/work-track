import { z } from 'zod';
import {
  timeMultipliersSchema,
  type TimeMultipliers,
} from '@work-track/core/registration/domain/time-multipliers';

const metadataSchema = z.object({
  timeMultipliers: timeMultipliersSchema.optional(),
  type: z.enum(['personal', 'work']),
  createdBy: z.string(),
  archived: z.boolean(),
  confidential: z.boolean(),
  mergedInto: z.string().optional(),
  topics: z.array(
    z
      .object({
        id: z.string(),
        title: z.string(),
        archived: z.boolean(),
        mergedIntoTopicId: z.never().optional(),
      })
      .refine(
        (topic) => !Object.hasOwn(topic, 'mergedIntoTopicId'),
        'Aliases de tópicos não são suportados.',
      ),
  ),
});
export interface ReportProjectMetadata {
  timeMultipliers?: TimeMultipliers;
  type: string;
  createdBy?: string;
  archived: boolean;
  confidential: boolean;
  mergedInto?: string;
  topics: {
    id: string;
    title: string;
    archived: boolean;
    mergedIntoTopicId?: string;
  }[];
}
export type ReportProjectMetadataMode =
  'admin' | 'personal-web' | 'authorized-web';

/** Malformed storage is an explicit error, never an empty or repaired dataset. */
export function decodeReportProjectMetadata(
  data: Readonly<Record<string, unknown>>,
  _mode: ReportProjectMetadataMode,
): ReportProjectMetadata {
  return metadataSchema.parse(data);
}
