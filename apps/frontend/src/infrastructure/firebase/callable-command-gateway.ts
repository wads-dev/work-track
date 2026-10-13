import { httpsCallable, type Functions } from 'firebase/functions';
import type { CommandGateway } from '@work-track/core/contracts/command-gateway';
import { traceFirestore } from '../../data/sync/firestore-diagnostics';

/** Never translates server commands into direct Firestore writes. */
export class CallableCommandGateway implements CommandGateway {
  constructor(private readonly functions: Functions) {}
  async execute<Request, Response>(
    name: string,
    input: Request,
  ): Promise<Response> {
    traceFirestore('callable.start', { name });
    const result = await httpsCallable<Request, Response>(
      this.functions,
      name,
    )(input);
    traceFirestore('callable.result', {
      name,
      ...(Array.isArray(result.data) ? { count: result.data.length } : {}),
    });
    return result.data;
  }
}

/** Preserve the existing Callable envelope through the shared transport contract. */
export function createCallable<Request = unknown, Response = unknown>(
  functions: Functions,
  name: string,
) {
  const gateway = new CallableCommandGateway(functions);
  return async (input: Request): Promise<{ data: Response }> => ({
    data: await gateway.execute<Request, Response>(name, input),
  });
}
