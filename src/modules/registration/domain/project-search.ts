import type { Project } from './work-model.js';
import { normalize } from '../../../shared/text/normalize.js';
function grams(text: string) {
  const result = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) result.add(text.slice(i, i + 2));
  return result;
}
function similarity(a: string, b: string) {
  const x = grams(a);
  const y = grams(b);
  if (!x.size || !y.size) return a === b ? 1 : 0;
  const intersection = [...x].filter((gram) => y.has(gram)).length;
  return (2 * intersection) / (x.size + y.size);
}
export function searchProjects(
  projects: Project[],
  query: string,
  limit: number,
) {
  const term = normalize(query);
  return projects
    .map((project) => {
      const title = normalize(project.title);
      const text = normalize(
        project.title +
          ' ' +
          project.description +
          ' ' +
          project.topics.map((topic) => topic.title).join(' '),
      );
      const words = term.split(' ').filter(Boolean);
      const coverage = words.length
        ? words.filter((word) => text.includes(word)).length / words.length
        : 0;
      const score = !term
        ? 1
        : title === term
          ? 1
          : Math.max(
              title.includes(term) ? 0.95 : 0,
              coverage * 0.8,
              similarity(title, term) * 0.85,
            );
      return { ...project, score: Math.round(score * 1000) / 1000 };
    })
    .filter((project) => !term || project.score >= 0.2)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}
