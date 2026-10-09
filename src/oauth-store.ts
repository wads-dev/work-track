export interface OAuthStore {
  get<T>(collection: string, id: string): Promise<T | undefined>;
  put<T>(collection: string, id: string, value: T): Promise<void>;
  // Atomically validate and remove one-use credentials across all instances.
  consume<T>(
    collection: string,
    id: string,
    validate: (value: T) => void,
  ): Promise<T>;
  remove(collection: string, id: string): Promise<void>;
}
