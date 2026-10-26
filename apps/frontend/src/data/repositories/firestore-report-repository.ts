import {
  collection,
  collectionGroup,
  documentId,
  getDocsFromCache,
  limit as queryLimit,
  orderBy,
  query,
  where,
  type Firestore,
  type Query,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import type {
  ReportSourceRecord,
  ProjectReportRepository,
  ReportPage,
} from '@work-track/core/reports/domain/project-report';
import type {
  PersonalReportRepository,
  PersonalReportPage,
  ReportRecordSelection,
} from '@work-track/core/reports/domain/personal-report';
import { selectedProjectIds } from '@work-track/core/reports/domain/personal-report';
import { resolveTimeMultiplier } from '@work-track/core/registration/domain/time-multipliers';
import type { CompanyReportRepository } from '@work-track/core/reports/domain/company-report';
import type { CalendarRepository } from '@work-track/core/reports/application/get-calendar-report';
import {
  decodeReportProjectMetadata,
  type ReportProjectMetadata,
} from '@work-track/data/codecs/report-project-metadata';
import { reportRecordSchema } from '@work-track/data/codecs/report-record';
import { canAccessProject } from '@work-track/core/registration/domain/project-access';
import { isDeletedRecord } from '@work-track/core/registration/domain/record-lifecycle';
import { ReportContextError } from '@work-track/core/reports/domain/global-estimates';
import { resolveTopic } from '@work-track/core/reports/domain/topic-breakdown';
import { topicMetadataMap } from '@work-track/core/reports/domain/calendar-topics';
import {
  calendarQueryBounds,
  isoDateCandidatePrefix,
} from '../sources/calendar-firestore-query';
import { decodeWebProjectSnapshot } from '../../infrastructure/firebase/web-read-adapter';
import { traceFirestore } from '../sync/firestore-diagnostics';
import { stableDataKey } from './stable-data-key';
export const recordPath = (r: ReportSourceRecord) =>
  'users/' + r.uid + '/records/' + r.id;
const compareRecordPaths = (a: string, b: string) => {
  const left = a.split('/'),
    right = b.split('/');
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const aBytes = new TextEncoder().encode(left[i]),
      bBytes = new TextEncoder().encode(right[i]);
    for (let j = 0; j < Math.min(aBytes.length, bBytes.length); j++) {
      if (aBytes[j] !== bBytes[j]) return aBytes[j] - bBytes[j];
    }
    if (aBytes.length !== bBytes.length) return aBytes.length - bBytes.length;
  }
  return left.length - right.length;
};
const schema = reportRecordSchema('authorized-web');
const personalSchema = reportRecordSchema('personal-web');
/** Native cache queries; global sync owns authorized cache population, not this repository. */
export class FirestoreReportRepository implements CompanyReportRepository {
  constructor(
    readonly db: Firestore,
    readonly viewer: string,
    readonly projects: ReadonlyMap<string, ReportProjectMetadata>,
  ) {}
  private async read(
    target: Query<DocumentData>,
    operation: string,
    projects: ReadonlyMap<string, ReportProjectMetadata>,
    personal = false,
  ) {
    traceFirestore('cache.read', {
      collection: 'records',
      operation,
      source: 'persistent-local',
    });
    const result = await getDocsFromCache(target);
    traceFirestore('cache.result', {
      collection: 'records',
      operation,
      count: result.size,
      source: 'persistent-local',
    });
    if (result.size > 2000)
      throw new ReportContextError(
        'Consulta local excede2000documentos; nenhum total parcial retornado.',
      );
    return result.docs.flatMap((doc) => {
      const parts = doc.ref.path.split('/'),
        data = doc.data();
      if (
        parts.length !== 4 ||
        parts[0] !== 'users' ||
        parts[2] !== 'records' ||
        data.uid !== parts[1]
      )
        throw new Error('Registro canônico inválido.');
      const project = projects.get(String(data.projectId));
      // Firestore has no join with current project ACL; revalidate before decoding.
      if (
        !project ||
        !canAccessProject(project, this.viewer) ||
        isDeletedRecord(data) ||
        (project.type === 'personal' && data.uid !== this.viewer)
      )
        return [];
      const parsed = personal ? personalSchema.parse(data) : schema.parse(data);
      return [
        {
          ...(personal ? {} : data),
          ...parsed,
          uid: parts[1],
          id: parts[3],
          timeMultiplier: resolveTimeMultiplier(
            project.timeMultipliers?.[parts[1]],
            parsed.startedAt,
          ),
        } as ReportSourceRecord,
      ];
    });
  }
  private async readCatalog(
    ids: readonly string[],
    personal = false,
    activeOnly = false,
  ) {
    const candidates = new Map<string, ReportProjectMetadata>();
    for (let i = 0; i < ids.length; i += 30) {
      const allowed = ids
        .slice(i, i + 30)
        .filter((id) => this.projects.has(id));
      if (!allowed.length) continue;
      traceFirestore('cache.read', {
        collection: 'projects',
        operation: 'report.project-selection',
        source: 'persistent-local',
      });
      const docs = await getDocsFromCache(
        query(
          collection(this.db, 'projects'),
          where(documentId(), 'in', allowed),
          ...(activeOnly ? [where('archived', '==', false)] : []),
        ),
      );
      traceFirestore('cache.result', {
        collection: 'projects',
        operation: 'report.project-selection',
        source: 'persistent-local',
        count: docs.size,
      });
      for (const doc of docs.docs) {
        const p = decodeWebProjectSnapshot(
          doc,
          doc.id,
          personal ? 'personal-web' : 'authorized-web',
        );
        if (p && canAccessProject(p, this.viewer)) candidates.set(doc.id, p);
      }
    }
    return candidates;
  }
  private async projectIds(own: boolean, selection?: ReportRecordSelection) {
    const allowed = selectedProjectIds(selection) ?? [...this.projects.keys()];
    const candidates = await this.readCatalog(
      allowed,
      false,
      Boolean(selection && !selection.includeArchived),
    );
    return {
      projects: candidates,
      ids: [...candidates]
        .filter(
          ([, p]) =>
            canAccessProject(p, this.viewer) &&
            (own || p.type === 'work') &&
            (!selection ||
              selection.includeArchived ||
              (!p.archived && !p.mergedInto)),
        )
        .map(([id]) => id),
    };
  }
  private async records(
    own: boolean,
    cursor?: string,
    selection?: ReportRecordSelection,
    personalCodec = own,
  ) {
    const { ids, projects: catalog } = await this.projectIds(own, selection),
      result = new Map<string, ReportSourceRecord>();
    const range = selection?.from && selection.to ? selection : undefined;
    const bounds =
      range?.from && range.to
        ? calendarQueryBounds({ from: range.from, to: range.to })
        : undefined;
    if (own && selection?.userIds && !selection.userIds.includes(this.viewer))
      return [];
    const users = own ? [this.viewer] : selection?.userIds;
    // DNF10 conservatively fits Firestore100 components including range guards,
    // implicit/explicit orders and parent path; overlap branches stay independent.
    for (let i = 0; i < ids.length; i += 10) {
      const projects = ids.slice(i, i + 10),
        userShardSize = Math.floor(10 / projects.length),
        userBatches: (string[] | undefined)[] = [];
      if (users) {
        for (let j = 0; j < users.length; j += userShardSize)
          userBatches.push(users.slice(j, j + userShardSize));
      } else userBatches.push(undefined);
      for (const batch of userBatches) {
        const base = own
          ? collection(this.db, 'users', this.viewer, 'records')
          : collectionGroup(this.db, 'records');
        const filters: QueryConstraint[] = [
          where('projectId', 'in', projects),
          where('deletedAt', '==', null),
        ];
        if (!own && batch?.length) filters.push(where('uid', 'in', batch));
        if (cursor)
          filters.push(
            where(documentId(), '>', own ? cursor.split('/').at(-1) : cursor),
          );
        const readBranches = bounds
          ? [
              [
                where('startedAt', '>=', bounds.lower),
                where('startedAt', '<', bounds.upper),
              ],
              [
                where('endedAt', '>=', bounds.lower),
                where('startedAt', '<', bounds.upper),
              ],
              [
                where('endedAt', '==', null),
                where('startedAt', '<', bounds.upper),
              ],
            ]
          : selection?.to
            ? [
                [
                  where(
                    'startedAt',
                    '<',
                    isoDateCandidatePrefix(Date.parse(selection.to), 1),
                  ),
                ],
              ]
            : [[]];
        for (let branch = 0; branch < readBranches.length; branch++) {
          const rows = await this.read(
            query(
              base,
              ...filters,
              ...readBranches[branch],
              ...(bounds || selection?.to ? [] : [orderBy(documentId())]),
              queryLimit(2001),
            ),
            'report.select',
            catalog,
            personalCodec,
          );
          for (const row of rows) {
            // Arbitrary ISO offsets are not sortable instants, and topic arrays contain objects
            // with optional weights. Exact overlap/alias matching cannot be expressed against
            // these existing fields: all supported owner/project/date guards above run in DB.
            if (selection?.from || selection?.to) {
              const start = Date.parse(row.startedAt),
                end =
                  row.endedAt === undefined
                    ? Infinity
                    : Date.parse(row.endedAt);
              if (
                (selection.to && start >= Date.parse(selection.to)) ||
                (selection.from && end < Date.parse(selection.from))
              )
                continue;
            }
            if (selection?.topicId) {
              const topics = topicMetadataMap(
                catalog.get(row.projectId)?.topics ?? [],
              );
              const wanted = resolveTopic(topics, selection.topicId);
              if ('error' in wanted)
                throw new ReportContextError('Identidade de tópico inválida.');
              if (
                !row.topics.some((t) => {
                  const r = resolveTopic(topics, t.topicId);
                  return !('error' in r) && r.topicId === wanted.topicId;
                })
              )
                continue;
            }
            result.set(recordPath(row), row);
          }
        }
      }
    }
    // Independent query branches have no cross-query ORDER BY/limit in Firestore.
    return [...result.values()].sort((a, b) =>
      compareRecordPaths(recordPath(a), recordPath(b)),
    );
  }
  private async completeSelection(
    own: boolean,
    selection?: ReportRecordSelection,
    personalCodec = own,
  ): Promise<PersonalReportPage> {
    // A complete selection is fresh per invocation, never a memoized cursor snapshot.
    const records = await this.records(
      own,
      undefined,
      selection,
      personalCodec,
    );
    // Native branches/shards each enforce their physical budget; their deduplicated
    // union must also fit the complete selection budget before exposing any totals.
    if (records.length > 2000)
      throw new ReportContextError('Seleção completa excede2000registros.');
    return { records, scannedCount: records.length, nextCursor: null };
  }
  async readCompleteSelection(
    selection?: ReportRecordSelection,
  ): Promise<PersonalReportPage> {
    return this.completeSelection(false, selection);
  }
  async readPage(
    size: number,
    cursor?: string,
    projectId?: string,
    selection?: ReportRecordSelection,
  ) {
    selectedProjectIds(selection, projectId);
    const rows = await this.records(
        false,
        cursor,
        projectId
          ? {
              ...selection,
              projectId,
              includeArchived: selection ? selection.includeArchived : true,
            }
          : selection,
      ),
      records = rows.slice(0, size);
    return {
      records,
      scannedCount: records.length,
      nextCursor: rows.length > size ? recordPath(records.at(-1)!) : null,
    };
  }
  async loadContext(uids: string[]) {
    const result: ReportSourceRecord[] = [];
    for (const uid of uids) {
      const rows = await this.records(false, undefined, {
        userIds: [uid],
        includeArchived: true,
      });
      if (rows.length > 2000)
        throw new ReportContextError(
          'Contexto excede2000registros por pessoa.',
        );
      result.push(...rows);
    }
    return result;
  }
  async archivedProjectIds(ids: string[]) {
    const projects = await this.readCatalog(ids);
    return ids.filter((id) => {
      const p = projects.get(id);
      return !p || p.archived || p.mergedInto;
    });
  }
  async readTopics(ids: string[], personal = false) {
    const projects = await this.readCatalog(ids, personal);
    return Object.fromEntries(
      ids.map((id) => {
        const p = projects.get(id);
        return [
          id,
          p
            ? (personal
                ? decodeReportProjectMetadata({ ...p }, 'personal-web')
                : p
              ).topics
            : [],
        ];
      }),
    );
  }
  async userLabels(uids: string[]) {
    return Object.fromEntries(
      uids.map((id) => [id, id === this.viewer ? 'Você' : id]),
    );
  }
  own(strictPersonalCodec = true): PersonalReportRepository {
    return {
      readCompleteSelection: async (uid, selection) => {
        if (uid !== this.viewer) throw new Error('Visualizador incompatível.');
        return this.completeSelection(true, selection, strictPersonalCodec);
      },
      readPage: async (uid, size, cursor, selection) => {
        if (uid !== this.viewer) throw new Error('Visualizador incompatível.');
        const rows = await this.records(
            true,
            cursor,
            selection,
            strictPersonalCodec,
          ),
          records = rows.slice(0, size);
        return {
          records,
          scannedCount: records.length,
          nextCursor: rows.length > size ? recordPath(records.at(-1)!) : null,
        };
      },
      loadContext: async (uids) => {
        if (uids.some((id) => id !== this.viewer))
          throw new Error('Visualizador incompatível.');
        const rows = await this.records(
          true,
          undefined,
          {
            includeArchived: true,
          },
          strictPersonalCodec,
        );
        if (rows.length > 2000)
          throw new ReportContextError('Contexto excede2000registros.');
        return rows;
      },
      readTopics: (ids, uid) => {
        if (uid !== this.viewer) throw new Error('Visualizador incompatível.');
        return this.readTopics(ids, strictPersonalCodec);
      },
      archivedProjectIds: (ids) => this.archivedProjectIds(ids),
    };
  }
  calendar(): CalendarRepository {
    return {
      own: this.own(false),
      company: this,
      revalidate: (rows, viewer, mode) =>
        this.revalidate(rows, viewer, mode === 'own', false),
    };
  }
  async revalidate(
    rows: ReportSourceRecord[],
    viewer: string,
    personal: boolean,
    strictPersonalCodec = personal,
  ) {
    if (viewer !== this.viewer) throw new Error('Visualizador incompatível.');
    const current = new Map<string, ReportSourceRecord>();
    const projects = await this.readCatalog([
      ...new Set(rows.map((r) => r.projectId)),
    ]);
    const names = [
      ...new Set(
        rows
          .filter((r) => !personal || r.uid === viewer)
          .map((r) => recordPath(r)),
      ),
    ];
    for (let i = 0; i < names.length; i += 30) {
      const batch = names.slice(i, i + 30);
      const values = await this.read(
        query(
          collectionGroup(this.db, 'records'),
          where(documentId(), 'in', batch),
        ),
        'report.revalidate',
        projects,
        strictPersonalCodec,
      );
      for (const value of values) current.set(recordPath(value), value);
    }
    return rows.filter((r) => {
      const value = current.get(recordPath(r));
      return (
        value &&
        stableDataKey(value) ===
          stableDataKey({ ...r, timeMultiplier: r.timeMultiplier ?? 1 })
      );
    });
  }
  project(): ProjectReportRepository {
    return {
      loadContext: (uids, owner) =>
        owner ? this.own(false).loadContext([owner]) : this.loadContext(uids),
      userLabels: (uids) => this.userLabels(uids),
      readPage: async (
        id,
        size,
        cursor,
        viewer,
        selection,
      ): Promise<ReportPage | null> => {
        const p = (await this.readCatalog([id])).get(id);
        if (viewer !== this.viewer || !p || !canAccessProject(p, this.viewer))
          return null;
        const rows = await this.records(
            p.type === 'personal',
            cursor,
            {
              ...selection,
              projectId: id,
              includeArchived: true,
            },
            false,
          ),
          records = rows.slice(0, size);
        return {
          records,
          personal: p.type === 'personal',
          archived: Boolean(p.archived || p.mergedInto),
          topics: p.topics,
          topicLabels: Object.fromEntries(p.topics.map((t) => [t.id, t.title])),
          nextCursor: rows.length > size ? recordPath(records.at(-1)!) : null,
        };
      },
    };
  }
}
