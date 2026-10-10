import { z } from 'zod';
import { safeId } from './project-management.js';
const common = {
  project_target: safeId,
  topic_target: safeId.optional(),
  requestId: safeId,
  reason: z.string().trim().min(1).max(1000),
  confirmed: z.boolean().default(false),
  previewToken: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
};
export const moveTopicInput = z
  .object({ ...common, project_origin: safeId, topic_origin: safeId })
  .strict()
  .refine((v) => !v.confirmed || !!v.previewToken, 'Confirmação exige prévia.');
export const moveRecordInput = z
  .object({ ...common, recordId: safeId, recordOwnerUid: safeId.optional() })
  .strict()
  .refine((v) => !v.confirmed || !!v.previewToken, 'Confirmação exige prévia.');
export type MoveTopicInput = z.infer<typeof moveTopicInput>;
export type MoveRecordInput = z.infer<typeof moveRecordInput>;
export interface MovementRepository {
  moveTopic(
    input: MoveTopicInput,
    uid: string,
  ): Promise<Record<string, unknown>>;
  moveRecord(
    input: MoveRecordInput,
    uid: string,
  ): Promise<Record<string, unknown>>;
}
