import type { Auth, UserRecord } from 'firebase-admin/auth';
import { describe, expect, it, vi } from 'vitest';
import { FirebaseCompanyPeopleRepository } from './firebase-company-people.js';

function user(uid: string, overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    uid,
    email: uid + '@wads.dev',
    emailVerified: true,
    disabled: false,
    displayName: 'Pessoa ' + uid,
    photoURL: 'https://example.com/' + uid + '.png',
    providerData: [
      {
        providerId: 'google.com',
        uid,
        displayName: 'Provider name',
        email: uid + '@wads.dev',
        photoURL: 'https://example.com/provider.png',
        phoneNumber: '',
        toJSON: () => ({}),
      },
    ],
    metadata: {
      creationTime: 'private',
      lastSignInTime: 'private',
      toJSON: () => ({}),
    },
    passwordHash: 'private-hash',
    passwordSalt: 'private-salt',
    tokensValidAfterTime: 'private-token-time',
    customClaims: { secret: 'private-claim' },
    toJSON: () => ({ secret: 'private-json' }),
    ...overrides,
  };
}
function setup() {
  const listUsers = vi.fn<Auth['listUsers']>();
  return {
    listUsers,
    repository: new FirebaseCompanyPeopleRepository({ listUsers }),
  };
}

describe('FirebaseCompanyPeopleRepository', () => {
  it('filters external, disabled, unverified, non-Google and missing-email accounts', async () => {
    const { repository, listUsers } = setup();
    listUsers.mockResolvedValue({
      users: [
        user('alice'),
        user('external', { email: 'external@gmail.com' }),
        user('suffix', { email: 'suffix@wads.dev.evil' }),
        user('subdomain', { email: 'person@sub.wads.dev' }),
        user('disabled', { disabled: true }),
        user('unverified', { emailVerified: false }),
        user('password', {
          providerData: [
            { providerId: 'password' } as UserRecord['providerData'][number],
          ],
        }),
        user('no-provider', { providerData: [] }),
        user('no-email', { email: undefined }),
        user('multiple-at', { email: 'person@evil@wads.dev' }),
        user('bob', {
          email: 'Bob@WADS.DEV',
          displayName: undefined,
          photoURL: undefined,
        }),
      ],
      pageToken: 'next-page',
    });
    expect(await repository.readPage(100)).toEqual({
      people: [
        {
          uid: 'alice',
          displayName: 'Pessoa alice',
          email: 'alice@wads.dev',
          photoURL: 'https://example.com/alice.png',
        },
        {
          uid: 'bob',
          displayName: null,
          email: 'Bob@WADS.DEV',
          photoURL: null,
        },
      ],
      nextPageToken: 'next-page',
    });
    expect(listUsers).toHaveBeenCalledExactlyOnceWith(100, undefined);
  });

  it('preserves continuation on all-external pages and forwards it to the next page', async () => {
    const { repository, listUsers } = setup();
    listUsers
      .mockResolvedValueOnce({
        users: [
          user('external', { email: 'outside@example.com' }),
          user('disabled', { disabled: true }),
        ],
        pageToken: 'opaque-next',
      })
      .mockResolvedValueOnce({
        users: [user('alice', { displayName: undefined, photoURL: undefined })],
      });
    expect(await repository.readPage(2)).toEqual({
      people: [],
      nextPageToken: 'opaque-next',
    });
    expect(await repository.readPage(2, 'opaque-next')).toEqual({
      people: [
        {
          uid: 'alice',
          displayName: null,
          email: 'alice@wads.dev',
          photoURL: null,
        },
      ],
      nextPageToken: null,
    });
    expect(listUsers).toHaveBeenNthCalledWith(1, 2, undefined);
    expect(listUsers).toHaveBeenNthCalledWith(2, 2, 'opaque-next');
  });

  it('returns an empty terminal page', async () => {
    const { repository, listUsers } = setup();
    listUsers.mockResolvedValue({ users: [] });
    expect(await repository.readPage(100)).toEqual({
      people: [],
      nextPageToken: null,
    });
  });

  it('allows a linked Google provider even if other providers are present', async () => {
    const { repository, listUsers } = setup();
    const alice = user('alice');
    listUsers.mockResolvedValue({
      users: [
        {
          ...alice,
          toJSON: () => ({}),
          providerData: [
            { providerId: 'password' } as UserRecord['providerData'][number],
            ...alice.providerData,
          ],
        },
      ],
    });
    expect((await repository.readPage(100)).people).toHaveLength(1);
  });

  it('does not serialize any credential or token metadata from UserRecord', async () => {
    const { repository, listUsers } = setup();
    listUsers.mockResolvedValue({ users: [user('alice')] });
    const result = await repository.readPage(100);
    expect(Object.keys(result.people[0]!)).toEqual([
      'uid',
      'displayName',
      'email',
      'photoURL',
    ]);
    expect(JSON.stringify(result)).not.toContain('private');
  });
});
