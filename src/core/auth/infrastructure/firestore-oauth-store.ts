import type { Firestore } from 'firebase-admin/firestore';
import { InvalidGrantError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthStore } from '../domain/oauth-store.js';

export class FirestoreOAuthStore implements OAuthStore {
  constructor(private readonly db: Firestore) {}
  private ref(collection: string, id: string) {
    return this.db.collection('oauth_' + collection).doc(id);
  }
  async get<T>(collection: string, id: string): Promise<T | undefined> {
    const snapshot = await this.ref(collection, id).get();
    return snapshot.exists ? (snapshot.data() as T) : undefined;
  }
  async put<T>(collection: string, id: string, value: T): Promise<void> {
    await this.ref(collection, id).set(
      JSON.parse(JSON.stringify(value)) as Record<string, unknown>,
    );
  }
  async consume<T>(
    collection: string,
    id: string,
    validate: (value: T) => void,
  ): Promise<T> {
    return this.db.runTransaction(async (transaction) => {
      const ref = this.ref(collection, id);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists)
        throw new InvalidGrantError('Credencial inválida ou já utilizada.');
      const value = snapshot.data() as T;
      validate(value);
      transaction.delete(ref);
      return value;
    });
  }
  async remove(collection: string, id: string): Promise<void> {
    await this.ref(collection, id).delete();
  }
}
