/** SDK-neutral result. Missing documents are represented by absent data. */
export interface ReadDocument {
  readonly id: string;
  readonly data: Readonly<Record<string, unknown>> | undefined;
}

/** Only independent document reads; no cache, auth, query or transaction claims. */
export interface DocumentReadPort {
  getMany(
    collectionPath: string,
    ids: readonly string[],
  ): Promise<readonly ReadDocument[]>;
}
