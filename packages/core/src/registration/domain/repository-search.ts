import type { Project } from './work-model.js';
import { canAccessProject } from './project-access.js';

export function repositoryIdentity(value: string): string {
  const term = value
    .trim()
    .replace(/^git@github\.com:/i, '')
    .replace(/^https:\/\/github\.com\//i, '')
    .replace(/^ssh:\/\/git@github\.com\//i, '')
    .replace(/\/$/, '')
    .replace(/\.git$/i, '')
    .toLowerCase();
  if (!/^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)?$/.test(term))
    throw new Error('Informe nome, owner/repo ou remote GitHub válido.');
  return term;
}
function similarity(a: string, b: string): number {
  const grams = (text: string) =>
    new Set(
      Array.from({ length: Math.max(0, text.length - 1) }, (_, i) =>
        text.slice(i, i + 2),
      ),
    );
  const x = grams(a),
    y = grams(b);
  return x.size + y.size
    ? (2 * [...x].filter((g) => y.has(g)).length) / (x.size + y.size)
    : Number(a === b);
}
export function searchRepositoryContext(
  projects: Project[],
  repository: string,
  uid: string,
  limit = 20,
) {
  const query = repositoryIdentity(repository);
  const matches = projects
    .filter((p) => canAccessProject(p, uid) && !p.archived && !p.mergedInto)
    .flatMap((project) => {
      const entries = [
        ...(project.githubUrl
          ? [{ githubUrl: project.githubUrl, topic: null }]
          : []),
        ...project.topics
          .filter((t) => t.githubUrl && !t.archived && !t.mergedIntoTopicId)
          .map((topic) => ({ githubUrl: topic.githubUrl!, topic })),
      ];
      return entries.flatMap(({ githubUrl, topic }) => {
        let identity: string;
        try {
          identity = repositoryIdentity(githubUrl);
        } catch {
          return [];
        }
        const name = identity.split('/').at(-1)!;
        const exact = query === identity;
        const nameExact = !query.includes('/') && query === name;
        const score = exact
          ? 1
          : nameExact
            ? 0.95
            : similarity(query, query.includes('/') ? identity : name) * 0.85;
        return score < 0.45
          ? []
          : [
              {
                projectId: project.id,
                projectTitle: project.title,
                topicId: topic?.id ?? null,
                topicTitle: topic?.title ?? null,
                githubUrl,
                matchType: exact
                  ? 'exact_repository'
                  : nameExact
                    ? 'exact_name'
                    : 'similar',
                score: Math.round(score * 1000) / 1000,
              },
            ];
      });
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.projectId.localeCompare(b.projectId) ||
        (a.topicId ?? '').localeCompare(b.topicId ?? ''),
    );
  return {
    matches: matches.slice(0, limit),
    hasMore: matches.length > limit,
    ambiguous: matches.length > 1 && matches[0]!.score === matches[1]!.score,
  };
}
