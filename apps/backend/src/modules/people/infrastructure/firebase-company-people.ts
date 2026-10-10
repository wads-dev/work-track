import type { Auth } from 'firebase-admin/auth';
import type {
  CompanyPeoplePage,
  CompanyPeopleRepository,
} from '@work-track/core/people/domain/company-person';

export class FirebaseCompanyPeopleRepository implements CompanyPeopleRepository {
  constructor(private readonly auth: Pick<Auth, 'listUsers'>) {}

  async readPage(
    pageSize: number,
    pageToken?: string,
  ): Promise<CompanyPeoplePage> {
    // Page the Auth directory, not the filtered result. Empty corporate pages
    // can still have a continuation token; never scan the entire directory here.
    const page = await this.auth.listUsers(pageSize, pageToken);
    const people = page.users.flatMap((user) => {
      const email = user.email;
      // Match authorizeReport's corporate email and verification policy. Auth
      // records expose linked providers rather than a token sign_in_provider.
      if (
        typeof email !== 'string' ||
        !/^[^@]+@wads[.]dev$/i.test(email) ||
        user.emailVerified !== true ||
        user.disabled ||
        !user.providerData.some(
          (provider) => provider.providerId === 'google.com',
        )
      )
        return [];
      // Explicit allowlist: UserRecord can contain password hashes, salts,
      // custom claims and token metadata that must never reach the client.
      return [
        {
          uid: user.uid,
          displayName: user.displayName ?? null,
          email,
          photoURL: user.photoURL ?? null,
        },
      ];
    });
    return { people, nextPageToken: page.pageToken ?? null };
  }
}
