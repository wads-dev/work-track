import { z } from 'zod';
import { safeId } from './project-management.js';
export const projectScopeInput = z
  .object({
    projectId: safeId,
    type: z.enum(['personal', 'work']),
    requestId: safeId,
    reason: z.string().trim().min(1).max(1000),
    confirmed: z.boolean().default(false),
    previewToken: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    acknowledgeSharedDestination: z.boolean().default(false),
  })
  .strict()
  .refine(
    (v) => !v.confirmed || Boolean(v.previewToken),
    'Confirmação exige prévia.',
  );
export type ProjectScopeInput = z.infer<typeof projectScopeInput>;
export interface ScopePreview {
  mode: 'preview';
  projectId: string;
  fromType: 'personal' | 'work';
  toType: 'personal' | 'work';
  recordCount: number;
  requiresSharingAcknowledgement: boolean;
  warnings: string[];
  previewToken: string;
}
export interface ScopeExecution {
  mode: 'execution';
  projectId: string;
  type: 'personal' | 'work';
  updatedAt: string;
}
export interface ProjectScopeRepository {
  changeScope(
    input: ProjectScopeInput,
    uid: string,
  ): Promise<ScopePreview | ScopeExecution>;
}
