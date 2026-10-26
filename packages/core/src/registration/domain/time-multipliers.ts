import { z } from 'zod';

/** Explicit offset required: a contractual instant must not depend on browser timezone. */
export const timeMultiplierRuleSchema = z
  .object({
    multiplier: z.number().finite().nonnegative(),
    effectiveFrom: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export const timeMultiplierHistorySchema = z
  .array(timeMultiplierRuleSchema)
  .max(100)
  .superRefine((history, ctx) => {
    const dates = new Set<number | null>();
    history.forEach((rule, index) => {
      const instant =
        rule.effectiveFrom === null ? null : Date.parse(rule.effectiveFrom);
      if (dates.has(instant))
        ctx.addIssue({
          code: 'custom',
          path: [index, 'effectiveFrom'],
          message: 'Duplicate effective date for the same person.',
        });
      dates.add(instant);
    });
  });
export const timeMultipliersSchema = z
  .record(
    z
      .string()
      .min(1)
      .max(128)
      .refine(
        (id) => !['__proto__', 'constructor', 'prototype'].includes(id),
        'Invalid user ID.',
      ),
    timeMultiplierHistorySchema,
  )
  .superRefine((value, ctx) => {
    if (Object.keys(value).length > 200)
      ctx.addIssue({
        code: 'custom',
        message: 'At most 200 people per project.',
      });
  });
export type TimeMultiplierRule = z.infer<typeof timeMultiplierRuleSchema>;
export type TimeMultipliers = z.infer<typeof timeMultipliersSchema>;

/** Resolve ONLY at the original record start. Never at the report crop, end, or now.
 * A dated rule overrides the timeless base; omitted rules default to 1.
 * Input order is irrelevant; ambiguous duplicate instants fail validation.
 */
export function resolveTimeMultiplier(
  history: readonly TimeMultiplierRule[] | undefined,
  startedAt: string,
) {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start))
    throw new Error('Invalid original record start.');
  let multiplier = 1,
    latest = -Infinity;
  for (const rule of timeMultiplierHistorySchema.parse(history ?? [])) {
    if (rule.effectiveFrom === null) {
      if (latest === -Infinity) multiplier = rule.multiplier;
    } else {
      const effective = Date.parse(rule.effectiveFrom);
      if (effective <= start && effective > latest) {
        latest = effective;
        multiplier = rule.multiplier;
      }
    }
  }
  return multiplier;
}
