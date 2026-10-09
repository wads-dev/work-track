export function readUrlTab<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = params.get(key);
  return allowed.includes(value as T) ? (value as T) : fallback;
}
export function writeUrlTab(
  params: URLSearchParams,
  key: string,
  value: string,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set(key, value);
  return next;
}
export function tabLocation(
  location: { pathname: string; search: string; hash: string },
  key: string,
  value: string,
): string {
  return (
    location.pathname +
    '?' +
    writeUrlTab(new URLSearchParams(location.search), key, value).toString() +
    location.hash
  );
}
