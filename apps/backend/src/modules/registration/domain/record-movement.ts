import { z } from 'zod';
import { safeId } from './project-management.js';
const common = {
  project_target: safeId,
  subject_target: safeId.optional(),
  requestId: safeId,
  reason: z.string().trim().min(1).max(1000),
  confirmed: z.boolean().default(false),
  previewToken: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
};
export const moveSubjectInput = z
  .object({ ...common, project_origin: safeId, subject_origin: safeId })
  .strict()
  .refine((v) => !v.confirmed || !!v.previewToken, 'Confirmação exige prévia.');
export const moveRecordInput = z
  .object({ ...common, recordId: safeId })
  .strict()
  .refine((v) => !v.confirmed || !!v.previewToken, 'Confirmação exige prévia.');
export type MoveSubjectInput = z.infer<typeof moveSubjectInput>;
export type MoveRecordInput = z.infer<typeof moveRecordInput>;
export interface MovementRepository {
  moveSubject(
    input: MoveSubjectInput,
    uid: string,
  ): Promise<Record<string, unknown>>;
  moveRecord(
    input: MoveRecordInput,
    uid: string,
  ): Promise<Record<string, unknown>>;
}
