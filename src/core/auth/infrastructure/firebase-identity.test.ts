import { describe, expect, it, vi } from 'vitest';
import type { Auth, DecodedIdToken, UserRecord } from 'firebase-admin/auth';
import { FirebaseIdentityService } from './firebase-identity.js';

function setup(
  overrides: Partial<DecodedIdToken> = {},
  userOverrides: Partial<UserRecord> = {},
) {
  const token = {
    uid: 'alice',
    email_verified: true,
    auth_time: Math.floor(Date.now() / 1000),
    firebase: { sign_in_provider: 'google.com', identities: {} },
    ...overrides,
  };
  const user = {
    uid: 'alice',
    email: 'alice@wads.dev',
    emailVerified: true,
    disabled: false,
    providerData: [{ providerId: 'google.com' }],
    tokensValidAfterTime: '1970-01-01T00:00:00Z',
    ...userOverrides,
  };
  const verifyIdToken = vi.fn().mockResolvedValue(token);
  const getUser = vi.fn().mockResolvedValue(user);
  return {
    service: new FirebaseIdentityService({
      verifyIdToken,
      getUser,
    } as unknown as Auth),
    verifyIdToken,
  };
}

describe('Firebase identity verification', () => {
  it('checks signature and revocation through Firebase Admin', async () => {
    const { service, verifyIdToken } = setup();
    expect(await service.verify('signed-token')).toMatchObject({
      uid: 'alice',
      provider: 'google.com',
      emailVerified: true,
    });
    expect(verifyIdToken).toHaveBeenCalledWith('signed-token', true);
  });
  it('rejects non-Google and unverified sign-ins', async () => {
    await expect(
      setup({
        firebase: { sign_in_provider: 'password', identities: {} },
      }).service.verify('token'),
    ).rejects.toThrow();
    await expect(
      setup({ email_verified: false }).service.verify('token'),
    ).rejects.toThrow();
  });
  it('rejects stale login and disabled accounts', async () => {
    await expect(
      setup({ auth_time: 0 }).service.verify('token'),
    ).rejects.toThrow();
    await expect(
      setup({}, { disabled: true }).service.get('alice'),
    ).rejects.toThrow();
  });
});
