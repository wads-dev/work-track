import { createMetadataPresentationRepository } from '../../data/repositories/metadata-presentation-repository';
import type { Row } from '../data';
/** Catalog must be the complete authorized set, not the filtered/paginated list. */
export function projectColors(catalog: Row[], revealed: boolean) {
  return createMetadataPresentationRepository(catalog, revealed).color;
}
