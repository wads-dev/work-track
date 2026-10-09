import {
  projectInput,
  topicInput,
  registerInput,
  type RegisterInput,
  type WorkRepository,
} from '../domain/work-model.js';
import { searchProjects } from '../domain/project-search.js';
export class RegistrationService {
  constructor(private readonly repository: WorkRepository) {}
  async search(query: string, limit: number) {
    return {
      projects: searchProjects(
        await this.repository.listProjects(),
        query,
        limit,
      ),
    };
  }
  createProject(
    input: Parameters<WorkRepository['createProject']>[0],
    uid: string,
  ) {
    return this.repository.createProject(projectInput.parse(input), uid);
  }
  createTopic(
    input: { projectId: string; title: string; description: string },
    uid: string,
  ) {
    return this.repository.createTopic(topicInput.parse(input), uid);
  }
  register(input: RegisterInput, uid: string) {
    return this.repository.register(registerInput.parse(input), uid);
  }
}
