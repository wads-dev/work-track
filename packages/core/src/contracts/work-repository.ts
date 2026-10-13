import type { Project, Topic } from '../models/work.js';
import type {
  ProjectInput,
  TopicInput,
  RegisterInput,
} from '../schemas/registration.js';

/** Dataset selection belongs to repositories, including fuzzy search's Firebase residual. */
export interface ProjectSelection {
  scope?: 'all' | 'personal' | 'work';
  includeArchived?: boolean;
  query?: string;
  limit?: number;
}
/** Authoritative command implementation is server-side; clients use a command gateway. */
export interface WorkRepository {
  searchRepositoryContext?(
    term: string,
    uid: string,
    limit: number,
  ): Promise<
    ReturnType<
      typeof import('../registration/domain/repository-search.js').searchRepositoryContext
    >
  >;
  updateTopic?: (
    input: import('../schemas/registration.js').UpdateTopicInput,
    uid: string,
  ) => Promise<Topic>;
  listRecentRecords?: import('../registration/domain/recent-records.js').RecentRecordsRepository['listRecentRecords'];
  listProjects(uid: string, selection?: ProjectSelection): Promise<Project[]>;
  createProject(input: ProjectInput, uid: string): Promise<Project>;
  createTopic(input: TopicInput, uid: string): Promise<Topic>;
  register(input: RegisterInput, uid: string): Promise<Record<string, unknown>>;
}
