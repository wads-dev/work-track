import { httpsCallable, type Functions } from 'firebase/functions';
import { projectRepository } from './project-repository';
export function projectMutation<Request = unknown, Response = unknown>(
  functions: Functions,
  name: string,
) {
  const call = httpsCallable<Request, Response>(functions, name);
  return async (input: Request) => {
    try {
      return await call(input);
    } finally {
      if (!(
        typeof input === 'object' &&
        input !== null &&
        'confirmed' in input &&
        input.confirmed === false
      ))
        projectRepository.invalidate();
    }
  };
}
