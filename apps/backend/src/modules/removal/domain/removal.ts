import { z } from 'zod';
import { safeId } from '../../registration/domain/project-management.js';
export const removalInput = z
  .object({
    recordId: safeId,
    requestId: safeId,
    reason: z.string().trim().min(3).max(6000),
    confirmed: z.boolean().default(false),
    previewToken: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()
  .refine(
    (v) => !v.confirmed || !!v.previewToken,
    'Confirmação exige token da prévia.',
  );
export type RemovalInput = z.infer<typeof removalInput>;
export class RemovalError extends Error {
  constructor(
    readonly code: 'not-found' | 'failed-precondition' | 'aborted',
    message: string,
  ) {
    super(message);
  }
}
export interface RemovalResult {
  confirmed: boolean;
  recordId: string;
  operationId: string;
  previewToken: string;
  record: Record<string, unknown>;
  warnings: string[];
}
export interface RemovalRepository {
  removeRecord(
    input: RemovalInput,
    uid: string,
    now?: number,
  ): Promise<RemovalResult>;
}
