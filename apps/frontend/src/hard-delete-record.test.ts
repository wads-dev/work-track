import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteDoc, doc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { hardDeleteRecord } from './hard-delete-record';
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'record-ref'),
  deleteDoc: vi.fn(),
}));
const db = {} as Firestore;
describe('hard delete record from frontend', () => {
  beforeEach(() => vi.clearAllMocks());
  it('deletes the canonical own record without soft delete or backend call', async () => {
    await hardDeleteRecord(db, 'owner', 'record');
    expect(doc).toHaveBeenCalledWith(db, 'users', 'owner', 'records', 'record');
    expect(deleteDoc).toHaveBeenCalledExactlyOnceWith('record-ref');
  });
  it('propagates permission errors rather than claiming success', async () => {
    vi.mocked(deleteDoc).mockRejectedValueOnce({ code: 'permission-denied' });
    await expect(hardDeleteRecord(db, 'owner', 'record')).rejects.toEqual({
      code: 'permission-denied',
    });
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
  });
});
