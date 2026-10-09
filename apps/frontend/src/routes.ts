export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/app';
  try {
    const url = new URL(value, 'https://work-track.invalid');
    if (
      url.origin !== 'https://work-track.invalid' ||
      !/^\/(app|projects|records|pending|rules)(\/[^/]+)?$/.test(url.pathname)
    )
      return '/app';
    if (/^\/(app|pending|rules)\//.test(url.pathname)) return '/app';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/app';
  }
}
export function detailPath(
  kind: 'projects' | 'records',
  id: string,
  search = '',
) {
  return '/' + kind + '/' + encodeURIComponent(id) + search;
}
export function matchesFilter(values: unknown[], filter: string) {
  const needle = filter.trim().toLocaleLowerCase('pt-BR');
  return (
    !needle ||
    values.some(
      (value) =>
        typeof value === 'string' &&
        value.toLocaleLowerCase('pt-BR').includes(needle),
    )
  );
}
