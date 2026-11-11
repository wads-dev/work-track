export function preserveTopicDistributions(
  existing: unknown,
  ids: string[],
  catalog: unknown,
) {
  if (
    !Array.isArray(existing) ||
    !Array.isArray(catalog) ||
    new Set(ids).size !== ids.length
  )
    throw new Error('Tópicos inválidos.');
  const known = catalog as {
    id: string;
    archived?: boolean;
    mergedIntoTopicId?: string;
  }[];
  for (const id of ids)
    if (!known.some((t) => t.id === id && !t.archived && !t.mergedIntoTopicId))
      throw new Error('Tópico inexistente, arquivado ou alias.');
  const old = existing as {
    topicId: string;
    percentage?: number;
    durationMinutes?: number;
  }[];
  // A distributed record is ambiguous to remap without an explicit allocation.
  // This tool deliberately does not offer allocation editing, even by position.
  if (
    old.some(
      (t) => t.percentage !== undefined || t.durationMinutes !== undefined,
    ) &&
    (old.length !== ids.length || old.some((t, i) => t.topicId !== ids[i]))
  )
    throw new Error(
      'Distribuição incompatível; preserve este caso para conciliação explícita.',
    );
  return ids.map((topicId, i) => ({ ...old[i], topicId }));
}
