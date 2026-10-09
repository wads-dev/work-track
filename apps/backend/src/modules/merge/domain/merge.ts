import { z } from 'zod';
import { safeId } from '../../registration/domain/project-management.js';
export const mergeInput = z
  .object({
    sourceRecordId: safeId,
    targetRecordId: safeId,
    requestId: safeId,
    reason: z.string().trim().min(3).max(1000),
    confirmed: z.boolean().default(false),
    previewToken: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()
  .refine(
    (v) => v.sourceRecordId !== v.targetRecordId,
    'Origem e destino devem ser diferentes.',
  )
  .refine(
    (v) => !v.confirmed || !!v.previewToken,
    'Confirmação exige token da prévia.',
  );
export type MergeInput = z.infer<typeof mergeInput>;
export class MergeError extends Error {
  constructor(
    readonly code: 'not-found' | 'failed-precondition' | 'aborted',
    message: string,
  ) {
    super(message);
  }
}
export interface MergeResult {
  confirmed: boolean;
  operationId: string;
  previewToken: string;
  sourceRecordId: string;
  targetRecordId: string;
  totalMilliseconds: number;
  warnings: string[];
  target: Record<string, unknown>;
  source: Record<string, unknown>;
}
export interface MergeRepository {
  mergeRecords(
    input: MergeInput,
    uid: string,
    now?: number,
  ): Promise<MergeResult>;
}
