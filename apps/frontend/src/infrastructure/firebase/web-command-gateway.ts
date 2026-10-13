import type { CommandGateway } from '@work-track/core/contracts/command-gateway';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { WebWorkRepository } from './web-work-repository';
import { WebProjectScopeRepository } from './web-project-scope';
import { WebRecordMovementRepository } from './web-record-movement';
import { projectScopeInput } from '@work-track/core/registration/domain/project-scope';
import { moveRecordInput } from '@work-track/core/registration/domain/record-movement';
export const webCommandNames = new Set([
  'createProject',
  'archiveProject',
  'updateProject',
  'updateTopic',
  'changeProjectScope',
  'updateRecord',
  'moveRecord',
  'listTopicMerges',
]);
export class WebCommandGateway implements CommandGateway {
  constructor(private readonly functions: Functions) {}
  async execute<Request, Response>(
    name: string,
    input: Request,
  ): Promise<Response> {
    if (!webCommandNames.has(name))
      throw new Error(`Comando Web desconhecido ou não suportado: ${name}.`);
    const uid = getAuth(this.functions.app).currentUser?.uid;
    if (!uid) throw new Error('Autenticação necessária.');
    const db = getFirestore(this.functions.app),
      repository = new WebWorkRepository(db);
    try {
      switch (name) {
        case 'createProject':
          return (await repository.createProject(input, uid)) as Response;
        case 'archiveProject':
          return (await repository.archiveProject(input, uid)) as Response;
        case 'updateProject':
          return (await repository.updateProject(input, uid)) as Response;
        case 'updateTopic':
          return (await repository.updateTopic(input, uid)) as Response;
        case 'updateRecord':
          return (await repository.updateRecord(input, uid)) as Response;
        case 'listTopicMerges':
          return (await repository.listTopicMerges(input, uid)) as Response;
        case 'changeProjectScope':
          return (await new WebProjectScopeRepository(db).changeScope(
            projectScopeInput.parse(input),
            uid,
          )) as Response;
        case 'moveRecord':
          return (await new WebRecordMovementRepository(db).moveRecord(
            moveRecordInput.parse(input),
            uid,
          )) as Response;
        default:
          throw new Error('Comando Web desconhecido.');
      }
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        typeof error.code === 'string' &&
        !error.code.includes('/')
      ) {
        Object.defineProperty(error, 'code', {
          value: 'functions/' + error.code,
          configurable: true,
        });
      }
      throw error;
    }
  }
}
export function createWebCommand<Request = unknown, Response = unknown>(
  functions: Functions,
  name: string,
) {
  const gateway = new WebCommandGateway(functions);
  return async (input: Request): Promise<{ data: Response }> => ({
    data: await gateway.execute<Request, Response>(name, input),
  });
}
