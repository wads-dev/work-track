import { Link, Typography } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { isHidden } from './privacy';
import { objects, text } from './data';
import { topicDetailsPath } from './routes';
import { canonicalCatalogTopic } from './topic-details';
export function metadataNavigation(
  projectId: string,
  project: Record<string, unknown> | undefined,
  revealed: boolean,
  topicId?: string,
) {
  if (isHidden(project, revealed))
    return { label: topicId ? 'Assunto reservado' : 'Projeto reservado' };
  if (topicId) {
    const canonical = canonicalCatalogTopic(objects(project?.topics), topicId);
    if (!canonical) return { label: 'Assunto indisponível' };
    return {
      label: text(
        objects(project?.topics).find((t) => t.id === canonical)?.title,
        'Assunto',
      ),
      path: topicDetailsPath(projectId, canonical),
    };
  }
  return {
    label: text(project?.title, 'Projeto'),
    path: '/projects/' + encodeURIComponent(projectId),
  };
}
export function MetadataLink({
  projectId,
  project,
  revealed,
  topicId,
}: {
  projectId: string;
  project: Record<string, unknown> | undefined;
  revealed: boolean;
  topicId?: string;
}) {
  const location = useLocation();
  const value = metadataNavigation(projectId, project, revealed, topicId);
  return value.path ? (
    <Link
      component={RouterLink}
      to={
        value.path +
        '?returnTo=' +
        encodeURIComponent(location.pathname + location.search)
      }
      sx={{ overflowWrap: 'anywhere' }}
    >
      {value.label}
    </Link>
  ) : (
    <Typography component="span" sx={{ fontSize: 'inherit' }}>
      {value.label}
    </Typography>
  );
}
