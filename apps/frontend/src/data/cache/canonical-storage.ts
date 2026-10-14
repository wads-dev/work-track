/** Storage schema guards: absence is invalid, never an active/open default. */
export function canonicalProject(data: Record<string, unknown>) {
  return (
    typeof data.createdBy === 'string' &&
    (data.type === 'work' || data.type === 'personal') &&
    typeof data.archived === 'boolean' &&
    typeof data.confidential === 'boolean' &&
    Array.isArray(data.topics) &&
    data.topics.every(
      (topic) =>
        topic &&
        typeof topic === 'object' &&
        typeof topic.archived === 'boolean' &&
        !Object.hasOwn(topic, 'mergedIntoTopicId'),
    )
  );
}
export function canonicalRecord(data: Record<string, unknown>) {
  return (
    Object.hasOwn(data, 'deletedAt') &&
    data.deletedAt !== undefined &&
    (data.endedAt === null || typeof data.endedAt === 'string')
  );
}
