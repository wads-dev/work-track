export type CompanyPerson = {
  uid: string;
  displayName: string | null;
  email: string;
  photoURL: string | null;
};
export type CompanyPeoplePage = {
  people: CompanyPerson[];
  nextPageToken: string | null;
};
export function personName(person: CompanyPerson) {
  return person.displayName?.trim() || person.email || person.uid;
}
export function personPhoto(url: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}
// Publish only a complete directory; an empty filtered page is not the end.
export async function loadCompanyPeople(
  fetchPage: (input: {
    pageSize: number;
    pageToken?: string;
  }) => Promise<CompanyPeoplePage>,
  cancelled: () => boolean = () => false,
): Promise<CompanyPerson[]> {
  const people = new Map<string, CompanyPerson>();
  const visited = new Set<string>();
  let pageToken: string | undefined;
  do {
    if (cancelled()) return [];
    const page = await fetchPage({
      pageSize: 100,
      ...(pageToken ? { pageToken } : {}),
    });
    if (cancelled()) return [];
    for (const person of page.people) people.set(person.uid, person);
    pageToken = page.nextPageToken || undefined;
    if (pageToken) {
      if (visited.has(pageToken))
        throw new Error('Paginação de pessoas inválida.');
      visited.add(pageToken);
    }
  } while (pageToken);
  return [...people.values()].sort(
    (a, b) =>
      personName(a).localeCompare(personName(b), 'pt-BR') ||
      a.uid.localeCompare(b.uid),
  );
}
