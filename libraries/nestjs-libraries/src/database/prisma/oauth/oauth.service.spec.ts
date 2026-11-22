import { createHash, randomBytes } from 'crypto';
import { checkRedirectUri, OAuthError, OAuthService, pkceChallenge } from './oauth.service';

// An in-memory OAuthRepository: enough to run the real service logic
function fakeRepository() {
  const clients: any[] = [];
  const grants: any[] = [];
  const clientById = (id: string) => clients.find((c) => c.id === id);
  return {
    clients,
    grants,
    createClient: jest.fn(async (data: any) => {
      const client = { id: `c${clients.length + 1}`, createdAt: new Date(), ...data };
      clients.push(client);
      return client;
    }),
    findClient: jest.fn(async (clientId: string) => clients.find((c) => c.clientId === clientId) ?? null),
    clientSecretHash: jest.fn(async (clientId: string) => clients.find((c) => c.clientId === clientId)?.clientSecretHash ?? null),
    deleteStaleClients: jest.fn(async () => ({ count: 0 })),
    createGrant: jest.fn(async (data: any) => {
      const grant = { id: `g${grants.length + 1}`, revokedAt: null, lastUsedAt: null, ...data };
      grants.push(grant);
      return { id: grant.id };
    }),
    consumeCode: jest.fn(async (codeHash: string) => {
      const grant = grants.find((g) => g.codeHash === codeHash);
      if (!grant) return null;
      const snapshot = { ...grant, client: { clientId: clientById(grant.clientId).clientId } };
      grant.codeHash = null;
      grant.codeExpiresAt = null;
      return snapshot;
    }),
    setTokens: jest.fn(async (id: string, tokens: any) => Object.assign(grants.find((g) => g.id === id), tokens)),
    findByRefreshHash: jest.fn(async (hash: string) => {
      const grant = grants.find((g) => g.refreshTokenHash === hash);
      return grant
        ? {
            ...grant,
            client: { clientId: clientById(grant.clientId).clientId },
            organization: { deletedAt: null },
            user: { deletedAt: null },
          }
        : null;
    }),
    rotate: jest.fn(async (id: string, oldHash: string, tokens: any) => {
      const grant = grants.find((g) => g.id === id && g.refreshTokenHash === oldHash && !g.revokedAt);
      if (!grant) return false;
      Object.assign(grant, tokens);
      return true;
    }),
    findActiveByAccessHash: jest.fn(async (hash: string) => {
      const grant = grants.find(
        (g) => g.accessTokenHash === hash && !g.revokedAt && g.accessExpiresAt.getTime() > Date.now()
      );
      return grant
        ? { id: grant.id, lastUsedAt: grant.lastUsedAt, organization: { id: grant.organizationId, name: 'Studio' }, client: { name: clientById(grant.clientId).name } }
        : null;
    }),
    touch: jest.fn(async () => ({})),
    revokeByTokenHash: jest.fn(async (hash: string) => {
      for (const g of grants) {
        if (g.accessTokenHash === hash || g.refreshTokenHash === hash) g.revokedAt = new Date();
      }
      return { count: 1 };
    }),
    listForUser: jest.fn(),
    revokeForUser: jest.fn(),
    revokeAllForOrg: jest.fn(),
  };
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const verifier = () => randomBytes(32).toString('base64url');
const errorOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return err as OAuthError;
  }
  throw new Error('expected an error');
};
const body = (err: OAuthError) => err.getResponse() as { error: string; redirect?: string };

describe('OAuthService', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.MAIN_URL = 'https://pocket3d.co/';
  });
  afterAll(() => {
    process.env = env;
  });

  const setup = async (registration: Record<string, unknown> = {}) => {
    const repo = fakeRepository();
    const service = new OAuthService(repo as any);
    const client = await service.registerClient({
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      ...registration,
    });
    return { repo, service, client };
  };

  // Consent → code, as the browser would get it back
  const authorize = async (service: OAuthService, clientId: string, codeVerifier = verifier()) => {
    const { redirect } = await service.answerConsent('u1', { id: 'o1', name: 'Studio' }, {
      response_type: 'code',
      client_id: clientId,
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      code_challenge: pkceChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state: 'xyz',
    }, true);
    const url = new URL(redirect);
    return { code: url.searchParams.get('code')!, url, codeVerifier };
  };

  it('accepts https, loopback http and app schemes as redirect URIs, nothing else', () => {
    expect(checkRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBeNull();
    expect(checkRedirectUri('http://localhost:33418/callback')).toBeNull();
    expect(checkRedirectUri('http://127.0.0.1:5000/cb')).toBeNull();
    expect(checkRedirectUri('cursor://anysphere.cursor-mcp/oauth/callback')).toBeNull();
    for (const bad of ['http://evil.com/cb', 'javascript:alert(1)', 'data:text/html,x', 'https://a.com/cb#frag', 'not a url']) {
      expect(checkRedirectUri(bad)).not.toBeNull();
    }
  });

  it('registers public clients, and gives a secret only to clients that ask for one', async () => {
    const { client, repo } = await setup();
    expect(client).toMatchObject({ client_name: 'Claude', token_endpoint_auth_method: 'none' });
    expect(client).not.toHaveProperty('client_secret');

    const confidential = await new OAuthService(repo as any).registerClient({
      redirect_uris: ['https://app.example.com/cb'],
      token_endpoint_auth_method: 'client_secret_post',
    });
    expect(confidential.client_secret).toBeTruthy();
    // only the hash is stored
    expect(repo.clients.at(-1).clientSecretHash).toBe(sha256(confidential.client_secret!));

    expect(body(await errorOf(new OAuthService(repo as any).registerClient({ redirect_uris: [] }))).error).toBe('invalid_redirect_uri');
    expect(body(await errorOf(new OAuthService(repo as any).registerClient({ redirect_uris: ['http://evil.com/cb'] }))).error).toBe('invalid_redirect_uri');
  });

  it('never redirects to an unregistered URI, and sends other errors back to the app', async () => {
    const { service, client } = await setup();
    const unknown = await errorOf(service.checkAuthorizeRequest({ client_id: 'nope', response_type: 'code' }));
    expect(body(unknown)).toMatchObject({ error: 'invalid_client' });
    expect(body(unknown).redirect).toBeUndefined();

    const wrongUri = await errorOf(
      service.checkAuthorizeRequest({ client_id: client.client_id, redirect_uri: 'https://evil.com/cb', response_type: 'code' })
    );
    expect(body(wrongUri).redirect).toBeUndefined();

    const noPkce = await errorOf(
      service.checkAuthorizeRequest({
        client_id: client.client_id,
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        response_type: 'code',
        state: 's1',
      })
    );
    const back = new URL(body(noPkce).redirect!);
    expect(back.origin + back.pathname).toBe('https://claude.ai/api/mcp/auth_callback');
    expect(back.searchParams.get('error')).toBe('invalid_request');
    expect(back.searchParams.get('state')).toBe('s1');
  });

  it('trades a code once, with the right PKCE verifier, for tokens stored as hashes', async () => {
    const { service, client, repo } = await setup();
    const { code, url, codeVerifier } = await authorize(service, client.client_id);
    expect(url.searchParams.get('state')).toBe('xyz');
    expect(url.searchParams.get('iss')).toBe('https://pocket3d.co');

    const wrong = await errorOf(
      service.token({ grant_type: 'authorization_code', client_id: client.client_id, code, code_verifier: verifier() })
    );
    expect(body(wrong).error).toBe('invalid_grant');
    // the failed attempt burned the code: the right verifier can't use it now
    const again = await errorOf(
      service.token({ grant_type: 'authorization_code', client_id: client.client_id, code, code_verifier: codeVerifier })
    );
    expect(body(again).error).toBe('invalid_grant');

    const second = await authorize(service, client.client_id);
    const tokens = await service.token({
      grant_type: 'authorization_code',
      client_id: client.client_id,
      code: second.code,
      code_verifier: second.codeVerifier,
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
    });
    expect(tokens.access_token).toMatch(/^p3d_oat_/);
    expect(tokens.refresh_token).toMatch(/^p3d_ort_/);
    const grant = repo.grants.at(-1);
    expect(grant.accessTokenHash).toBe(sha256(tokens.access_token));
    expect(JSON.stringify(repo.grants)).not.toContain(tokens.access_token);

    await expect(service.validateAccessToken(tokens.access_token)).resolves.toEqual({
      org: { id: 'o1', name: 'Studio' },
      client: 'Claude',
    });
    await expect(service.validateAccessToken('p3d_some_api_key')).resolves.toBeNull();
  });

  it('refuses a code issued to another client or for another redirect URI', async () => {
    const { service, client, repo } = await setup();
    const other = await new OAuthService(repo as any).registerClient({ redirect_uris: ['https://other.example.com/cb'] });
    const stolen = await authorize(service, client.client_id);
    const err = await errorOf(
      service.token({ grant_type: 'authorization_code', client_id: other.client_id, code: stolen.code, code_verifier: stolen.codeVerifier })
    );
    expect(body(err).error).toBe('invalid_grant');

    const next = await authorize(service, client.client_id);
    const mismatch = await errorOf(
      service.token({
        grant_type: 'authorization_code',
        client_id: client.client_id,
        code: next.code,
        code_verifier: next.codeVerifier,
        redirect_uri: 'https://claude.ai/other',
      })
    );
    expect(body(mismatch).error).toBe('invalid_grant');
  });

  it('rotates refresh tokens: an old one stops working', async () => {
    const { service, client } = await setup();
    const { code, codeVerifier } = await authorize(service, client.client_id);
    const first = await service.token({ grant_type: 'authorization_code', client_id: client.client_id, code, code_verifier: codeVerifier });
    const second = await service.token({ grant_type: 'refresh_token', client_id: client.client_id, refresh_token: first.refresh_token });
    expect(second.refresh_token).not.toBe(first.refresh_token);
    await expect(service.validateAccessToken(first.access_token)).resolves.toBeNull();
    await expect(service.validateAccessToken(second.access_token)).resolves.not.toBeNull();

    const replay = await errorOf(
      service.token({ grant_type: 'refresh_token', client_id: client.client_id, refresh_token: first.refresh_token })
    );
    expect(body(replay).error).toBe('invalid_grant');
  });

  it('requires the secret from clients that registered with one', async () => {
    const { repo } = await setup();
    const service = new OAuthService(repo as any);
    const client = await service.registerClient({
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      token_endpoint_auth_method: 'client_secret_basic',
    });
    const { code, codeVerifier } = await authorize(service, client.client_id);
    const anonymous = await errorOf(
      service.token({ grant_type: 'authorization_code', client_id: client.client_id, code, code_verifier: codeVerifier })
    );
    expect(body(anonymous).error).toBe('invalid_client');
    expect(anonymous.getStatus()).toBe(401);

    const next = await authorize(service, client.client_id);
    const basic = 'Basic ' + Buffer.from(`${client.client_id}:${client.client_secret}`).toString('base64');
    const tokens = await service.token({ grant_type: 'authorization_code', code: next.code, code_verifier: next.codeVerifier }, basic);
    expect(tokens.access_token).toBeTruthy();
  });

  it('revoking a token signs the app out', async () => {
    const { service, client } = await setup();
    const { code, codeVerifier } = await authorize(service, client.client_id);
    const tokens = await service.token({ grant_type: 'authorization_code', client_id: client.client_id, code, code_verifier: codeVerifier });
    await expect(service.revokeToken(tokens.refresh_token)).resolves.toEqual({});
    await expect(service.validateAccessToken(tokens.access_token)).resolves.toBeNull();
  });

  it('publishes discovery documents pointing at MAIN_URL', () => {
    const service = new OAuthService(fakeRepository() as any);
    expect(service.protectedResourceMetadata()).toMatchObject({
      resource: 'https://pocket3d.co/mcp',
      authorization_servers: ['https://pocket3d.co'],
    });
    expect(service.authorizationServerMetadata()).toMatchObject({
      issuer: 'https://pocket3d.co',
      authorization_endpoint: 'https://pocket3d.co/oauth/authorize',
      token_endpoint: 'https://pocket3d.co/api/oauth/token',
      registration_endpoint: 'https://pocket3d.co/api/oauth/register',
      code_challenge_methods_supported: ['S256'],
    });
  });
});
