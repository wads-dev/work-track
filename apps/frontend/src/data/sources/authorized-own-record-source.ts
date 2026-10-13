import type { Firestore, Unsubscribe } from 'firebase/firestore';
import { observeWorkspace } from '../sync/workspace-runtime';
import { traceFirestore } from '../sync/firestore-diagnostics';
import type { Row } from '../../shared/data';
export interface OwnRecordPage {
  rows: Row[];
  fromCache: boolean;
  hasMore: boolean;
  cursor: string;
}
/** Selection and pagination happen entirely on the complete materialization. */
export function subscribeAuthorizedOwnRecords(
  db: Firestore,
  uid: string,
  next: (page: OwnRecordPage) => void,
  fail: () => void,
  options: { size?: number; after?: string; openOnly?: boolean } = {},
): Unsubscribe {
  return observeWorkspace(db, uid, (snapshot) => {
    if (snapshot.error) {
      fail();
      return;
    }
    const all = (snapshot.complete ? snapshot.records : [])
      .filter(
        (r) =>
          r.data.uid === uid && (!options.openOnly || r.data.endedAt === null),
      )
      .map((r) => ({ id: r.path.split('/').at(-1)!, data: r.data }))
      .filter((r) => !options.after || r.id > options.after)
      .sort((a, b) => a.id.localeCompare(b.id));
    const rows = options.size ? all.slice(0, options.size) : all;
    traceFirestore('local.record.read', {
      collections: 'records',
      count: rows.length,
      complete: snapshot.complete,
      openOnly: Boolean(options.openOnly),
    });
    next({
      rows,
      fromCache: !snapshot.complete,
      hasMore: Boolean(options.size && all.length > options.size),
      cursor: rows.at(-1)?.id ?? options.after ?? '',
    });
  });
}
