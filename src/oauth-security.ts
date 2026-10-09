import { createHash, randomBytes } from 'node:crypto';
import {
  InvalidClientMetadataError,
  InvalidGrantError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';

export const secret = () => randomBytes(32).toString('base64url');
export const digest = (value: string) =>
  createHash('sha256').update(value).digest('base64url');
export const now = () => Math.floor(Date.now() / 1000);

export interface Identity {
  uid: string;
  email: string;
  emailVerified: boolean;
  provider: string;
  validAfter: number;
}

export function requireCompanyIdentity(identity: Identity): void {
  if (
    !identity.emailVerified ||
    identity.provider !== 'google.com' ||
    identity.email.toLowerCase().split('@').length !== 2 ||
    identity.email.toLowerCase().split('@')[1] !== 'wads.dev'
  ) {
    throw new InvalidGrantError('Use uma conta Google verificada @wads.dev.');
  }
}

export function validateRedirect(uri: string): void {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new InvalidClientMetadataError('Redirect inválido.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.hash ||
    !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))
  ) {
    throw new InvalidClientMetadataError(
      'Redirect deve usar HTTPS ou loopback local.',
    );
  }
}
