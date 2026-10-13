import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteDoc, doc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { hardDeleteRecord } from './hard-delete-record';
const trace = vi.hoisted(() => vi.fn());
vi.mock('../../data/sync/firestore-diagnostics', () => ({
  traceFirestore: trace,
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'record-ref'),
  deleteDoc: vi.fn(),
}));
const db = {} as Firestore;
describe('hard delete record from frontend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deleteDoc).mockReset();
  });
  it('deletes the canonical own record without soft delete or backend call', async () => {
    await hardDeleteRecord(db, 'owner', 'record');
    expect(doc).toHaveBeenCalledWith(db, 'users', 'owner', 'records', 'record');
    expect(deleteDoc).toHaveBeenCalledExactlyOnceWith('record-ref');
    expect(trace.mock.calls).toEqual([
      [
        'write.confirmed',
        {
          count: 1,
          operation: 'hard-delete-record',
          source: 'remote-confirmed',
        },
      ],
    ]);
  });
  it('propagates permission errors rather than claiming success', async () => {
    vi.mocked(deleteDoc).mockRejectedValueOnce({ code: 'permission-denied' });
    await expect(hardDeleteRecord(db, 'owner', 'record')).rejects.toEqual({
      code: 'permission-denied',
    });
    expect(trace).not.toHaveBeenCalled();
  });
  it('waits for deleteDoc confirmation before logging the write', async () => {
    let confirm!: () => void;
    vi.mocked(deleteDoc).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          confirm = resolve;
        }),
    );
    const result = hardDeleteRecord(db, 'owner', 'record');
    expect(deleteDoc).toHaveBeenCalledExactlyOnceWith('record-ref');
    expect(trace).not.toHaveBeenCalled();
    confirm();
    await result;
    expect(trace.mock.calls).toEqual([
      [
        'write.confirmed',
        {
          count: 1,
          operation: 'hard-delete-record',
          source: 'remote-confirmed',
        },
      ],
    ]);
  });
  it('preserves synchronous SDK errors without logging success', async () => {
    const error = new Error('invalid SDK reference');
    vi.mocked(deleteDoc).mockImplementationOnce(() => {
      throw error;
    });
    await expect(hardDeleteRecord(db, 'owner', 'record')).rejects.toBe(error);
    expect(trace).not.toHaveBeenCalled();
  });
  it('rejects missing or nested identifiers before deleting', async () => {
    for (const [uid, id] of [
      ['', 'record'],
      ['owner', ''],
      ['other/user', 'record'],
      ['owner', 'nested/record'],
    ]) {
      await expect(hardDeleteRecord(db, uid, id)).rejects.toThrow(
        'Registro inválido',
      );
    }
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(doc).not.toHaveBeenCalled();
    expect(trace).not.toHaveBeenCalled();
  });
});
