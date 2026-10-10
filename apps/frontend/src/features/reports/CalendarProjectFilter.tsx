import { ProjectSelector } from '../projects/ProjectSelector';
import type { ProjectOption } from '../projects/project-search';
export function CalendarProjectFilter(props: {
  projects: ProjectOption[];
  projectId: string;
  loading: boolean;
  error: string;
  onChange: (id: string) => void;
}) {
  return <ProjectSelector {...props} />;
}
