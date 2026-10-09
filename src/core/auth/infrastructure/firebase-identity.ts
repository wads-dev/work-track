import type { Auth, UserRecord } from 'firebase-admin/auth';
import { InvalidGrantError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { IdentityService } from '../application/oauth-provider.js';
import type { Identity } from '../domain/oauth-security.js';

export class FirebaseIdentityService implements IdentityService {
  constructor(private readonly auth: Auth) {}

  private fromUser(user: UserRecord): Identity {
    if (user.disabled) throw new InvalidGrantError('Usuário desativado.');
    return {
      uid: user.uid,
      email: user.email ?? '',
      emailVerified: user.emailVerified,
      provider: user.providerData.some(
        (provider) => provider.providerId === 'google.com',
      )
        ? 'google.com'
        : '',
      validAfter: user.tokensValidAfterTime
        ? Math.floor(Date.parse(user.tokensValidAfterTime) / 1000)
        : 0,
    };
  }

  async verify(idToken: string): Promise<Identity> {
    const decoded = await this.auth.verifyIdToken(idToken, true);
    if (
      decoded.firebase.sign_in_provider !== 'google.com' ||
      decoded.email_verified !== true
    ) {
      throw new InvalidGrantError('Login Google verificado obrigatório.');
    }
    // Consent must follow a fresh interactive login, not a stale Firebase session.
    if (Math.floor(Date.now() / 1000) - decoded.auth_time > 600) {
      throw new InvalidGrantError('Faça login novamente para autorizar.');
    }
    return this.fromUser(await this.auth.getUser(decoded.uid));
  }

  async get(uid: string): Promise<Identity> {
    return this.fromUser(await this.auth.getUser(uid));
  }
}
