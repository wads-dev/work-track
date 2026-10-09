import { describe, expect, it } from 'vitest';
import {
  digest,
  requireCompanyIdentity,
  validateRedirect,
} from './oauth-security.js';

const identity = {
  uid: 'user',
  email: 'user@wads.dev',
  emailVerified: true,
  provider: 'google.com',
  validAfter: 0,
};
describe('OAuth security', () => {
  it('accepts only verified Google company identities', () => {
    expect(() => requireCompanyIdentity(identity)).not.toThrow();
    for (const override of [
      { email: 'user@evilwads.dev' },
      { email: 'user@wads.dev.evil.com' },
      { emailVerified: false },
      { provider: 'password' },
    ]) {
      expect(() =>
        requireCompanyIdentity({ ...identity, ...override }),
      ).toThrow();
    }
  });
  it('allows HTTPS and loopback, rejects insecure redirects', () => {
    for (const uri of [
      'https://example.com/callback',
      'http://localhost:3334/oauth/callback',
      'http://127.0.0.1:3334/callback',
    ])
      expect(() => validateRedirect(uri)).not.toThrow();
    for (const uri of [
      'http://evil.com/callback',
      'javascript:alert(1)',
      'https://user:password@example.com/callback',
      'https://example.com/#token',
    ])
      expect(() => validateRedirect(uri)).toThrow();
  });
  it('derives RFC 7636 S256 challenge', () => {
    expect(digest('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});
