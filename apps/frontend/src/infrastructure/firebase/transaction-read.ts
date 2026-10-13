import type {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Transaction,
} from 'firebase/firestore';
import { traceFirestore } from '../../data/sync/firestore-diagnostics';

/** Transactions always read remotely; diagnostics never inspect document data. */
export async function readTransaction<
  AppModelType,
  DbModelType extends DocumentData,
>(
  tx: Transaction,
  ref: DocumentReference<AppModelType, DbModelType>,
  operation: string,
): Promise<DocumentSnapshot<AppModelType, DbModelType>> {
  const detail = {
    operation,
    collection: ref.path.slice(0, ref.path.lastIndexOf('/')),
    path: ref.path,
    source: 'remote-transaction',
  };
  traceFirestore('transaction.read', detail);
  const snapshot = await tx.get(ref);
  traceFirestore('transaction.result', {
    ...detail,
    count: snapshot.exists() ? 1 : 0,
  });
  return snapshot;
}
