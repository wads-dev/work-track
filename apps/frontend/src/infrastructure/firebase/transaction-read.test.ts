import { beforeEach, expect, it, vi } from 'vitest';
import type {
  DocumentReference,
  DocumentSnapshot,
  Transaction,
} from 'firebase/firestore';
const trace = vi.hoisted(() => vi.fn());
vi.mock('../../data/sync/firestore-diagnostics', () => ({
  traceFirestore: trace,
}));
import { readTransaction } from './transaction-read';
const ref = { path: 'users/actor/records/record' } as DocumentReference;
const detail = {
  operation: 'test-operation',
  collection: 'users/actor/records',
  path: ref.path,
  source: 'remote-transaction',
};
beforeEach(() => trace.mockReset());

it.each([true, false])(
  'preserves snapshot identity and logs count for existence %s without reading payload',
  async (exists) => {
    const data = vi.fn();
    const snapshot = {
      exists: () => exists,
      data,
      metadata: { fromCache: true },
    } as unknown as DocumentSnapshot;
    const get = vi.fn().mockResolvedValue(snapshot);
    expect(
      await readTransaction(
        { get } as unknown as Transaction,
        ref,
        'test-operation',
      ),
    ).toBe(snapshot);
    expect(get).toHaveBeenCalledExactlyOnceWith(ref);
    expect(data).not.toHaveBeenCalled();
    expect(trace.mock.calls).toEqual([
      ['transaction.read', detail],
      ['transaction.result', { ...detail, count: exists ? 1 : 0 }],
    ]);
  },
);

it('preserves the original transaction failure and never fabricates a result count', async () => {
  const error = new Error('permission-denied');
  const get = vi.fn().mockRejectedValue(error);
  await expect(
    readTransaction({ get } as unknown as Transaction, ref, 'test-operation'),
  ).rejects.toBe(error);
  expect(get).toHaveBeenCalledExactlyOnceWith(ref);
  expect(trace.mock.calls).toEqual([['transaction.read', detail]]);
});
