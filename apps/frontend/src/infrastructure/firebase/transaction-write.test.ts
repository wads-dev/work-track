import { beforeEach, expect, it, vi } from 'vitest';
import type {
  DocumentReference,
  DocumentSnapshot,
  FieldPath,
  Firestore,
  Transaction,
} from 'firebase/firestore';

const mocks = vi.hoisted(() => ({ runTransaction: vi.fn(), trace: vi.fn() }));
vi.mock('firebase/firestore', () => ({ runTransaction: mocks.runTransaction }));
vi.mock('../../data/sync/firestore-diagnostics', () => ({
  traceFirestore: mocks.trace,
}));
import { runMeasuredTransaction } from './transaction-write';
import { readTransaction } from './transaction-read';

const db = {} as Firestore;
const ref = { path: 'projects/private-project' } as DocumentReference;
const snapshot = { exists: () => true } as DocumentSnapshot;
const detail = (count: number) => ({
  operation: 'test-operation',
  count,
  source: 'remote-confirmed',
});

// Private fields require the real SDK receiver, including extracted method calls.
class NativeTransaction {
  #calls: Array<[string, unknown[]]> = [];
  readonly read = Promise.resolve(snapshot);
  get calls() {
    return this.#calls;
  }
  get(...args: unknown[]) {
    this.#calls.push(['get', args]);
    return this.read;
  }
  set(...args: unknown[]) {
    this.#calls.push(['set', args]);
    return this;
  }
  update(...args: unknown[]) {
    this.#calls.push(['update', args]);
    return this;
  }
  delete(...args: unknown[]) {
    this.#calls.push(['delete', args]);
    return this;
  }
}
const transaction = (native: NativeTransaction) =>
  native as unknown as Transaction;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  mocks.trace.mockReset();
  mocks.runTransaction.mockReset();
  mocks.runTransaction.mockImplementation(
    (_db: Firestore, fn: (tx: Transaction) => Promise<unknown>) =>
      fn(transaction(new NativeTransaction())),
  );
});

it('waits for native commit, forwards options unchanged and preserves the SDK result', async () => {
  const callbackDone = deferred<void>();
  const commit = deferred<void>();
  const returned = { privateResult: 'not logged' };
  const sdkResult = { nativeResult: 'not logged either' };
  const options = { maxAttempts: 3 };
  mocks.runTransaction.mockImplementation(async (_db, fn) => {
    expect(await fn(transaction(new NativeTransaction()))).toBe(returned);
    callbackDone.resolve();
    await commit.promise;
    return sdkResult;
  });
  const result = runMeasuredTransaction(
    db,
    'test-operation',
    async (tx) => {
      tx.set(ref, { secret: 'not logged' });
      return returned;
    },
    options,
  );
  await callbackDone.promise;
  expect(mocks.trace).not.toHaveBeenCalled();
  expect(mocks.runTransaction).toHaveBeenCalledExactlyOnceWith(
    db,
    expect.any(Function),
    options,
  );
  commit.resolve();
  expect(await result).toBe(sdkResult);
  expect(mocks.trace.mock.calls).toEqual([['transaction.commit', detail(1)]]);
});

it('counts only the final committed attempt rather than summing native retries', async () => {
  const attempts = [
    new NativeTransaction(),
    new NativeTransaction(),
    new NativeTransaction(),
  ];
  mocks.runTransaction.mockImplementation(async (_db, fn) => {
    for (const native of attempts.slice(0, -1)) await fn(transaction(native));
    return fn(transaction(attempts.at(-1)!));
  });
  let attempt = 0;
  const result = await runMeasuredTransaction(
    db,
    'test-operation',
    async (tx) => {
      attempt += 1;
      tx.set(ref, { attempt });
      if (attempt < 3) tx.update(ref, { secret: 'abandoned' }).delete(ref);
      return attempt;
    },
  );
  expect(result).toBe(3);
  expect(attempts.map((native) => native.calls.length)).toEqual([3, 3, 1]);
  expect(mocks.trace.mock.calls).toEqual([['transaction.commit', detail(1)]]);
});

it('resets discarded writes when the final attempt becomes an idempotent no-op', async () => {
  mocks.runTransaction.mockImplementation(async (_db, fn) => {
    await fn(transaction(new NativeTransaction()));
    return fn(transaction(new NativeTransaction()));
  });
  let attempt = 0;
  await runMeasuredTransaction(db, 'test-operation', async (tx) => {
    if (++attempt === 1) tx.set(ref, { secret: 'abandoned' }).delete(ref);
    return 'noop';
  });
  expect(mocks.trace.mock.calls).toEqual([['transaction.commit', detail(0)]]);
});

it.each(['preview', 'noop'])(
  'does not count read-only %s as writes',
  async (mode) => {
    const result = { mode };
    expect(
      await runMeasuredTransaction(db, 'test-operation', async (tx) => {
        expect(await tx.get(ref)).toBe(snapshot);
        return result;
      }),
    ).toBe(result);
    expect(mocks.trace.mock.calls).toEqual([['transaction.commit', detail(0)]]);
  },
);

it('preserves method binding, read promise identity, SDK overloads, order and chaining', async () => {
  const native = new NativeTransaction();
  mocks.runTransaction.mockImplementation((_db, fn) => fn(transaction(native)));
  const data = { secret: 'payload stays private' };
  const options = { merge: true };
  const field = {} as FieldPath;
  await runMeasuredTransaction(db, 'test-operation', async (tx) => {
    const get = tx.get;
    const promise = get(ref);
    expect(promise).toBe(native.read);
    expect(await promise).toBe(snapshot);
    const set = tx.set;
    expect(set(ref, data)).toBe(tx);
    expect(
      tx
        .set(ref, data, options)
        .update(ref, data)
        .update(ref, field, 'private-value', 'other-field', 5)
        .delete(ref),
    ).toBe(tx);
  });
  expect(native.calls).toEqual([
    ['get', [ref]],
    ['set', [ref, data]],
    ['set', [ref, data, options]],
    ['update', [ref, data]],
    ['update', [ref, field, 'private-value', 'other-field', 5]],
    ['delete', [ref]],
  ]);
  expect(mocks.trace.mock.calls).toEqual([['transaction.commit', detail(5)]]);
});

it('keeps read instrumentation and original parallel read batches ahead of commit', async () => {
  const otherRef = { path: 'projects/other' } as DocumentReference;
  const native = new NativeTransaction();
  mocks.runTransaction.mockImplementation((_db, fn) => fn(transaction(native)));
  await runMeasuredTransaction(db, 'test-operation', async (tx) => {
    await Promise.all(
      [ref, otherRef].map((r) => readTransaction(tx, r, 'test-operation')),
    );
    tx.delete(ref);
  });
  const readDetail = (r: DocumentReference) => ({
    operation: 'test-operation',
    collection: 'projects',
    path: r.path,
    source: 'remote-transaction',
  });
  expect(native.calls).toEqual([
    ['get', [ref]],
    ['get', [otherRef]],
    ['delete', [ref]],
  ]);
  expect(mocks.trace.mock.calls).toEqual([
    ['transaction.read', readDetail(ref)],
    ['transaction.read', readDetail(otherRef)],
    ['transaction.result', { ...readDetail(ref), count: 1 }],
    ['transaction.result', { ...readDetail(otherRef), count: 1 }],
    ['transaction.commit', detail(1)],
  ]);
});

it('propagates a callback abort after queued writes without a commit event', async () => {
  const error = new Error('callback aborted');
  await expect(
    runMeasuredTransaction(db, 'test-operation', async (tx) => {
      tx.set(ref, { secret: 'aborted' });
      throw error;
    }),
  ).rejects.toBe(error);
  expect(mocks.trace).not.toHaveBeenCalled();
});

it('propagates native commit rejection after retries without a commit event', async () => {
  const error = new Error('commit rejected');
  mocks.runTransaction.mockImplementation(async (_db, fn) => {
    await fn(transaction(new NativeTransaction()));
    await fn(transaction(new NativeTransaction()));
    throw error;
  });
  await expect(
    runMeasuredTransaction(db, 'test-operation', async (tx) => {
      tx.set(ref, { secret: 'rejected' });
      return 'callback succeeded';
    }),
  ).rejects.toBe(error);
  expect(mocks.trace).not.toHaveBeenCalled();
});

it('preserves synchronous native runTransaction failure without claiming a commit', async () => {
  const error = new Error('invalid transaction options');
  mocks.runTransaction.mockImplementation(() => {
    throw error;
  });
  const fn = vi.fn();
  await expect(runMeasuredTransaction(db, 'test-operation', fn)).rejects.toBe(
    error,
  );
  expect(fn).not.toHaveBeenCalled();
  expect(mocks.trace).not.toHaveBeenCalled();
});

it.each(['set', 'update', 'delete'] as const)(
  'preserves synchronous SDK %s errors',
  async (method) => {
    const error = new Error('invalid SDK write');
    const native = new NativeTransaction();
    vi.spyOn(native, method).mockImplementation(() => {
      throw error;
    });
    mocks.runTransaction.mockImplementation((_db, fn) =>
      fn(transaction(native)),
    );
    await expect(
      runMeasuredTransaction(db, 'test-operation', async (tx) => {
        if (method === 'delete') tx.delete(ref);
        else if (method === 'set') tx.set(ref, { secret: 'invalid' });
        else tx.update(ref, { secret: 'invalid' });
      }),
    ).rejects.toBe(error);
    expect(mocks.trace).not.toHaveBeenCalled();
  },
);

it('does not count a rejected write when the callback catches it and commits another write', async () => {
  const error = new Error('invalid SDK write');
  const native = new NativeTransaction();
  vi.spyOn(native, 'set').mockImplementationOnce(() => {
    throw error;
  });
  mocks.runTransaction.mockImplementation((_db, fn) => fn(transaction(native)));
  await runMeasuredTransaction(db, 'test-operation', async (tx) => {
    expect(() => tx.set(ref, { secret: 'invalid' })).toThrow(error);
    tx.delete(ref);
  });
  expect(mocks.trace.mock.calls).toEqual([['transaction.commit', detail(1)]]);
});
