import {
  runTransaction,
  type Firestore,
  type Transaction,
  type TransactionOptions,
} from 'firebase/firestore';
import { traceFirestore } from '../../data/sync/firestore-diagnostics';

/** Count accepted write calls only after the native transaction confirms its final attempt. */
export async function runMeasuredTransaction<T>(
  db: Firestore,
  operation: string,
  fn: (transaction: Transaction) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  let finalAttemptWrites = 0;
  const result = await runTransaction(
    db,
    async (tx) => {
      let attemptWrites = 0;
      const measured = new Proxy<Transaction>(tx, {
        get(target, property) {
          const value = Reflect.get(target, property, target);
          if (typeof value !== 'function') return value;
          if (
            property !== 'set' &&
            property !== 'update' &&
            property !== 'delete'
          )
            return value.bind(target);
          return (...args: unknown[]) => {
            const returned = Reflect.apply(value, target, args);
            attemptWrites += 1;
            // Keep chained calls on the proxy, with the SDK's original receiver.
            return returned === target ? measured : returned;
          };
        },
      });
      const value = await fn(measured);
      finalAttemptWrites = attemptWrites;
      return value;
    },
    options,
  );
  traceFirestore('transaction.commit', {
    operation,
    count: finalAttemptWrites,
    source: 'remote-confirmed',
  });
  return result;
}
