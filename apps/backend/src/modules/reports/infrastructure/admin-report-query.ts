import {
  FieldPath,
  type DocumentReference,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import type { ReportRecordSelection } from '@work-track/core/reports/domain/personal-report';

/** Registration/edit writes validate four-digit ISO dates with offsets. The report
 * codec only checks strings; this guard is a candidate query for those persisted
 * facts, not a replacement for schema/domain validation of returned records.
 * Two full days cover even +/-23:59 offsets accepted by the write schema, plus
 * truncation to a date prefix. Exact instant overlap stays in the repository.
 * Never add a lower startedAt bound: closed spans and old opens must survive.
 * A lower lexical endedAt bound cannot cover explicit null opens or safely
 * compare offset instants; exact overlap is validated in the repository.
 */
export function reportUpperDatePrefix(selection?: ReportRecordSelection) {
  if (!selection?.to) return undefined;
  const to = Date.parse(selection.to);
  if (!Number.isFinite(to)) throw new Error('Invalid report period.');
  const padded = new Date(to + 2 * 86400000).toISOString();
  // ISO write facts have four-digit years. At year 9999's edge, use an
  // all-inclusive string sentinel rather than a signed six-digit year prefix.
  return padded.startsWith('+') ? '\uf8ff' : padded.slice(0, 10);
}

export function orderReportQuery(query: Query, upper?: string) {
  if (upper) query = query.where('startedAt', '<', upper).orderBy('startedAt');
  return query.orderBy(FieldPath.documentId());
}

const cursorPrefix = 'report-date-v1:';
export function resumeReportQuery(
  query: Query,
  cursor: string | undefined,
  upper: string | undefined,
  reference?: (key: string) => DocumentReference,
) {
  if (!cursor) return query;
  if (!upper) return query.startAfter(reference ? reference(cursor) : cursor);
  try {
    if (!cursor.startsWith(cursorPrefix)) throw new Error();
    const decoded: unknown = JSON.parse(
      Buffer.from(cursor.slice(cursorPrefix.length), 'base64url').toString(
        'utf8',
      ),
    );
    if (!decoded || typeof decoded !== 'object') throw new Error();
    const data = decoded as Record<string, unknown>;
    if (
      data.upper !== upper ||
      typeof data.startedAt !== 'string' ||
      typeof data.key !== 'string' ||
      !data.key
    )
      throw new Error();
    return query.startAfter(
      data.startedAt,
      reference ? reference(data.key) : data.key,
    );
  } catch {
    throw new Error('Invalid dated report cursor.');
  }
}

export function nextReportCursor(
  doc: QueryDocumentSnapshot | undefined,
  upper: string | undefined,
  collectionGroup = false,
) {
  if (!doc) return null;
  const key = collectionGroup ? doc.ref.path : doc.id;
  if (!upper) return key;
  const startedAt: unknown = doc.data().startedAt;
  if (typeof startedAt !== 'string')
    throw new Error('Invalid report record date.');
  return (
    cursorPrefix +
    Buffer.from(JSON.stringify({ upper, startedAt, key })).toString('base64url')
  );
}

/** UID shards must use the same total order as every native query, including
 * equal date keys. Compare UTF-8 bytes to mirror Firestore string/name ordering.
 * This merge is pagination, not a residual business selection.
 */
export function compareReportDocuments(
  a: QueryDocumentSnapshot,
  b: QueryDocumentSnapshot,
  upper?: string,
) {
  if (upper) {
    const first = a.data().startedAt as string;
    const second = b.data().startedAt as string;
    const dateOrder = Buffer.compare(Buffer.from(first), Buffer.from(second));
    if (dateOrder) return dateOrder;
  }
  const firstPath = a.ref.path.split('/');
  const secondPath = b.ref.path.split('/');
  for (let i = 0; i < Math.min(firstPath.length, secondPath.length); i++) {
    const segmentOrder = Buffer.compare(
      Buffer.from(firstPath[i]!),
      Buffer.from(secondPath[i]!),
    );
    if (segmentOrder) return segmentOrder;
  }
  return firstPath.length - secondPath.length;
}
