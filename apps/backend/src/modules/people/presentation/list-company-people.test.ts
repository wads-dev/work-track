import { HttpsError } from 'firebase-functions/v2/https';
import { describe, expect, it, vi } from 'vitest';
import type { ReportAuth } from '../../reports/presentation/get-project-report.js';
import type { CompanyPeopleRepository } from '@work-track/core/people/domain/company-person';
import { listCompanyPeopleHandler } from './list-company-people.js';

const auth: ReportAuth = {
  uid: 'alice',
  token: {
    email: 'alice@wads.dev',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  },
};
function setup() {
  const readPage = vi
    .fn<CompanyPeopleRepository['readPage']>()
    .mockResolvedValue({ people: [], nextPageToken: null });
  return { repository: { readPage }, readPage };
}

describe('listCompanyPeople callable handler', () => {
  it.each([
    undefined,
    { ...auth, token: { ...auth.token, email: 'alice@gmail.com' } },
    { ...auth, token: { ...auth.token, email: 'alice@wads.dev.evil' } },
    { ...auth, token: { ...auth.token, email: 'alice@sub.wads.dev' } },
    { ...auth, token: { ...auth.token, email_verified: false } },
    { ...auth, token: { ...auth.token, email_verified: 'true' } },
    { ...auth, token: { ...auth.token, email: undefined } },
    {
      ...auth,
      token: { ...auth.token, firebase: { sign_in_provider: 'password' } },
    },
  ])(
    'rejects unauthorized requests before validating input or reading Auth',
    async (invalid) => {
      const { repository, readPage } = setup();
      await expect(
        listCompanyPeopleHandler(repository, null, invalid),
      ).rejects.toMatchObject({
        code: invalid ? 'permission-denied' : 'unauthenticated',
      });
      expect(readPage).not.toHaveBeenCalled();
    },
  );

  it.each([
    undefined,
    null,
    [],
    'data',
    { pageSize: 0 },
    { pageSize: -1 },
    { pageSize: 101 },
    { pageSize: 1.5 },
    { pageSize: '100' },
    { pageSize: null },
    { pageToken: '' },
    { pageToken: 12 },
    { pageToken: null },
    { pageToken: 'x'.repeat(2049) },
    { uid: 'other' },
    { includeDisabled: true },
  ])('rejects invalid and non-strict inputs', async (data) => {
    const { repository, readPage } = setup();
    await expect(
      listCompanyPeopleHandler(repository, data, auth),
    ).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'Página ou limite inválido.',
    });
    expect(readPage).not.toHaveBeenCalled();
  });

  it('defaults to 100 and preserves the empty terminal contract', async () => {
    const { repository, readPage } = setup();
    expect(await listCompanyPeopleHandler(repository, {}, auth)).toEqual({
      people: [],
      nextPageToken: null,
    });
    expect(readPage).toHaveBeenCalledExactlyOnceWith(100, undefined);
  });

  it.each([1, 100])(
    'forwards bounded pageSize %i and opaque pageToken',
    async (pageSize) => {
      const { repository, readPage } = setup();
      readPage.mockResolvedValue({ people: [], nextPageToken: 'next-page' });
      expect(
        await listCompanyPeopleHandler(
          repository,
          { pageSize, pageToken: 'opaque+/=token' },
          auth,
        ),
      ).toEqual({ people: [], nextPageToken: 'next-page' });
      expect(readPage).toHaveBeenCalledExactlyOnceWith(
        pageSize,
        'opaque+/=token',
      );
    },
  );

  it('returns only public fields even if the repository supplies extra metadata', async () => {
    const { repository, readPage } = setup();
    const person = {
      uid: 'alice',
      displayName: null,
      email: 'alice@wads.dev',
      photoURL: null,
      passwordHash: 'private-password',
      token: 'private-token',
    };
    readPage.mockResolvedValue({ people: [person], nextPageToken: null });
    const result = await listCompanyPeopleHandler(repository, {}, auth);
    expect(result).toEqual({
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
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it.each([
    new Error('private credentials and page token'),
    new HttpsError('permission-denied', 'private upstream error', {
      token: 'private',
    }),
    { code: 'auth/invalid-page-token', message: 'private token' },
  ])(
    'sanitizes all upstream errors without copying their code, message or details',
    async (error) => {
      const { repository, readPage } = setup();
      readPage.mockRejectedValue(error);
      await expect(
        listCompanyPeopleHandler(repository, {}, auth),
      ).rejects.toMatchObject({
        code: 'internal',
        message: 'Não foi possível consultar as pessoas da empresa.',
        details: undefined,
      });
    },
  );
});
