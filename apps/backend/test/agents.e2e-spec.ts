import { randomBytes } from 'crypto';
import {
  createKey,
  createTestApp,
  nextIp,
  PASSWORD,
  publish,
  resetDatabase,
  signUp,
  TestApp,
  triangleGlb,
} from './helpers';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { pkceChallenge } from '@pocket3d/nestjs-libraries/database/prisma/oauth/oauth.service';
import { API_THROTTLE } from '@pocket3d/nestjs-libraries/throttler/throttler.provider';

// The agent loop against the real app and database: the public API's model
// lifecycle, the MCP server (API key and OAuth), upload links, and that
// deleting an account cuts every agent off
describe('agents (e2e)', () => {
  let t: TestApp;
  const MAIN = 'http://localhost:4200';
  const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  // A signed-up user with an API key
  const account = async () => {
    const user = await signUp(t);
    const key = await createKey(t, user.cookie);
    return { ...user, key: key.key };
  };

  // One JSON-RPC call to /mcp; returns the parsed answer
  let rpcId = 0;
  const mcp = (auth: string | null, method: string, params?: unknown, path = '/mcp') => {
    const req = t
      .http()
      .post(path)
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream');
    if (auth) req.set('Authorization', `Bearer ${auth}`);
    return req.send({ jsonrpc: '2.0', id: ++rpcId, method, ...(params ? { params } : {}) });
  };
  const callTool = async (auth: string, name: string, args: Record<string, unknown> = {}) => {
    const res = await mcp(auth, 'tools/call', { name, arguments: args });
    expect(res.status).toBe(200);
    const result = res.body.result;
    const text = result.content[0].text as string;
    let value: any = text;
    try {
      value = JSON.parse(text);
    } catch {
      // plain message (tool errors)
    }
    return { isError: !!result.isError, value };
  };

  describe('public API: the whole model lifecycle with an API key', () => {
    it('lists, renames (by id or share link) and deletes models', async () => {
      const { key } = await account();
      const published = (await publish(t, key, 'Robot')).body;

      const list = await t.http().get('/public/v1/assets').set('Authorization', key);
      expect(list.status).toBe(200);
      expect(list.body).toMatchObject({ total: 1, assets: [{ id: published.id, title: 'Robot', url: published.url }] });
      expect(JSON.stringify(list.body)).not.toMatch(/"name"|coverName/);

      const renamed = await t
        .http()
        .put(`/public/v1/assets/${published.id}`)
        .set('Authorization', key)
        .send({ title: 'Robot v2' });
      expect(renamed.status).toBe(200);
      expect(renamed.body.title).toBe('Robot v2');

      const deleted = await t.http().delete(`/public/v1/assets/${published.id}`).set('Authorization', key);
      expect(deleted.body).toEqual({ deleted: true });
      expect((await t.http().get(`/public/assets/${published.id}`)).status).toBe(404);
    });

    it("can't touch another org's models", async () => {
      const owner = await account();
      const other = await account();
      const published = (await publish(t, owner.key)).body;
      expect((await t.http().delete(`/public/v1/assets/${published.id}`).set('Authorization', other.key)).status).toBe(404);
      expect((await t.http().get('/public/v1/assets').set('Authorization', other.key)).body.total).toBe(0);
    });

    it('refuses to fetch private or local URLs', async () => {
      const { key } = await account();
      for (const url of ['http://localhost:3000/a.glb', 'http://127.0.0.1/a.glb', 'http://169.254.169.254/latest', 'file:///etc/passwd']) {
        const res = await t.http().post('/public/v1/assets/from-url').set('Authorization', key).send({ url });
        expect(res.status).toBe(400);
      }
    });
  });

  describe('MCP with an API key', () => {
    it('answers 401 with a pointer to OAuth discovery when unauthenticated', async () => {
      const res = await mcp(null, 'tools/list');
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toBe(
        `Bearer resource_metadata="${MAIN}/.well-known/oauth-protected-resource/mcp"`
      );
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });

    it('initializes, lists the tools and acts on the key owner\'s models only', async () => {
      const { key } = await account();
      const init = await mcp(key, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'e2e', version: '1' },
      });
      expect(init.status).toBe(200);
      expect(init.body.result.serverInfo.name).toBe('pocket3d');
      expect(init.body.result.instructions).toContain('create_upload_link');

      const tools = await mcp(key, 'tools/list');
      expect(tools.body.result.tools.map((tool: any) => tool.name).sort()).toEqual(
        ['create_upload_link', 'delete_model', 'list_models', 'publish_from_url', 'rename_model', 'whoami'].sort()
      );

      const published = (await publish(t, key, 'Chair')).body;
      const listed = await callTool(key, 'list_models');
      expect(listed.value.models).toEqual([expect.objectContaining({ id: published.id, title: 'Chair', url: published.url })]);

      const renamed = await callTool(key, 'rename_model', { model: published.url, title: 'Armchair' });
      expect(renamed.value.title).toBe('Armchair');

      const missing = await callTool(key, 'delete_model', { model: 'AAAAAAAAAAAA' });
      expect(missing).toEqual({ isError: true, value: 'Model not found' });

      const local = await callTool(key, 'publish_from_url', { url: 'http://127.0.0.1/model.glb' });
      expect(local.isError).toBe(true);
      expect(local.value).toMatch(/public/);

      expect((await callTool(key, 'delete_model', { model: published.id })).value).toEqual({ deleted: true });
    });

    // What Claude.ai speaks first: the 2026-07-28 protocol (server/discover,
    // per-request envelope), through the official v2 client pinned to it
    it('serves 2026-07-28 clients with the same tools', async () => {
      const { key } = await account();
      const published = (await publish(t, key, 'Modern')).body;
      await t.app.listen(0, '127.0.0.1');
      const { port } = t.app.getHttpServer().address();
      const client = new Client({ name: 'e2e-modern', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
          requestInit: { headers: { Authorization: `Bearer ${key}` } },
        })
      );
      try {
        expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28');
        const tools = (await client.listTools()).tools.map((tool) => tool.name).sort();
        expect(tools).toEqual(['create_upload_link', 'delete_model', 'list_models', 'publish_from_url', 'rename_model', 'whoami']);
        const listed = await client.callTool({ name: 'list_models', arguments: {} });
        const text = (listed.content as { type: string; text: string }[])[0].text;
        expect(JSON.parse(text).models).toEqual([expect.objectContaining({ id: published.id, title: 'Modern' })]);
      } finally {
        await client.close();
      }
    });

    it('also works with the key in the path, and refuses GET (stateless server)', async () => {
      const { key } = await account();
      const res = await mcp(null, 'tools/list', undefined, `/mcp/${key}`);
      expect(res.status).toBe(200);
      expect((await t.http().get('/mcp').set('Authorization', `Bearer ${key}`)).status).toBe(405);
    });
  });

  describe('upload links', () => {
    const uploadPath = (uploadUrl: string) => uploadUrl.replace(`${MAIN}/api`, '');

    it('publish a local file once, into the right org, without an API key', async () => {
      const { key } = await account();
      const link = (await callTool(key, 'create_upload_link', { title: 'From the sandbox' })).value;
      expect(link.upload_url).toMatch(new RegExp(`^${MAIN}/api/public/v1/uploads/p3d_up_`));
      expect(link.command).toContain(link.upload_url);
      const token = link.upload_url.split('/').pop();
      expect(link.upload_page).toBe(`${MAIN}/u/${token}`);

      // the browser page looks at the link without using it up
      for (let i = 0; i < 2; i++) {
        const peek = await t.http().get(`/public/v1/uploads/${token}`);
        expect(peek.status).toBe(200);
        expect(peek.body).toEqual({ title: 'From the sandbox', expiresAt: expect.any(String) });
      }

      const upload = () =>
        t
          .http()
          .post(uploadPath(link.upload_url))
          .attach('file', triangleGlb(), { filename: 'triangle.glb', contentType: 'model/gltf-binary' });
      const first = await upload();
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({ title: 'From the sandbox', url: expect.stringMatching(/\/m\/[A-Za-z0-9]{12}$/) });

      const again = await upload();
      expect(again.status).toBe(410);
      expect((await t.http().get(`/public/v1/uploads/${token}`)).status).toBe(410);

      const listed = await t.http().get('/public/v1/assets').set('Authorization', key);
      expect(listed.body.total).toBe(1);
      // the token is only ever stored hashed
      const tickets = await t.prisma.uploadTicket.findMany();
      expect(JSON.stringify(tickets)).not.toContain(link.upload_url.split('/').pop());
    });

    it('refuses unknown and expired links', async () => {
      const { key } = await account();
      const unknown = await t
        .http()
        .post('/public/v1/uploads/p3d_up_nope')
        .attach('file', triangleGlb(), { filename: 'a.glb', contentType: 'model/gltf-binary' });
      expect(unknown.status).toBe(410);

      const link = (await callTool(key, 'create_upload_link')).value;
      await t.prisma.uploadTicket.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      const expired = await t
        .http()
        .post(uploadPath(link.upload_url))
        .attach('file', triangleGlb(), { filename: 'a.glb', contentType: 'model/gltf-binary' });
      expect(expired.status).toBe(410);
      expect((await t.http().get(`/public/v1/uploads/${link.upload_url.split('/').pop()}`)).status).toBe(410);
      expect((await t.http().get('/public/v1/uploads/p3d_up_nope')).status).toBe(410);
    });
  });

  describe('rate limits', () => {
    it('limits publishing per account, whatever the IP', async () => {
      const { key } = await account();
      const { limit } = API_THROTTLE.publish.account;
      const statuses: number[] = [];
      for (let i = 0; i <= limit; i++) {
        statuses.push((await publish(t, key).set('X-Real-IP', nextIp())).status);
      }
      expect(statuses.slice(0, limit).every((s) => s === 201)).toBe(true);
      expect(statuses[limit]).toBe(429);
      // the refused one stored nothing
      expect((await t.http().get('/public/v1/assets').set('Authorization', key)).body.total).toBe(limit);

      // another account isn't affected
      const other = await account();
      expect((await publish(t, other.key)).status).toBe(201);
    }, 60_000);

    it('counts the public API and MCP per account, and never on /auth', async () => {
      const { key, email } = await account();
      const list = await t.http().get('/public/v1/assets').set('Authorization', key);
      expect(list.headers['x-ratelimit-limit-account']).toBe(String(API_THROTTLE.calls.account.limit));
      expect(list.headers['x-ratelimit-limit-ip']).toBeUndefined();
      const tools = await mcp(key, 'tools/list');
      expect(tools.status).toBe(200);
      expect(tools.headers['x-ratelimit-limit-account']).toBe(String(API_THROTTLE.mcp.account.limit));

      const login = await t.http().post('/auth/login').set('X-Real-IP', nextIp()).send({ email, password: PASSWORD });
      expect(login.status).toBe(200);
      expect(login.headers['x-ratelimit-limit-ip']).toBeDefined();
      expect(login.headers['x-ratelimit-limit-account']).toBeUndefined();
    });

    it('limits upload links per IP before a link is used up, but never the check', async () => {
      const ip = nextIp();
      const { limit } = API_THROTTLE.uploadLink.ip;
      const statuses: number[] = [];
      for (let i = 0; i <= limit; i++) {
        statuses.push((await t.http().post('/public/v1/uploads/p3d_up_nope').set('X-Real-IP', ip)).status);
      }
      expect(statuses.slice(0, limit).every((s) => s === 410)).toBe(true);
      expect(statuses[limit]).toBe(429);
      expect((await t.http().post('/public/v1/uploads/p3d_up_nope').set('X-Real-IP', nextIp())).status).toBe(410);

      // the upload page checks its link from the Next.js server: one IP for every visitor
      for (let i = 0; i <= limit; i++) {
        expect((await t.http().get('/public/v1/uploads/p3d_up_nope').set('X-Real-IP', ip)).status).toBe(410);
      }
    });
  });

  describe('OAuth for MCP connectors', () => {
    // register → consent (signed in) → code → token, like Claude.ai does it
    const connect = async (cookie: string) => {
      const registered = await t
        .http()
        .post('/oauth/register')
        .send({ client_name: 'Claude', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' });
      expect(registered.status).toBe(201);
      const clientId = registered.body.client_id;

      const verifier = randomBytes(32).toString('base64url');
      const request = {
        response_type: 'code',
        client_id: clientId,
        redirect_uri: REDIRECT,
        code_challenge: pkceChallenge(verifier),
        code_challenge_method: 'S256',
        state: 'st4te',
        resource: `${MAIN}/mcp`,
      };
      const check = await t.http().get('/oauth/authorize/check').query(request);
      expect(check.body).toEqual({ client: { name: 'Claude' }, redirectHost: 'claude.ai' });

      const consent = await t.http().post('/oauth/authorize').set('Cookie', cookie).send({ ...request, allow: true });
      expect(consent.status).toBe(200);
      const back = new URL(consent.body.redirect);
      expect(back.origin + back.pathname).toBe(REDIRECT);
      expect(back.searchParams.get('state')).toBe('st4te');

      const token = await t
        .http()
        .post('/oauth/token')
        .type('form')
        .send({
          grant_type: 'authorization_code',
          code: back.searchParams.get('code')!,
          code_verifier: verifier,
          client_id: clientId,
          redirect_uri: REDIRECT,
          resource: `${MAIN}/mcp`,
        });
      expect(token.status).toBe(200);
      expect(token.headers['cache-control']).toBe('no-store');
      return { clientId, ...token.body } as { clientId: string; access_token: string; refresh_token: string };
    };

    it('publishes discovery documents', async () => {
      const resource = await t.http().get('/.well-known/oauth-protected-resource/mcp');
      expect(resource.body).toMatchObject({ resource: `${MAIN}/mcp`, authorization_servers: [MAIN] });
      const server = await t.http().get('/.well-known/oauth-authorization-server');
      expect(server.body).toMatchObject({ issuer: MAIN, registration_endpoint: `${MAIN}/api/oauth/register` });
    });

    it('connects an app that then uses MCP as the user\'s org, until disconnected', async () => {
      const user = await signUp(t);
      const tokens = await connect(user.cookie);
      expect(tokens.access_token).toMatch(/^p3d_oat_/);

      const me = await callTool(tokens.access_token, 'whoami');
      expect(me.value.connectedWith).toBe('app "Claude"');

      const apps = await t.http().get('/oauth/grants').set('Cookie', user.cookie);
      expect(apps.body).toEqual([expect.objectContaining({ name: 'Claude', lastUsedAt: expect.any(String) })]);
      expect(JSON.stringify(apps.body)).not.toMatch(/Hash|p3d_o/);

      // refresh: new pair, old access token dead
      const refreshed = await t
        .http()
        .post('/oauth/token')
        .type('form')
        .send({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: tokens.clientId });
      expect(refreshed.status).toBe(200);
      expect((await mcp(tokens.access_token, 'tools/list')).status).toBe(401);
      expect((await mcp(refreshed.body.access_token, 'tools/list')).status).toBe(200);

      const revoked = await t.http().delete(`/oauth/grants/${apps.body[0].id}`).set('Cookie', user.cookie);
      expect(revoked.body).toEqual({ revoked: true });
      const after = await mcp(refreshed.body.access_token, 'tools/list');
      expect(after.status).toBe(401);
      expect(after.headers['www-authenticate']).toContain('invalid_token');
    });

    it('needs a signed-in user to consent, and lets them deny', async () => {
      const user = await signUp(t);
      const registered = await t.http().post('/oauth/register').send({ client_name: 'Cursor', redirect_uris: [REDIRECT] });
      const request = {
        response_type: 'code',
        client_id: registered.body.client_id,
        redirect_uri: REDIRECT,
        code_challenge: pkceChallenge(randomBytes(32).toString('base64url')),
        code_challenge_method: 'S256',
      };
      expect((await t.http().post('/oauth/authorize').send({ ...request, allow: true })).status).toBe(401);
      const denied = await t.http().post('/oauth/authorize').set('Cookie', user.cookie).send({ ...request, allow: false });
      expect(new URL(denied.body.redirect).searchParams.get('error')).toBe('access_denied');
      expect(await t.prisma.oAuthGrant.count()).toBe(0);
    });

    it('rejects registrations with unsafe redirect URIs', async () => {
      const res = await t.http().post('/oauth/register').send({ redirect_uris: ['http://evil.example.com/cb'] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_redirect_uri');
    });
  });

  it('deleting the account cuts off keys, connected apps and upload links', async () => {
    const user = await account();
    const tokens = await (async () => {
      const registered = await t.http().post('/oauth/register').send({ client_name: 'Claude', redirect_uris: [REDIRECT] });
      const verifier = randomBytes(32).toString('base64url');
      const consent = await t
        .http()
        .post('/oauth/authorize')
        .set('Cookie', user.cookie)
        .send({
          response_type: 'code',
          client_id: registered.body.client_id,
          redirect_uri: REDIRECT,
          code_challenge: pkceChallenge(verifier),
          code_challenge_method: 'S256',
          allow: true,
        });
      const code = new URL(consent.body.redirect).searchParams.get('code')!;
      return (
        await t
          .http()
          .post('/oauth/token')
          .type('form')
          .send({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: registered.body.client_id })
      ).body;
    })();
    const link = (await callTool(user.key, 'create_upload_link')).value;

    const deleted = await t.http().delete('/user/self').set('Cookie', user.cookie).send({ password: PASSWORD });
    expect(deleted.status).toBe(200);

    expect((await mcp(user.key, 'tools/list')).status).toBe(401);
    expect((await mcp(tokens.access_token, 'tools/list')).status).toBe(401);
    const upload = await t
      .http()
      .post(link.upload_url.replace(`${MAIN}/api`, ''))
      .attach('file', triangleGlb(), { filename: 'a.glb', contentType: 'model/gltf-binary' });
    expect(upload.status).toBe(410);
  });
});
