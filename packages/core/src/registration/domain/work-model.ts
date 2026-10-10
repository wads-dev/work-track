/** Compatibility subpath; definitions live in models, schemas and contracts. */
export type { Project, Topic } from '../../models/work.js';
export {
  projectInput,
  topicInput,
  registerInput,
} from '../../schemas/registration.js';
export type {
  ProjectInput,
  TopicInput,
  RegisterInput,
} from '../../schemas/registration.js';
export type { WorkRepository } from '../../contracts/work-repository.js';
