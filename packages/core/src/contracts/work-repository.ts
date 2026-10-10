import type { Project, Topic } from '../models/work.js';
import type {
  ProjectInput,
  TopicInput,
  RegisterInput,
} from '../schemas/registration.js';

/** Authoritative command implementation is server-side; clients use a command gateway. */
export interface WorkRepository {
  listProjects(uid: string): Promise<Project[]>;
  createProject(input: ProjectInput, uid: string): Promise<Project>;
  createTopic(input: TopicInput, uid: string): Promise<Topic>;
  register(input: RegisterInput, uid: string): Promise<Record<string, unknown>>;
}
