/** Local reports belong to the exact immutable repository used to calculate them.
 * Check during render: passive-effect clearing is too late after access revocation.
 * Callable reports keep their existing owner/query/revision fences.
 */
export function reportRepositoryMatches(
  direct: boolean,
  current: object | undefined,
  calculated: object | undefined,
): boolean {
  return !direct || (current !== undefined && current === calculated);
}
