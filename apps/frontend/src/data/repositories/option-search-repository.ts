import type { ProjectOption } from '../../features/projects/project-search';

/** Strip potentially raw metadata from older callers while privacy is masked.
 * This transforms a caller-supplied presentation catalog, never selects datasets. */
export function projectMultiSelectOptions(
  options: readonly ProjectOption[],
  revealed: boolean,
) {
  return options.map((option) => ({
    value: option.id,
    text: option.label,
    label: option.label,
    searchText: revealed ? option.searchText : undefined,
  }));
}

/** Search the already authorized, display-safe embedded picker catalog. These
 * transient labels are not a Firestore collection; never search raw metadata. */
export function searchOptions<T extends { text: string; searchText?: string }>(
  options: readonly T[],
  search: string,
): T[] {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const key = normalize(search);
  return options.filter((option) =>
    normalize(option.searchText ?? option.text).includes(key),
  );
}
