import { createHash, randomBytes } from 'node:crypto';
import {
  Timestamp,
  GeoPoint,
  DocumentReference,
  type Firestore,
  type Transaction,
  type DocumentSnapshot,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { effectiveProjectType } from '../domain/project-access.js';

export const DELETION_LIMITS = {
  scanPerCollection: 1000,
  documents: 400,
  bytes: 2_000_000,
  tokenLifetimeMs: 30 * 60_000,
} as const;
export const DELETION_INVENTORY_VERSION = 2 as const;
// Persisted canonical facts, complete audit evidence and server-owned report views.
const GROUPS = [
  'records',
  'audit',
  'topicMerges',
  'pauseAudits',
  'splitAudits',
  'removalAudits',
  'recordMergeAudits',
  'reportRecords',
];
const ROOTS = ['projects', 'recordMovements', 'project_merge_jobs'];
const fail = (message: string): never => {
  throw new HttpsError('failed-precondition', message);
};
const oversized = (): never => {
  throw new HttpsError(
    'resource-exhausted',
    'Inventário excede o limite seguro: até 1000 documentos por coleção/grupo, 400 documentos associados e 2 MB JSON. Nenhuma exclusão. Solicite exportação/migração administrativa integral para projetos maiores.',
  );
};
export function jsonValue(value: unknown): unknown {
  if (value instanceof Timestamp)
    return {
      $type: 'timestamp',
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  if (value instanceof GeoPoint)
    return {
      $type: 'geopoint',
      latitude: value.latitude,
      longitude: value.longitude,
    };
  if (value instanceof DocumentReference)
    return { $type: 'reference', path: value.path };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array)
    return { $type: 'bytes', base64: Buffer.from(value).toString('base64') };
  if (typeof value === 'number' && !Number.isFinite(value))
    return { $type: 'number', value: String(value) };
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, jsonValue(v)]),
    );
  return value;
}
function projectSnapshotId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = value as Record<string, unknown>;
  return typeof data.id === 'string' &&
    typeof data.createdBy === 'string' &&
    Array.isArray(data.topics)
    ? data.id
    : undefined;
}
function mentions(value: unknown, projectId: string): boolean {
  if (projectSnapshotId(value) === projectId) return true;
  if (value === projectId || value === 'projects/' + projectId) return true;
  if (value instanceof DocumentReference)
    return value.path === 'projects/' + projectId;
  if (Array.isArray(value)) return value.some((v) => mentions(v, projectId));
  return (
    !!value &&
    typeof value === 'object' &&
    Object.entries(value).some(
      ([k, v]) =>
        (/^(projectId|sourceProjectId|targetProjectId|destinationProjectId|mergedInto|mergedIntoProjectId|project_origin|project_target)$/.test(
          k,
        ) &&
          v === projectId) ||
        (k === 'path' && v === 'projects/' + projectId) ||
        (!!v && typeof v === 'object' && mentions(v, projectId)),
    )
  );
}
function otherProjects(value: unknown, projectId: string): boolean {
  const snapshotId = projectSnapshotId(value);
  if (snapshotId && snapshotId !== projectId) return true;
  if (Array.isArray(value))
    return value.some((v) => otherProjects(v, projectId));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([k, v]) =>
      (/^(projectId|sourceProjectId|targetProjectId|destinationProjectId|mergedInto|mergedIntoProjectId|project_origin|project_target)$/.test(
        k,
      ) &&
        typeof v === 'string' &&
        v !== projectId) ||
      (k === 'path' &&
        typeof v === 'string' &&
        v.startsWith('projects/') &&
        v !== 'projects/' + projectId) ||
      otherProjects(v, projectId),
  );
}
export class FirestoreProjectDeletionRepository {
  constructor(
    private readonly db: Firestore,
    private readonly now = () => Date.now(),
  ) {}
  private async snapshot(tx: Transaction, projectId: string, uid: string) {
    const project = await tx.get(this.db.doc('projects/' + projectId));
    if (!project.exists)
      throw new HttpsError('not-found', 'Projeto não encontrado.');
    if (
      effectiveProjectType(project.data()!) === 'invalid' ||
      project.data()!.createdBy !== uid
    )
      throw new HttpsError(
        'permission-denied',
        'Somente o proprietário/criador pode exportar para exclusão e excluir permanentemente, inclusive projetos corporativos e registros de outros autores.',
      );
    const inventory: DocumentSnapshot[] = [];
    for (const name of ROOTS) {
      const result = await tx.get(
        this.db.collection(name).limit(DELETION_LIMITS.scanPerCollection + 1),
      );
      if (result.docs.length > DELETION_LIMITS.scanPerCollection) oversized();
      inventory.push(...result.docs);
    }
    for (const name of GROUPS) {
      const result = await tx.get(
        this.db
          .collectionGroup(name)
          .limit(DELETION_LIMITS.scanPerCollection + 1),
      );
      if (result.docs.length > DELETION_LIMITS.scanPerCollection) oversized();
      inventory.push(...result.docs);
    }
    const records = inventory.filter(
      (s) =>
        /^users\/[^/]+\/records\/[^/]+$/.test(s.ref.path) &&
        mentions(s.data(), projectId),
    );
    if (
      effectiveProjectType(project.data()!) === 'personal' &&
      records.some((s) => s.ref.path.split('/')[1] !== uid)
    )
      fail(
        'Projeto pessoal contém registros de outros autores; migração administrativa necessária para preservar privacidade.',
      );
    const recordPaths = records.map((s) => s.ref.path + '/');
    const associated = inventory.filter(
      (s) =>
        s.ref.path === project.ref.path ||
        s.ref.path.startsWith(project.ref.path + '/') ||
        recordPaths.some((p) => s.ref.path.startsWith(p)) ||
        mentions(s.data(), projectId),
    );
    const docs = [
      ...new Map(associated.map((s) => [s.ref.path, s])).values(),
    ].sort((a, b) => a.ref.path.localeCompare(b.ref.path));
    if (docs.length > DELETION_LIMITS.documents) oversized();
    // Validate only associated evidence; unrelated malformed data is not exported.
    // Never silently omit orphan evidence from a supposedly complete inventory.
    const validIdentity = (value: unknown): value is string =>
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 128 &&
      !value.includes('/') &&
      value !== '.' &&
      value !== '..';
    const personal = effectiveProjectType(project.data()!) === 'personal';
    for (const s of docs) {
      const parts = s.ref.path.split('/');
      const group = parts.at(-2);
      if (group !== 'recordMergeAudits' && group !== 'reportRecords') continue;
      const data = s.data()!;
      if (!validIdentity(data.uid))
        fail(
          'Identidade inválida no histórico associado; nenhuma exportação/exclusão.',
        );
      if (group === 'recordMergeAudits') {
        if (
          parts.length !== 4 ||
          parts[0] !== 'users' ||
          !validIdentity(parts[1]) ||
          parts[1] !== data.uid ||
          !parts[3] ||
          parts[3] === '.' ||
          parts[3] === '..'
        )
          fail(
            'Caminho/autor inválido no histórico de merge; nenhuma exportação/exclusão.',
          );
        // The real receipt duplicates complete source/target facts in these slots.
        // Every present slot must agree with the canonical ledger author.
        for (const container of ['before', 'after', 'result']) {
          const value: unknown = data[container];
          if (value === undefined) continue;
          if (!value || typeof value !== 'object' || Array.isArray(value))
            fail('Histórico de merge inválido; nenhuma exportação/exclusão.');
          for (const key of ['source', 'target']) {
            const record = (value as Record<string, unknown>)[key];
            if (record === undefined) continue;
            if (
              !record ||
              typeof record !== 'object' ||
              Array.isArray(record) ||
              (record as Record<string, unknown>).uid !== data.uid
            )
              fail(
                'Autor divergente no histórico de merge; nenhuma exportação/exclusão.',
              );
          }
        }
      } else if (
        parts.length !== 4 ||
        parts[0] !== 'projects' ||
        parts[1] !== projectId ||
        data.projectId !== projectId ||
        !parts[3] ||
        parts[3] === '.' ||
        parts[3] === '..'
      )
        fail(
          'Caminho/projeto inválido na projeção; nenhuma exportação/exclusão.',
        );
      if (personal && data.uid !== uid)
        fail(
          'Projeto pessoal contém histórico de outros autores; migração administrativa necessária.',
        );
    }
    // Unknown schema cannot be safely cascaded. Discovery is validation only; all known
    // membership queries and writes are transactional. Current trusted writers create
    // only the explicitly inventoried groups. Client writes are denied by rules.
    for (const s of docs) {
      if (
        s.ref.path.startsWith('projects/') &&
        s.ref.path.split('/')[1] !== projectId
      )
        fail(
          'Histórico vinculado a outro projeto exige migração administrativa; nenhuma exclusão.',
        );
      const children = await s.ref.listCollections();
      // These leaf schemas have no child collections. Even a known group name
      // could otherwise leave evidence behind when it lacks a project reference.
      const group = s.ref.path.split('/').at(-2);
      if (
        children.length > 0 &&
        (group === 'recordMergeAudits' || group === 'reportRecords')
      )
        fail(
          'Subcoleção em histórico de merge/projeção: exportação/exclusão exige migração administrativa integral; nenhuma alteração.',
        );
      if (children.some((c) => !GROUPS.includes(c.id)))
        fail(
          'Subcoleção desconhecida: exportação/exclusão exige migração administrativa integral; nenhuma alteração.',
        );
    }
    if (docs.some((s) => otherProjects(s.data(), projectId)))
      fail(
        'Histórico vinculado a outros projetos exige exportação/migração administrativa integral para preservar permissões e auditoria; nenhuma alteração.',
      );
    const documents = docs.map((s) => ({
      path: s.ref.path,
      data: jsonValue(s.data()),
      createTime: jsonValue(s.createTime ?? null),
      updateTime: jsonValue(s.updateTime ?? null),
    }));
    const serialized = JSON.stringify(documents);
    if (Buffer.byteLength(serialized) > DELETION_LIMITS.bytes) oversized();
    return {
      docs,
      documents,
      digest: createHash('sha256')
        .update(
          JSON.stringify({
            inventoryVersion: DELETION_INVENTORY_VERSION,
            documents,
          }),
        )
        .digest('hex'),
      sharedHistory: docs.some((s) => otherProjects(s.data(), projectId)),
      project,
    };
  }
  async exportProject(projectId: string, uid: string) {
    const token = randomBytes(32).toString('hex');
    const exportedAt = new Date(this.now()).toISOString();
    return this.db.runTransaction(async (tx) => {
      const snapshot = await this.snapshot(tx, projectId, uid);
      tx.create(this.db.doc('projectDeletionExports/' + token), {
        projectId,
        uid,
        inventoryVersion: DELETION_INVENTORY_VERSION,
        digest: snapshot.digest,
        expiresAt: this.now() + DELETION_LIMITS.tokenLifetimeMs,
      });
      return {
        schemaVersion: DELETION_INVENTORY_VERSION,
        inventoryVersion: DELETION_INVENTORY_VERSION,
        projectId,
        exportedAt,
        snapshotToken: token,
        documentCount: snapshot.documents.length,
        export: {
          format: 'work-track-project-export',
          version: DELETION_INVENTORY_VERSION,
          inventoryVersion: DELETION_INVENTORY_VERSION,
          projectId,
          exportedAt,
          snapshotToken: token,
          snapshotDigest: snapshot.digest,
          includesSoftDeleted: true,
          documents: snapshot.documents,
        },
      };
    });
  }
  async deleteProject(projectId: string, uid: string, snapshotToken: string) {
    return this.db.runTransaction(async (tx) => {
      const receipt = await tx.get(
        this.db.doc('projectDeletionExports/' + snapshotToken),
      );
      if (
        !receipt.exists ||
        receipt.data()!.inventoryVersion !== DELETION_INVENTORY_VERSION ||
        receipt.data()!.uid !== uid ||
        receipt.data()!.projectId !== projectId ||
        receipt.data()!.expiresAt <= this.now()
      )
        fail(
          'Exporte novamente o JSON completo antes de excluir: token ausente, inválido ou expirado.',
        );
      const snapshot = await this.snapshot(tx, projectId, uid);
      if (snapshot.digest !== receipt.data()!.digest)
        fail(
          'Projeto/histórico mudou após exportação. Baixe uma nova exportação completa; nenhuma exclusão.',
        );
      if (
        snapshot.sharedHistory ||
        snapshot.project.data()!.mergeLock ||
        snapshot.project.data()!.mergedIntoProjectId
      )
        fail(
          'Histórico vinculado a outros projetos ou mesclagem ativa exige migração administrativa integral; nenhuma exclusão.',
        );
      const receipts = await tx.get(
        this.db
          .collection('projectDeletionExports')
          .where('projectId', '==', projectId)
          .limit(101),
      );
      if (
        receipts.docs.length > 100 ||
        snapshot.docs.length + receipts.docs.length > 450
      )
        oversized();
      // No writes are queued until every bound, ACL, membership and version check passes.
      snapshot.docs.forEach((s) => tx.delete(s.ref));
      receipts.docs.forEach((s) => tx.delete(s.ref));
      return {
        projectId,
        deleted: true,
        deletedDocumentCount: snapshot.docs.length,
      };
    });
  }
}
