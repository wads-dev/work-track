import {
  applyRecordPatch,
  recordSummary,
  type UpdateRecordInput,
} from '@work-track/core/registration/domain/record-edit';
export function buildRecordEditPlan(
  before: Record<string, unknown>,
  input: UpdateRecordInput,
  uid: string,
  project: {
    title: string;
    description: string;
    topics: Array<{
      id: string;
      title: string;
      description: string;
      mergedIntoTopicId?: string;
      archived: boolean;
    }>;
  },
  updatedAt: string,
  corporateEdit = false,
) {
  const after = applyRecordPatch(before, input, uid, project, corporateEdit);
  const summary = recordSummary(after, input.recordId);
  const patch: Record<string, unknown> = { updatedAt, updatedBy: uid };
  for (const key of [
    'startedAt',
    'timeZone',
    'originalText',
    'interpretation',
    'interruptions',
    'commandAt',
  ] as const)
    if (input[key] !== undefined) patch[key] = input[key];
  if (input.endedAt !== undefined) patch.endedAt = input.endedAt;
  if (input.projectId !== undefined) {
    patch.projectId = input.projectId;
    patch.projectSnapshot = {
      title: project.title,
      description: project.description,
    };
  }
  if (input.topics !== undefined || input.projectId !== undefined) {
    patch.topics = summary.topics;
    patch.topicSnapshots = summary.topics.map((t) =>
      project.topics.find((k) => k.id === t.topicId),
    );
  }
  return {
    patch,
    summary,
    audit: {
      request: JSON.stringify(input),
      authorUid: uid,
      updatedAt,
      reason: input.reason,
      before,
      after: { ...after, ...patch },
      result: summary,
    },
  };
}
