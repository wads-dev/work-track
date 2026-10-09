export type ProjectOption = { id: string; label: string; searchText?: string };
export const matchesProject = (option: ProjectOption, query: string) =>
  (option.searchText ?? option.label)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .includes(
      query
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase(),
    );
