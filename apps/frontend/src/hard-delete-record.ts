import { deleteDoc, doc, type Firestore } from 'firebase/firestore';

export async function hardDeleteRecord(
  db: Firestore,
  uid: string,
  recordId: string,
) {
  if (!uid || !recordId || uid.includes('/') || recordId.includes('/')) {
    throw new Error('Registro inválido.');
  }
  await deleteDoc(doc(db, 'users', uid, 'records', recordId));
}
