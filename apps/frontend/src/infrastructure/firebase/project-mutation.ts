import type { Functions } from 'firebase/functions';
import { CallableCommandGateway } from './callable-command-gateway';
import { projectRepository } from '../../data/cache/project-repository';
export function projectMutation<Request = unknown, Response = unknown>(
  functions: Functions,
  name: string,
) {
  const gateway = new CallableCommandGateway(functions);
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
