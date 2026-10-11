import { ProjectAppearance } from '@work-track/core/registration/domain/project-color';
import type { Row } from '../data';
import { safeProject } from './privacy';
/** Catalog must be the complete authorized set, not the filtered/paginated list. */
export function projectColors(catalog: Row[], revealed: boolean) {
  const colors = catalog.map((row) => ({
    id: row.id,
    color: safeProject(row.data, revealed).color,
  }));
  return (id: string) =>
    new ProjectAppearance(
      colors.find((row) => row.id === id) ?? { id },
    ).getColor(colors);
}
