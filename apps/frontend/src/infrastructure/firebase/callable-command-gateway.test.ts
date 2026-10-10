import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ call: vi.fn(), factory: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.factory }));
import {
  CallableCommandGateway,
  createCallable,
} from './callable-command-gateway';
import type { Functions } from 'firebase/functions';
it('invokes a server command and returns only its transport data', async () => {
  mocks.factory.mockReturnValue(mocks.call);
  mocks.call.mockResolvedValue({ data: { id: 'p' } });
  const functions = {} as Functions;
  const gateway = new CallableCommandGateway(functions);
  const input = { requestId: 'retry-key' };
  expect(await gateway.execute('createProject', input)).toEqual({ id: 'p' });
  expect(mocks.factory).toHaveBeenCalledWith(functions, 'createProject');
  expect(mocks.call).toHaveBeenCalledWith(input);
});
it('preserves the server rejection without silently retrying or writing directly', async () => {
  const error = new Error('permission-denied');
  mocks.factory.mockReturnValue(mocks.call);
  mocks.call.mockRejectedValue(error);
  await expect(
    new CallableCommandGateway({} as Functions).execute('updateRecord', {}),
  ).rejects.toBe(error);
});
it('retains the data envelope for existing consumers through the gateway factory', async () => {
  mocks.factory.mockReturnValue(mocks.call);
  mocks.call.mockResolvedValue({ data: { mode: 'preview' } });
  const call = createCallable<{ requestId: string }, { mode: string }>(
    {} as Functions,
    'moveTopic',
  );
  expect(await call({ requestId: 'same-intent' })).toEqual({
    data: { mode: 'preview' },
  });
});
