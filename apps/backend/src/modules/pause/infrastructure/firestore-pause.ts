import { isDeletedRecord } from '../../registration/domain/record-lifecycle.js';
import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import {
  assertProjectAccess,
  canAccessProject,
} from '../../registration/domain/project-access.js';
import { type Project } from '../../registration/domain/work-model.js';
import {
  pauseInput,
  PauseError,
  validateSource,
  validateSpeech,
  type PauseInput,
  type PauseResult,
  type PauseRepository,
} from '../domain/pause.js';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}
// Audit lives in users/{uid}/pauseAudits: Admin-only under unchanged current rules.
// This atomic tooling ledger is not record-drawer history; UI audit exposure requires
// a separately reviewed rules/UI change. Do not silently copy to another audit schema.
export class FirestorePauseRepository implements PauseRepository {
  constructor(private readonly db: Firestore) {}
  async registerPause(
    raw: PauseInput,
    uid: string,
    now = Date.now(),
  ): Promise<PauseResult> {
    if (!uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid))
      throw new PauseError('not-found', 'Registro não encontrado.');
    if (!Number.isFinite(now) || !Number.isFinite(Date.parse(raw.resumedAt)))
      throw new PauseError('invalid-argument', 'Momento inválido.');
    const input = pauseInput.parse(raw),
      intent = canonical(input),
      key = hash(uid + ':pause:' + input.requestId);
    const user = this.db.collection('users').doc(uid),
      records = user.collection('records'),
      audit = user.collection('pauseAudits').doc(key),
      successor = records.doc(key);
    return this.db.runTransaction(async (tx) => {
      const prior = await tx.get(audit);
      if (prior.exists) {
        const saved = prior.data() as {
          uid: string;
          intent: string;
          sourceRecordId: string;
          projectId: string;
          afterSource: Record<string, unknown>;
          afterSuccessor: Record<string, unknown>;
          result: PauseResult;
        };
        if (saved.uid !== uid || saved.intent !== intent)
          throw new PauseError(
            'failed-precondition',
            'requestId já usado para intenção diferente.',
          );
        const [sourceDoc, successorDoc, projectDoc] = await Promise.all([
          tx.get(records.doc(saved.sourceRecordId)),
          tx.get(successor),
          tx.get(this.db.collection('projects').doc(saved.projectId)),
        ]);
        assertProjectAccess(projectDoc.data(), uid);
        if (
          !sourceDoc.exists ||
          !successorDoc.exists ||
          canonical(sourceDoc.data()) !== canonical(saved.afterSource) ||
          canonical(successorDoc.data()) !== canonical(saved.afterSuccessor)
        )
          throw new PauseError(
            'aborted',
            'Estado alterado após pausa; retry não modifica fatos.',
          );
        return saved.result;
      }
      const speech = validateSpeech(input, now);
      let sourceRef = input.recordId ? records.doc(input.recordId) : undefined;
      if (!sourceRef) {
        const scanned = await tx.get(records);
        if (
          scanned.docs.filter((doc) => !isDeletedRecord(doc.data())).length >
          1000
        )
          throw new PauseError(
            'resource-exhausted',
            'Contexto excede limite; informe recordId explícito.',
          );
        const open = scanned.docs.filter((doc) => {
          const r = doc.data();
          const started =
            typeof r.startedAt === 'string' ? Date.parse(r.startedAt) : NaN;
          return (
            !isDeletedRecord(r) &&
            r.uid === uid &&
            (r.endedAt === undefined || r.endedAt === null) &&
            Number.isFinite(started) &&
            started <= speech &&
            speech - started < 86400000 &&
            typeof r.projectId === 'string' &&
            /^[A-Za-z0-9_-]{1,128}$/.test(r.projectId)
          );
        });
        const eligible = [];
        for (const doc of open) {
          const r = doc.data();
          const p = await tx.get(
            this.db.collection('projects').doc(r.projectId as string),
          );
          if (
            canAccessProject(p.data(), uid) &&
            !p.data()?.archived &&
            !p.data()?.mergedInto &&
            !p.data()?.mergeLock
          )
            eligible.push(doc);
        }
        if (!eligible.length)
          throw new PauseError(
            'failed-precondition',
            'Nenhum registro próprio aberto elegível (<24h); nada foi alterado.',
          );
        if (eligible.length > 1)
          throw new PauseError(
            'failed-precondition',
            'Há múltiplos registros elegíveis; pergunte qual recordId, não escolha automaticamente.',
            eligible.map((doc) => ({
              recordId: doc.id,
              startedAt: doc.data().startedAt as string,
            })),
          );
        sourceRef = eligible[0]!.ref;
      }
      const sourceDoc = await tx.get(sourceRef);
      if (!sourceDoc.exists)
        throw new PauseError('not-found', 'Registro não encontrado.');
      const before = sourceDoc.data()!;
      if (
        before.uid !== uid ||
        typeof before.projectId !== 'string' ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(before.projectId)
      )
        throw new PauseError('not-found', 'Registro não encontrado.');
      const projectDoc = await tx.get(
        this.db.collection('projects').doc(before.projectId),
      );
      const pausedAt = validateSource(
        before,
        projectDoc.data() as Project | undefined,
        input,
        uid,
        now,
      );
      if (Array.isArray(before.interruptions) && before.interruptions.length)
        throw new PauseError(
          'failed-precondition',
          'Interrupções históricas exigem conciliação explícita antes de dividir registro.',
        );
      if ((await tx.get(successor)).exists)
        throw new PauseError(
          'aborted',
          'ID de retomada já existe sem auditoria; nada foi alterado.',
        );
      const recordedAt = new Date(now).toISOString();
      const afterSource = {
        ...before,
        endedAt: pausedAt,
        updatedAt: recordedAt,
        pauseSuccessorId: key,
      };
      const clone = { ...before };
      for (const field of [
        'endedAt',
        'fingerprint',
        'updatedAt',
        'closedPreviousRecordId',
        'closePrevious',
        'closePreviousReason',
        'pauseSuccessorId',
        'topicResolution',
        'warnings',
      ])
        delete clone[field];
      const afterSuccessor = {
        ...clone,
        id: key,
        uid,
        startedAt: input.resumedAt,
        requestId: input.requestId,
        receivedAt: recordedAt,
        pausedFrom: sourceRef.id,
        pauseAuditId: key,
      };
      const result: PauseResult = {
        sourceRecordId: sourceRef.id,
        successorRecordId: key,
        pausedAt,
        resumedAt: input.resumedAt,
        durationMinutes: input.durationMinutes,
        auditId: key,
      };
      tx.update(sourceRef, {
        endedAt: pausedAt,
        updatedAt: recordedAt,
        pauseSuccessorId: key,
      });
      tx.create(successor, afterSuccessor);
      tx.create(audit, {
        uid,
        intent,
        sourceRecordId: sourceRef.id,
        projectId: before.projectId,
        reason: input.reason,
        originalUtterance: input.originalUtterance,
        recordedAt,
        beforeSource: before,
        afterSource,
        afterSuccessor,
        result,
      });
      return result;
    });
  }
}
