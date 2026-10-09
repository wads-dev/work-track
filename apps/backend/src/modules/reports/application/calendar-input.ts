import { z } from 'zod';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const calendarInput = z
  .object({
    mode: z.enum(['own', 'global']).default('own'),
    userIds: z
      .array(id)
      .min(1)
      .max(10)
      .refine((v) => new Set(v).size === v.length)
      .optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    allWeeks: z.boolean().default(false),
    topicId: id.optional(),
    timeZone: z
      .string()
      .max(100)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }),
    projectId: id.optional(),
    includeArchived: z.boolean().default(false),
  })
  .strict()
  .refine(
    (v) =>
      (!v.topicId || Boolean(v.projectId)) &&
      (v.allWeeks
        ? Boolean(v.projectId) && v.from === undefined && v.to === undefined
        : Boolean(
            v.from &&
            v.to &&
            Date.parse(v.to) > Date.parse(v.from) &&
            Date.parse(v.to) - Date.parse(v.from) <= (93 * 24 + 1) * 3600000,
          )),
    'Período até93dias+1h; todas semanas exige projeto e omissão de datas; tópico exige projeto.',
  );
export type CalendarInput = z.infer<typeof calendarInput>;
