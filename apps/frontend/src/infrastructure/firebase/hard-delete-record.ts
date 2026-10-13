import { deleteDoc, doc, type Firestore } from 'firebase/firestore';
import { traceFirestore } from '../../data/sync/firestore-diagnostics';

export async function hardDeleteRecord(
  db: Firestore,
  uid: string,
  recordId: string,
) {
  if (!uid || !recordId || uid.includes('/') || recordId.includes('/')) {
    throw new Error('Registro inválido.');
  }
  await deleteDoc(doc(db, 'users', uid, 'records', recordId));
  traceFirestore('write.confirmed', {
    count: 1,
    operation: 'hard-delete-record',
    source: 'remote-confirmed',
  });
}
