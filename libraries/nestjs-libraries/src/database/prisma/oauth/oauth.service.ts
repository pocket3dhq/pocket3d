import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { OAuthRepository } from '@pocket3d/nestjs-libraries/database/prisma/oauth/oauth.repository';
import {
  AuthorizeRequestDto,
  RegisterClientDto,
  TokenRequestDto,
} from '@pocket3d/nestjs-libraries/dtos/oauth/oauth.dtos';
import {
  hashSecret,
  makeOAuthAccessToken,
  makeOAuthClientId,
  makeOAuthCode,
  makeOAuthRefreshToken,
  makeToken,
  OAUTH_ACCESS_PREFIX,
} from '@pocket3d/nestjs-libraries/services/secret.token';
import { mainUrl, mcpUrl } from '@pocket3d/nestjs-libraries/services/main.url';
import { AuthOrg } from '@pocket3d/nestjs-libraries/user/request.types';

// OAuth 2.1 for MCP connectors (Claude, Cursor, Codex...): dynamic client
// registration, authorization code + PKCE (S256 only), rotating refresh
// tokens. Codes and tokens are random and stored as sha256 only, like API keys
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
export const OAUTH_CODE_TTL_MS = MINUTE;
export const OAUTH_ACCESS_TTL_MS = 30 * DAY;
export const OAUTH_REFRESH_TTL_MS = 90 * DAY;
const TOUCH_EVERY_MS = MINUTE;
export const OAUTH_SCOPE = 'mcp';

const AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'];
// Schemes a browser would run in our origin can never be a callback
const BLOCKED_SCHEMES = ['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'about:'];
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

// Errors in the RFC 6749 shape. `redirect` is set when the error may go back
// to the client (its redirect_uri was verified); otherwise the consent page
// shows it, since redirecting to an unverified URI would be an open redirect
export class OAuthError extends HttpException {
  constructor(error: string, description: string, status = HttpStatus.BAD_REQUEST, redirect?: string) {
    super({ error, error_description: description, ...(redirect ? { redirect } : {}) }, status);
  }
}

// RFC 7636: BASE64URL(SHA256(verifier)) == challenge
export const pkceChallenge = (verifier: string) =>
  createHash('sha256').update(verifier).digest('base64url');

const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const PKCE_CHALLENGE = /^[A-Za-z0-9\-_]{43}$/;

const sameSecret = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

// Exposed for the spec: a redirect URI must be an exact string match, and its
// scheme https, loopback http, or a private-use scheme (cursor://...)
export function checkRedirectUri(uri: string) {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return `Invalid redirect_uri: ${uri}`;
  }
  if (BLOCKED_SCHEMES.includes(parsed.protocol)) {
    return `redirect_uri scheme "${parsed.protocol}" is not allowed`;
  }
  if (parsed.hash) {
    return 'redirect_uri must not contain a fragment';
  }
  if (parsed.protocol === 'http:' && !LOOPBACK_HOSTS.includes(parsed.hostname)) {
    return 'redirect_uri must use https (http is allowed for localhost only)';
  }
  return null;
}

// Adds code/state/iss (or error) to the client's redirect URI
const withParams = (redirectUri: string, params: Record<string, string | undefined>) => {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
};

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

@Injectable()
export class OAuthService {
  constructor(private _oauthRepository: OAuthRepository) {}

  // RFC 8414. The issuer is MAIN_URL; /oauth/authorize is the consent page,
  // everything else is the backend under /api
  authorizationServerMetadata() {
    const base = mainUrl();
    return {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      registration_endpoint: `${base}/api/oauth/register`,
      revocation_endpoint: `${base}/api/oauth/revoke`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: AUTH_METHODS,
      revocation_endpoint_auth_methods_supported: AUTH_METHODS,
      code_challenge_methods_supported: ['S256'],
      scopes_supported: [OAUTH_SCOPE],
      authorization_response_iss_parameter_supported: true,
    };
  }

  // RFC 9728: what the MCP endpoint is and who issues its tokens
  protectedResourceMetadata() {
    return {
      resource: mcpUrl(),
      authorization_servers: [mainUrl()],
      scopes_supported: [OAUTH_SCOPE],
      bearer_methods_supported: ['header'],
      resource_name: 'pocket3d',
      resource_documentation: `${mainUrl()}/llms.txt`,
    };
  }

  async registerClient(dto: RegisterClientDto) {
    const redirectUris = (dto.redirect_uris || []).map((uri) => uri.trim()).filter(Boolean);
    if (!redirectUris.length) {
      throw new OAuthError('invalid_redirect_uri', 'At least one redirect_uri is required');
    }
    for (const uri of redirectUris) {
      const problem = checkRedirectUri(uri);
      if (problem) {
        throw new OAuthError('invalid_redirect_uri', problem);
      }
    }
    if (dto.grant_types?.length && !dto.grant_types.includes('authorization_code')) {
      throw new OAuthError('invalid_client_metadata', 'Only the authorization_code grant is supported');
    }
    if (dto.response_types?.length && !dto.response_types.includes('code')) {
      throw new OAuthError('invalid_client_metadata', 'Only the code response type is supported');
    }
    const method = dto.token_endpoint_auth_method || 'none';
    if (!AUTH_METHODS.includes(method)) {
      throw new OAuthError('invalid_client_metadata', `token_endpoint_auth_method must be one of ${AUTH_METHODS.join(', ')}`);
    }

    // Abandoned flows leave clients behind; drop the month-old unused ones
    this._oauthRepository.deleteStaleClients(new Date(Date.now() - 30 * DAY)).catch(() => undefined);

    const clientId = makeOAuthClientId();
    const clientSecret = method === 'none' ? undefined : makeToken();
    const client = await this._oauthRepository.createClient({
      clientId,
      clientSecretHash: clientSecret && hashSecret(clientSecret),
      tokenEndpointAuthMethod: method,
      name: (dto.client_name || '').trim().slice(0, 100) || 'MCP client',
      redirectUris,
    });

    return {
      client_id: client.clientId,
      ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: OAUTH_SCOPE,
    };
  }

  // What the consent page shows, or why it can't. Client and redirect URI
  // first: until both are verified, nothing may redirect
  async checkAuthorizeRequest(query: AuthorizeRequestDto) {
    const client = query.client_id ? await this._oauthRepository.findClient(query.client_id) : null;
    if (!client) {
      throw new OAuthError('invalid_client', 'Unknown client. Reconnect the app to register it again.');
    }
    const redirectUri =
      query.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
    if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
      throw new OAuthError('invalid_request', 'The redirect_uri does not match the one the app registered.');
    }

    const fail = (error: string, description: string) =>
      new OAuthError(
        error,
        description,
        HttpStatus.BAD_REQUEST,
        withParams(redirectUri, { error, error_description: description, state: query.state, iss: mainUrl() })
      );
    if (query.response_type !== 'code') {
      throw fail('unsupported_response_type', 'Only response_type=code is supported');
    }
    if (!query.code_challenge || query.code_challenge_method !== 'S256') {
      throw fail('invalid_request', 'PKCE is required (code_challenge with code_challenge_method=S256)');
    }
    if (!PKCE_CHALLENGE.test(query.code_challenge)) {
      throw fail('invalid_request', 'Malformed code_challenge');
    }

    let redirectHost: string;
    try {
      const parsed = new URL(redirectUri);
      redirectHost = parsed.host || parsed.protocol.replace(/:$/, '');
    } catch {
      redirectHost = redirectUri;
    }
    return {
      client: { name: client.name },
      redirectHost,
      clientInternalId: client.id,
      redirectUri,
      codeChallenge: query.code_challenge,
    };
  }

  // The signed-in user's answer. Returns where the browser goes next
  async answerConsent(userId: string, org: AuthOrg, query: AuthorizeRequestDto, allow: boolean) {
    const checked = await this.checkAuthorizeRequest(query);
    if (!allow) {
      return {
        redirect: withParams(checked.redirectUri, {
          error: 'access_denied',
          error_description: 'The user denied access',
          state: query.state,
          iss: mainUrl(),
        }),
      };
    }
    const code = makeOAuthCode();
    await this._oauthRepository.createGrant({
      clientId: checked.clientInternalId,
      userId,
      organizationId: org.id,
      codeHash: hashSecret(code),
      codeExpiresAt: new Date(Date.now() + OAUTH_CODE_TTL_MS),
      codeChallenge: checked.codeChallenge,
      redirectUri: checked.redirectUri,
    });
    return { redirect: withParams(checked.redirectUri, { code, state: query.state, iss: mainUrl() }) };
  }

  // Client authentication at the token and revoke endpoints: the client_id
  // from the body or from HTTP Basic, and the secret when the client has one
  private async authenticateClient(body: { client_id?: string; client_secret?: string }, authorization?: string) {
    let clientId = body.client_id;
    let clientSecret = body.client_secret;
    if (authorization?.startsWith('Basic ')) {
      const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
      const colon = decoded.indexOf(':');
      if (colon > 0) {
        clientId = decodeURIComponent(decoded.slice(0, colon));
        clientSecret = decodeURIComponent(decoded.slice(colon + 1));
      }
    }
    const client = clientId ? await this._oauthRepository.findClient(clientId) : null;
    if (!client) {
      throw new OAuthError('invalid_client', 'Unknown client', HttpStatus.UNAUTHORIZED);
    }
    if (client.tokenEndpointAuthMethod !== 'none') {
      const expected = await this._oauthRepository.clientSecretHash(client.clientId);
      if (!expected || !clientSecret || !sameSecret(hashSecret(clientSecret), expected)) {
        throw new OAuthError('invalid_client', 'Client authentication failed', HttpStatus.UNAUTHORIZED);
      }
    }
    return client;
  }

  private async issueTokens(grantId: string, rotateFrom?: string): Promise<TokenResponse> {
    const accessToken = makeOAuthAccessToken();
    const refreshToken = makeOAuthRefreshToken();
    const tokens = {
      accessTokenHash: hashSecret(accessToken),
      accessExpiresAt: new Date(Date.now() + OAUTH_ACCESS_TTL_MS),
      refreshTokenHash: hashSecret(refreshToken),
      refreshExpiresAt: new Date(Date.now() + OAUTH_REFRESH_TTL_MS),
    };
    if (rotateFrom) {
      if (!(await this._oauthRepository.rotate(grantId, rotateFrom, tokens))) {
        throw new OAuthError('invalid_grant', 'The refresh token was already used');
      }
    } else {
      await this._oauthRepository.setTokens(grantId, tokens);
    }
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: Math.floor(OAUTH_ACCESS_TTL_MS / 1000),
      refresh_token: refreshToken,
      scope: OAUTH_SCOPE,
    };
  }

  async token(body: TokenRequestDto, authorization?: string): Promise<TokenResponse> {
    if (body.grant_type === 'authorization_code') {
      return this.exchangeCode(body, authorization);
    }
    if (body.grant_type === 'refresh_token') {
      return this.refresh(body, authorization);
    }
    throw new OAuthError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
  }

  private async exchangeCode(body: TokenRequestDto, authorization?: string) {
    const client = await this.authenticateClient(body, authorization);
    if (!body.code || !body.code_verifier) {
      throw new OAuthError('invalid_request', 'code and code_verifier are required');
    }
    // Burned before any check, so a stolen code can't be tried twice
    const grant = await this._oauthRepository.consumeCode(hashSecret(body.code));
    const invalid = new OAuthError('invalid_grant', 'The code is invalid, expired or already used');
    if (!grant || grant.revokedAt || !grant.codeExpiresAt || grant.codeExpiresAt.getTime() < Date.now()) {
      throw invalid;
    }
    if (grant.client.clientId !== client.clientId) {
      throw invalid;
    }
    if (body.redirect_uri !== undefined && body.redirect_uri !== grant.redirectUri) {
      throw new OAuthError('invalid_grant', 'redirect_uri does not match the authorization request');
    }
    if (!PKCE_VERIFIER.test(body.code_verifier) || !sameSecret(pkceChallenge(body.code_verifier), grant.codeChallenge)) {
      throw new OAuthError('invalid_grant', 'PKCE verification failed');
    }
    return this.issueTokens(grant.id);
  }

  private async refresh(body: TokenRequestDto, authorization?: string) {
    const client = await this.authenticateClient(body, authorization);
    if (!body.refresh_token) {
      throw new OAuthError('invalid_request', 'refresh_token is required');
    }
    const refreshHash = hashSecret(body.refresh_token);
    const grant = await this._oauthRepository.findByRefreshHash(refreshHash);
    if (
      !grant ||
      grant.revokedAt ||
      grant.client.clientId !== client.clientId ||
      !grant.refreshExpiresAt ||
      grant.refreshExpiresAt.getTime() < Date.now() ||
      grant.organization.deletedAt ||
      grant.user.deletedAt
    ) {
      throw new OAuthError('invalid_grant', 'The refresh token is invalid, expired or revoked');
    }
    return this.issueTokens(grant.id, refreshHash);
  }

  // RFC 7009: always 200, whether or not the token existed
  async revokeToken(token?: string) {
    if (token) {
      await this._oauthRepository.revokeByTokenHash(hashSecret(token));
    }
    return {};
  }

  isAccessToken(token: string) {
    return token.startsWith(OAUTH_ACCESS_PREFIX);
  }

  // The MCP middleware's check for "Authorization: Bearer p3d_oat_..."
  async validateAccessToken(token?: string): Promise<{ org: AuthOrg; client: string } | null> {
    if (!token || !this.isAccessToken(token)) {
      return null;
    }
    const grant = await this._oauthRepository.findActiveByAccessHash(hashSecret(token));
    if (!grant) {
      return null;
    }
    if (!grant.lastUsedAt || Date.now() - grant.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
      await this._oauthRepository.touch(grant.id);
    }
    return { org: grant.organization, client: grant.client.name };
  }

  // "Connected apps" in the dashboard
  async listGrants(userId: string, organizationId: string) {
    const grants = await this._oauthRepository.listForUser(userId, organizationId);
    return grants.map((grant) => ({
      id: grant.id,
      name: grant.client.name,
      createdAt: grant.createdAt,
      lastUsedAt: grant.lastUsedAt,
    }));
  }

  async revokeGrant(userId: string, organizationId: string, id: string) {
    const { count } = await this._oauthRepository.revokeForUser(userId, organizationId, id);
    if (!count) {
      throw new NotFoundException('Connected app not found');
    }
    return { revoked: true };
  }

  revokeAllForOrg(organizationId: string) {
    return this._oauthRepository.revokeAllForOrg(organizationId);
  }
}
