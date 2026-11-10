import { createHash } from 'node:crypto';
import {
  FieldPath,
  type Firestore,
  type Query,
} from 'firebase-admin/firestore';
import {
  canAccessProject,
  effectiveProjectType,
} from '@work-track/core/registration/domain/project-access';
import { reportUpperDatePrefix } from '../../reports/infrastructure/admin-report-query.js';
import type { ListRecordsInput } from '../presentation/historical-record-tools.js';

const budget = 10000;
export class FirestoreHistoricalRecordsRepository {
  constructor(private readonly db: Firestore) {}

  async listRecords(input: ListRecordsInput, uid: string) {
    const owner = input.recordOwnerUid ?? uid;
    let query: Query = this.db
      .collection('users')
      .doc(owner)
      .collection('records')
      .where('uid', '==', owner)
      .where('deletedAt', '==', null);
    if (input.projectId)
      query = query.where('projectId', '==', input.projectId);
    const upper = reportUpperDatePrefix({ to: input.to });
    if (upper)
      query = query.where('startedAt', '<', upper).orderBy('startedAt');
    query = query.orderBy(FieldPath.documentId());
    // Stored ISO strings retain offsets: exact instant overlap cannot be expressed
    // by lexical Firestore inequalities. topics is an array of maps with optional
    // distributions: Firestore has no array-element topicId predicate. Apply both
    // residuals here, after every supported native predicate, never in a handler.
    const snapshot = await query.limit(budget + 1).get();
    if (snapshot.size > budget)
      throw new Error(
        'Histórico excede 10000 leituras; reduza projeto/período. Nenhum total parcial foi retornado.',
      );
    const projects = new Map<
      string,
      FirebaseFirestore.DocumentData | undefined
    >();
    const records: Record<string, unknown>[] = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const projectId = data.projectId as string;
      if (!projects.has(projectId))
        projects.set(
          projectId,
          (await this.db.collection('projects').doc(projectId).get()).data(),
        );
      const project = projects.get(projectId);
      if (
        !canAccessProject(project, uid) ||
        (owner !== uid && effectiveProjectType(project!) !== 'work')
      )
        continue;
      const start = Date.parse(data.startedAt as string);
      const end =
        data.endedAt === null ? Infinity : Date.parse(data.endedAt as string);
      if (!Number.isFinite(start) || Number.isNaN(end))
        throw new Error(
          'Registro com período inválido; contagem indisponível.',
        );
      if (input.from && end <= Date.parse(input.from)) continue;
      if (input.to && start >= Date.parse(input.to)) continue;
      if (
        input.topicId &&
        (!Array.isArray(data.topics) ||
          !data.topics.some(
            (t: { topicId: string }) => t.topicId === input.topicId,
          ))
      )
        continue;
      records.push({
        ...data,
        id: doc.id,
        recordOwnerUid: owner,
        version: doc.updateTime.toDate().toISOString(),
        expectedVersion:
          doc.updateTime.toMillis() + ':' + doc.updateTime.nanoseconds,
      });
    }
    // Bind cursor to actor, filters AND full result state. Changes invalidate the
    // traversal rather than silently skipping/repeating records or lying about totals.
    const filters = {
      projectId: input.projectId,
      recordOwnerUid: input.recordOwnerUid,
      from: input.from,
      to: input.to,
      topicId: input.topicId,
    };
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ uid, filters, records }))
      .digest('hex');
    let offset = 0;
    if (input.cursor) {
      const decoded = JSON.parse(
        Buffer.from(input.cursor, 'base64url').toString(),
      ) as { fingerprint: string; offset: number };
      if (
        decoded.fingerprint !== fingerprint ||
        !Number.isSafeInteger(decoded.offset) ||
        decoded.offset < 0 ||
        decoded.offset > records.length
      )
        throw new Error(
          'Cursor inválido ou histórico alterado; reinicie a consulta.',
        );
      offset = decoded.offset;
    }
    const page = records.slice(offset, offset + input.limit);
    const next = offset + page.length;
    const hasMore = next < records.length;
    return {
      records: page,
      totalCount: records.length,
      hasMore,
      nextCursor: hasMore
        ? Buffer.from(JSON.stringify({ fingerprint, offset: next })).toString(
            'base64url',
          )
        : null,
    };
  }
}
