import type {
  DocumentReadPort,
  ReadDocument,
} from '../ports/document-read-port.js';

export type DocumentDecoder<T> = (document: ReadDocument) => T | undefined;

/** Read-only injection seam. It neither stores results nor opens transactions. */
export class BaseReadRepository<T> {
  constructor(
    private readonly read: DocumentReadPort,
    private readonly decoder: DocumentDecoder<T>,
  ) {}

  async readMany(
    collectionPath: string,
    ids: readonly string[],
  ): Promise<Map<string, T>> {
    if (!ids.length) return new Map();
    const documents = await this.read.getMany(collectionPath, ids);
    const result = new Map<string, T>();
    for (const document of documents) {
      const value = this.decoder(document);
      if (value !== undefined) result.set(document.id, value);
    }
    return result;
  }
}
