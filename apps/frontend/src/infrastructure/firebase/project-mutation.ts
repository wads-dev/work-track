import type { Functions } from 'firebase/functions';
import { WebCommandGateway } from './web-command-gateway';
import { projectRepository } from '../../data/cache/project-repository';
export function projectMutation<Request = unknown, Response = unknown>(
  functions: Functions,
  name: string,
) {
  const gateway = new WebCommandGateway(functions);
  return async (input: Request) => {
    try {
      return { data: await gateway.execute<Request, Response>(name, input) };
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
