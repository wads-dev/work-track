import type { DocumentData } from 'firebase/firestore';
import type { ReportProjectMetadataMode } from '@work-track/data/codecs/report-project-metadata';
import { ProjectCatalogRepository } from '@work-track/data/repositories/project-catalog-repository';

/** Snapshot projection, not a Firestore read API. Subscription/auth/cache stay with callers. */
export function decodeWebProjectSnapshot(
  snapshot: { data(): DocumentData | undefined },
  id: string,
  mode: Extract<ReportProjectMetadataMode, 'personal-web' | 'authorized-web'>,
) {
  return ProjectCatalogRepository.decodeDocument(
    { id, data: snapshot.data() },
    mode,
  );
}
