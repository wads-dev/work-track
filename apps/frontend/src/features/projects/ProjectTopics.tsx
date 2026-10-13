import type { Functions } from 'firebase/functions';
import { ExternalLink } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { text } from '../../shared/data';
import { selectProjectTopics } from '../../data/repositories/editor-options-repository';
import { githubUrl as githubSchema } from '@work-track/core/registration/domain/project-management';
import { useLocation } from 'react-router-dom';
import { topicDetailsPath } from '../../app/routes';

export function ProjectTopics({
  projectId,
  project,
}: {
  functions: Functions;
  projectId: string;
  project: Record<string, unknown>;
}) {
  const location = useLocation();
  const topics = selectProjectTopics(project);
  return (
    <section
      aria-label="Tópicos do projeto"
      className="rounded-xl border bg-card p-4 sm:p-5"
    >
      <h3 className="mb-3 text-lg font-semibold">
        Tópicos{' '}
        <span className="text-sm font-normal text-muted-foreground">
          {topics.length}
        </span>
      </h3>
      {topics.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum tópico.</p>
      ) : (
        <ul className="divide-y">
          {topics.map((topic, index) => {
            const github = text(topic.githubUrl, '');
            const safeExternalLink = githubSchema.safeParse(github).success;
            return (
              <li
                key={text(topic.id, String(index))}
                className="flex min-w-0 items-center justify-between gap-3 py-2.5"
              >
                <RouterLink
                  to={
                    topicDetailsPath(projectId, text(topic.id)) +
                    '?returnTo=' +
                    encodeURIComponent(location.pathname + location.search)
                  }
                  className="min-w-0 text-sm hover:underline [overflow-wrap:anywhere]"
                >
                  {text(topic.title)}
                </RouterLink>
                {!safeExternalLink && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Sem GitHub
                  </span>
                )}
                {safeExternalLink && (
                  <a
                    href={github}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={'GitHub de ' + text(topic.title)}
                    title={github}
                    className="flex shrink-0 items-center gap-2 rounded-md p-2 text-muted-foreground hover:bg-muted"
                  >
                    <ExternalLink className="size-4" aria-hidden="true" />
                    <span className="hidden text-xs sm:inline">
                      {github.replace('https://github.com/', '')}
                    </span>
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
