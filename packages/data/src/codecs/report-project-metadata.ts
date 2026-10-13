import { z } from 'zod';

export interface ReportProjectMetadata {
  type: string;
  createdBy?: string;
  archived?: boolean;
  mergedInto?: string;
  topics: { id: string; title: string; mergedIntoTopicId?: string }[];
}

/** These policies mirror the existing readers, not a migration/repair policy. */
export type ReportProjectMetadataMode =
  'admin' | 'personal-web' | 'authorized-web';

const topicsSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    mergedIntoTopicId: z.string().optional(),
  }),
);

function projectType(value: unknown): string {
  // Missing and malformed types are invalid; neither can grant shared access.
  return value === 'work' || value === 'personal' ? value : '__invalid__';
}

export function decodeReportProjectMetadata(
  data: Readonly<Record<string, unknown>>,
  mode: ReportProjectMetadataMode,
): ReportProjectMetadata {
  if (mode === 'authorized-web') {
    // Authorized listeners historically retain raw extras and unvalidated topics.
    return {
      ...data,
      type: projectType(data.type),
      topics: (Array.isArray(data.topics)
        ? data.topics
        : []) as ReportProjectMetadata['topics'],
    };
  }
  let topics: ReportProjectMetadata['topics'];
  if (mode === 'personal-web') {
    // Filter individual entries, retaining topic extras and historical alias values.
    const raw: unknown[] = Array.isArray(data.topics) ? data.topics : [];
    topics = raw.filter(
      (topic): topic is ReportProjectMetadata['topics'][number] => {
        if (!topic || typeof topic !== 'object') return false;
        const metadata = topic as Record<string, unknown>;
        return (
          typeof metadata.id === 'string' && typeof metadata.title === 'string'
        );
      },
    );
  } else {
    // Admin is deliberately all-or-none, including invalid alias metadata.
    const parsed = topicsSchema.safeParse(data.topics ?? []);
    topics = parsed.success ? parsed.data : [];
  }
  return {
    type: projectType(data.type),
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : undefined,
    archived: Boolean(data.archived),
    mergedInto:
      typeof data.mergedInto === 'string' ? data.mergedInto : undefined,
    topics,
  };
}
