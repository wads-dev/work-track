import type { Response } from 'express';
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  InvalidGrantError,
  InvalidRequestError,
  InvalidScopeError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthStore } from '../domain/oauth-store.js';
import {
  digest,
  secret,
  now,
  requireCompanyIdentity,
  validateRedirect,
  type Identity,
} from '../domain/oauth-security.js';

interface Flow {
  clientId: string;
  redirectUri: string;
  challenge: string;
  scopes: string[];
  state: string;
  resource: string;
  expires: number;
}
interface Code extends Flow {
  uid: string;
  issued: number;
}
interface Token {
  clientId: string;
  uid: string;
  scopes: string[];
  resource: string;
  expires: number;
  issued: number;
  kind: 'access' | 'refresh';
}
export interface IdentityService {
  verify(idToken: string): Promise<Identity>;
  get(uid: string): Promise<Identity>;
}

export class WorkTrackOAuth implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;
  constructor(
    readonly store: OAuthStore,
    readonly identities: IdentityService,
    readonly baseUrl: string,
  ) {
    this.clientsStore = {
      getClient: (id) =>
        store.get<OAuthClientInformationFull>('clients', digest(id)),
      registerClient: async (client) => {
        if (
          client.redirect_uris.length === 0 ||
          client.redirect_uris.length > 10
        )
          throw new InvalidRequestError('Informe entre um e dez redirects.');
        client.redirect_uris.forEach(validateRedirect);
        const registered = {
          ...client,
          client_id: secret(),
          client_id_issued_at: now(),
        };
        await store.put(
          'clients',
          digest(registered.client_id),
          JSON.parse(JSON.stringify(registered)) as OAuthClientInformationFull,
        );
        return registered;
      },
    };
  }
  get resource() {
    return this.baseUrl + '/mcp';
  }
  private checkResource(resource?: URL) {
    if (resource && resource.href !== this.resource)
      throw new InvalidRequestError('Resource inválido.');
  }
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    this.checkResource(params.resource);
    const scopes = params.scopes?.length ? params.scopes : ['mcp'];
    if (scopes.some((scope) => scope !== 'mcp'))
      throw new InvalidScopeError('Scope inválido.');
    if (!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge))
      throw new InvalidRequestError('PKCE S256 obrigatório.');
    const flow = secret();
    await this.store.put<Flow>('flows', digest(flow), {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      challenge: params.codeChallenge,
      scopes,
      state: params.state ?? '',
      resource: this.resource,
      expires: now() + 600,
    });
    res.redirect(this.baseUrl + '/login?flow=' + encodeURIComponent(flow));
  }
  async describeFlow(flowId: string) {
    const flow = await this.store.get<Flow>('flows', digest(flowId));
    if (!flow || flow.expires <= now())
      throw new InvalidGrantError('Solicitação expirada.');
    const client = await this.clientsStore.getClient(flow.clientId);
    return {
      clientName: client?.client_name ?? 'Cliente MCP',
      redirectUri: flow.redirectUri,
    };
  }
  async complete(flowId: string, idToken: string): Promise<string> {
    const identity = await this.identities.verify(idToken);
    requireCompanyIdentity(identity);
    const flow = await this.store.consume<Flow>(
      'flows',
      digest(flowId),
      (value) => {
        if (value.expires <= now())
          throw new InvalidGrantError('Solicitação expirada.');
      },
    );
    const code = secret();
    await this.store.put<Code>('codes', digest(code), {
      ...flow,
      uid: identity.uid,
      issued: now(),
      expires: now() + 120,
    });
    const redirect = new URL(flow.redirectUri);
    redirect.searchParams.set('code', code);
    if (flow.state) redirect.searchParams.set('state', flow.state);
    return redirect.href;
  }
  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
  ): Promise<string> {
    const value = await this.store.get<Code>('codes', digest(code));
    if (!value || value.clientId !== client.client_id || value.expires <= now())
      throw new InvalidGrantError('Código inválido.');
    return value.challenge;
  }
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _verifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    this.checkResource(resource);
    const value = await this.store.consume<Code>(
      'codes',
      digest(code),
      (stored) => {
        if (
          stored.expires <= now() ||
          stored.clientId !== client.client_id ||
          redirectUri !== stored.redirectUri
        )
          throw new InvalidGrantError('Código ou redirect inválido.');
      },
    );
    return this.issue(value);
  }
  private async issue(
    value: Pick<Token, 'clientId' | 'uid' | 'scopes' | 'resource' | 'issued'>,
  ): Promise<OAuthTokens> {
    const identity = await this.identities.get(value.uid);
    requireCompanyIdentity(identity);
    if (identity.validAfter > value.issued)
      throw new InvalidGrantError('Sessão revogada.');
    const access = secret();
    const refresh = secret();
    await this.store.put<Token>('tokens', digest(access), {
      ...value,
      kind: 'access',
      expires: now() + 3600,
    });
    await this.store.put<Token>('tokens', digest(refresh), {
      ...value,
      kind: 'refresh',
      expires: now() + 7 * 86400,
    });
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: value.scopes.join(' '),
    };
  }
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refresh: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    this.checkResource(resource);
    const value = await this.store.consume<Token>(
      'tokens',
      digest(refresh),
      (stored) => {
        if (
          stored.kind !== 'refresh' ||
          stored.expires <= now() ||
          stored.clientId !== client.client_id
        )
          throw new InvalidGrantError('Refresh token inválido.');
        if (scopes?.some((scope) => !stored.scopes.includes(scope)))
          throw new InvalidScopeError('Scope inválido.');
      },
    );
    return this.issue({ ...value, scopes: scopes ?? value.scopes });
  }
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const value = await this.store.get<Token>('tokens', digest(token));
    if (
      !value ||
      value.kind !== 'access' ||
      value.expires <= now() ||
      value.resource !== this.resource
    )
      throw new InvalidTokenError('Token inválido.');
    try {
      const identity = await this.identities.get(value.uid);
      requireCompanyIdentity(identity);
      if (identity.validAfter > value.issued)
        throw new InvalidTokenError('Sessão revogada.');
      return {
        token,
        clientId: value.clientId,
        scopes: value.scopes,
        expiresAt: value.expires,
        resource: new URL(value.resource),
        extra: { uid: identity.uid, email: identity.email },
      };
    } catch {
      throw new InvalidTokenError('Usuário sem acesso.');
    }
  }
  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    const value = await this.store.get<Token>('tokens', digest(request.token));
    if (value?.clientId === client.client_id)
      await this.store.remove('tokens', digest(request.token));
  }
}
