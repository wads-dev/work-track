export function topicDetailsPath(projectId: string, topicId: string) {
  const valid = (id: string) =>
    !!id &&
    !/[ /\\]/.test(id.replaceAll(' ', '')) &&
    !Array.from(id).some((c) => c.charCodeAt(0) < 32) &&
    id !== '.' &&
    id !== '..';
  if (!valid(projectId) || !valid(topicId))
    throw new Error('Identidade de assunto inválida.');
  return (
    '/projects/' +
    encodeURIComponent(projectId) +
    '/topics/' +
    encodeURIComponent(topicId)
  );
}
export function safeReturnTo(value: string | null): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    Array.from(value).some((c) => c.charCodeAt(0) < 32) ||
    /%(?:2e|2f|5c|25|00)/i.test(value.split(/[?#]/)[0])
  )
    return '/app';
  try {
    const url = new URL(value, 'https://work-track.invalid');
    if (
      url.origin !== 'https://work-track.invalid' ||
      !(
        /^\/(app|projects|records|pending|rules|calendar|me)(\/[^/]+)?$/.test(
          url.pathname,
        ) || /^\/projects\/[^/]+\/topics\/[^/]+$/.test(url.pathname)
      ) ||
      /%(?:2f|5c|25)|[\\]/i.test(url.pathname)
    )
      return '/app';
    if (/^\/(app|pending|rules|calendar|me)\//.test(url.pathname))
      return '/app';
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
export function contextualRecordPath(
  path: string,
  search: string,
  recordId: string,
) {
  const params = new URLSearchParams(search);
  params.set('record', recordId);
  return path + '?' + params.toString();
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
