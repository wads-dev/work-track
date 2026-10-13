import { personName, type CompanyPerson } from './company-people';
import { matchesFilter } from '../../app/routes';
/** Firebase Auth listUsers supports page tokens, not full-text/substring queries.
 * This complete, account-scoped directory is the genuine repository residual;
 * project privacy is deliberately unrelated to people's identity/search. */
export function createCompanyPeopleRepository(
  people: readonly CompanyPerson[],
) {
  const byUid = new Map(people.map((person) => [person.uid, person]));
  return {
    read: (uid: string) => byUid.get(uid),
    name: (uid: string) => {
      const person = byUid.get(uid);
      return person ? personName(person) : undefined;
    },
    select: (query = '') => ({
      people: people.filter((person) =>
        matchesFilter([personName(person), person.email, person.uid], query),
      ),
      total: people.length,
    }),
  };
}
