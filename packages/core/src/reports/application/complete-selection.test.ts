import { expect, it, vi } from 'vitest';
import { completeSelection } from './complete-selection.js';
it('bounds empty physical pages without claiming partial totals and rejects repeated cursors', async () => {
  let page = 0;
  const read = vi.fn(() =>
    Promise.resolve({ records: [], nextCursor: String(++page) }),
  );
  await expect(completeSelection(read)).rejects.toThrow('20 páginas físicas');
  expect(read).toHaveBeenCalledTimes(20);
  await expect(
    completeSelection(() =>
      Promise.resolve({ records: [], nextCursor: 'same' }),
    ),
  ).rejects.toThrow('Cursor repetido');
});
it('reads every selected page and returns complete totals metadata', async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce({ records: ['first'], nextCursor: 'first' })
    .mockResolvedValueOnce({ records: ['last'], nextCursor: null });
  expect(await completeSelection(read)).toEqual({
    records: ['first', 'last'],
    scannedCount: 2,
    nextCursor: null,
  });
  expect(read).toHaveBeenLastCalledWith('first');
});
