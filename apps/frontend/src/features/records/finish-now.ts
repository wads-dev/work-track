import { isDeletedRecord } from '../../data/cache/record-deletion';
import { validateEnd } from './record-edit';
export function canFinishNow(
  record: Record<string, unknown> | null,
  uid: string,
) {
  return (
    !!record &&
    !!uid &&
    record.uid === uid &&
    !isDeletedRecord(record) &&
    (record.endedAt === undefined || record.endedAt === null)
  );
}
export function createFinishNowCommand() {
  let pending: {
    recordId: string;
    requestId: string;
    endedAt: string;
    reason: string;
    expectedUpdatedAt: string | null;
  } | null = null;
  let busy = false;
  return {
    async run(
      recordId: string,
      uid: string,
      record: Record<string, unknown> | null,
      send: (payload: NonNullable<typeof pending>) => Promise<unknown>,
      clock = () => new Date().toISOString(),
      id: () => string = () => crypto.randomUUID(),
    ) {
      if (busy || !canFinishNow(record, uid)) return false;
      busy = true;
      try {
        if (!pending || pending.recordId !== recordId)
          pending = {
            recordId,
            requestId: id(),
            endedAt: validateEnd(clock(), record!.startedAt)!,
            reason: 'Finalizado agora pelo usuário nos detalhes do registro.',
            expectedUpdatedAt:
              typeof record!.updatedAt === 'string' ? record!.updatedAt : null,
          };
        await send({ ...pending });
        pending = null;
        return true;
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'functions/aborted'
        )
          pending = null;
        throw error;
      } finally {
        busy = false;
      }
    },
  };
}
