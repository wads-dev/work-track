import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { assertProjectAccess } from '../../registration/domain/project-access.js';
import {
  assertProjectWritable,
  safeId,
} from '../../registration/domain/project-management.js';
import {
  registerInput,
  type Project,
} from '../../registration/domain/work-model.js';
import { isDeletedRecord } from '../../registration/domain/record-lifecycle.js';
import { canonical } from '../../split/infrastructure/firestore-split.js';
import {
  mergeInput,
  MergeError,
  type MergeInput,
  type MergeRepository,
  type MergeResult,
} from '../domain/merge.js';
const hash = (v: unknown) =>
  createHash('sha256').update(canonical(v)).digest('hex');
export class FirestoreMergeRepository implements MergeRepository {
  constructor(private readonly db: Firestore) {}
  async mergeRecords(
    raw: MergeInput,
    uid: string,
    now = Date.now(),
  ): Promise<MergeResult> {
    if (!safeId.safeParse(uid).success)
      throw new MergeError('not-found', 'Registro não encontrado.');
    const input = mergeInput.parse(raw);
    const { confirmed, previewToken, ...intent } = input;
    const fingerprint = hash(intent),
      operationId = hash([uid, 'merge-records', input.requestId]);
    const user = this.db.collection('users').doc(uid),
      records = user.collection('records');
    const sourceRef = records.doc(input.sourceRecordId),
      targetRef = records.doc(input.targetRecordId);
    const auditRef = user.collection('recordMergeAudits').doc(operationId);
    return this.db.runTransaction(async (tx) => {
      const [sourceDoc, targetDoc, prior] = await Promise.all([
        tx.get(sourceRef),
        tx.get(targetRef),
        tx.get(auditRef),
      ]);
      if (
        !sourceDoc.exists ||
        !targetDoc.exists ||
        sourceDoc.data()!.uid !== uid ||
        targetDoc.data()!.uid !== uid
      )
        throw new MergeError('not-found', 'Registro não encontrado.');
      const source = sourceDoc.data() as Record<string, unknown>,
        target = targetDoc.data() as Record<string, unknown>;
      // Re-check current authorization even on retries; never return historical private data after scope changes.
      const projectVersions: unknown[] = [];
      for (const id of new Set([source.projectId, target.projectId])) {
        if (!safeId.safeParse(id).success)
          throw new MergeError('failed-precondition', 'Projeto inválido.');
        const projectDoc = await tx.get(
          this.db.collection('projects').doc(id as string),
        );
        assertProjectAccess(projectDoc.data(), uid);
        projectVersions.push([
          id,
          projectDoc.data(),
          projectDoc.updateTime?.toMillis(),
          projectDoc.updateTime?.nanoseconds,
        ]);
        if (!prior.exists) assertProjectWritable(projectDoc.data() as Project);
      }
      if (prior.exists) {
        const saved = prior.data() as {
          fingerprint: string;
          result: MergeResult;
        };
        if (
          saved.fingerprint !== fingerprint ||
          !confirmed ||
          previewToken !== saved.result.previewToken
        )
          throw new MergeError(
            'failed-precondition',
            'Retry exige mesma intenção, confirmação e prévia.',
          );
        if (
          canonical(source) !== canonical(saved.result.source) ||
          canonical(target) !== canonical(saved.result.target)
        )
          throw new MergeError(
            'aborted',
            'Registros alterados após merge; retry não modifica fatos.',
          );
        return saved.result;
      }
      const reject = (message: string): never => {
        throw new MergeError('failed-precondition', message);
      };
      if (isDeletedRecord(source) || isDeletedRecord(target))
        reject('Registro removido não pode ser mesclado.');
      if (
        source.projectId !== target.projectId ||
        source.timeZone !== target.timeZone
      )
        reject('Merge exige mesmo projeto e fuso.');
      const times = [
        source.startedAt,
        source.endedAt,
        target.startedAt,
        target.endedAt,
      ].map((v) => (typeof v === 'string' ? Date.parse(v) : NaN));
      const [ss, se, ts, te] = times as [number, number, number, number];
      if (
        times.some((v) => !Number.isFinite(v)) ||
        se <= ss ||
        te <= ts ||
        se > now ||
        te > now
      )
        reject(
          'Merge exige dois registros encerrados com intervalos válidos no passado.',
        );
      if (se !== ts && te !== ss)
        reject(
          'Merge exige intervalos contíguos, sem lacunas ou sobreposição.',
        );
      if (canonical(source.topics ?? []) !== canonical(target.topics ?? []))
        reject(
          'Distribuições de tópicos diferentes exigem conciliação explícita.',
        );
      const topics = source.topics ?? [];
      if (
        !Array.isArray(topics) ||
        topics.some(
          (t) => !t || typeof t !== 'object' || 'durationMinutes' in t,
        )
      )
        reject('Minutos absolutos de tópicos exigem conciliação explícita.');
      for (const record of [source, target]) {
        const facts = {
          projectId: record.projectId,
          startedAt: record.startedAt,
          endedAt: record.endedAt,
          timeZone: record.timeZone,
          originalText: record.originalText,
          interpretation: record.interpretation,
          topics: record.topics ?? [],
          interruptions: record.interruptions ?? [],
          requestId: 'merge-validation',
        };
        if (!registerInput.safeParse(facts).success)
          reject('Fatos inválidos exigem conciliação explícita.');
        if (
          !Array.isArray(record.interruptions ?? []) ||
          (record.interruptions as unknown[] | undefined)?.length
        )
          reject('Interrupções exigem conciliação explícita antes do merge.');
        if (
          typeof record.originalText !== 'string' ||
          typeof record.interpretation !== 'string'
        )
          reject('Registros sem evidências textuais válidas.');
      }
      const first = ss < ts ? source : target,
        last = ss < ts ? target : source;
      const originalText =
        (first.originalText as string) + '\n\n' + (last.originalText as string);
      const interpretation =
        (first.interpretation as string) +
        '\n\n' +
        (last.interpretation as string);
      if (originalText.length > 12000 || interpretation.length > 6000)
        reject(
          'Textos unidos excedem limites; nenhuma evidência será truncada.',
        );
      const token = hash([
        uid,
        fingerprint,
        projectVersions,
        source,
        target,
        sourceDoc.updateTime?.toMillis(),
        sourceDoc.updateTime?.nanoseconds,
        targetDoc.updateTime?.toMillis(),
        targetDoc.updateTime?.nanoseconds,
      ]);
      if (confirmed && previewToken !== token)
        throw new MergeError(
          'aborted',
          'Prévia desatualizada; obtenha nova prévia e confirmação humana.',
        );
      const updatedAt = new Date(now).toISOString();
      const afterTarget = {
        ...target,
        startedAt: first.startedAt,
        endedAt: last.endedAt,
        originalText,
        interpretation,
        updatedAt,
        updatedBy: uid,
        mergeOperationId: operationId,
      };
      const afterSource = {
        ...source,
        deletedAt: updatedAt,
        deletedBy: uid,
        deleteReason: input.reason,
        deleteOperationId: operationId,
        mergedIntoRecordId: input.targetRecordId,
        updatedAt,
        updatedBy: uid,
      };
      const result: MergeResult = {
        confirmed,
        operationId,
        previewToken: token,
        sourceRecordId: input.sourceRecordId,
        targetRecordId: input.targetRecordId,
        totalMilliseconds: se - ss + te - ts,
        warnings: [
          'Origem será removida logicamente; destino conserva ID. Textos serão concatenados cronologicamente; snapshots completos ficam na auditoria.',
          'Não há desfazer. Horas fechadas são preservadas; estimativas de outros registros abertos podem mudar.',
        ],
        source: confirmed ? afterSource : source,
        target: confirmed
          ? afterTarget
          : {
              ...target,
              startedAt: first.startedAt,
              endedAt: last.endedAt,
              originalText,
              interpretation,
            },
      };
      if (confirmed) {
        tx.set(targetRef, afterTarget);
        tx.set(sourceRef, afterSource);
        tx.create(auditRef, {
          uid,
          operationId,
          requestId: input.requestId,
          reason: input.reason,
          fingerprint,
          createdAt: updatedAt,
          before: { source, target },
          after: { source: afterSource, target: afterTarget },
          result,
        });
      }
      return result;
    });
  }
}
