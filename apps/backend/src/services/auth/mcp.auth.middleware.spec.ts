import { keyFromPath, McpAuthMiddleware } from './mcp.auth.middleware';

const response = () => {
  const res: any = { headers: {} as Record<string, string> };
  res.status = jest.fn(() => res);
  res.setHeader = jest.fn((k: string, v: string) => ((res.headers[k] = v), res));
  res.json = jest.fn(() => res);
  return res;
};

describe('McpAuthMiddleware', () => {
  beforeEach(() => {
    process.env.MAIN_URL = 'https://pocket3d.co';
  });

  const setup = () => {
    const oauth = {
      isAccessToken: (t: string) => t.startsWith('p3d_oat_'),
      validateAccessToken: jest.fn(async (t: string) => (t === 'p3d_oat_good' ? { org: { id: 'o1', name: 'Studio' }, client: 'Claude' } : null)),
    };
    const apiKeys = {
      validate: jest.fn(async (k: string) =>
        k === 'p3d_key' ? { org: { id: 'o2', name: 'Keys' }, apiKey: { id: 'k', name: 'laptop', prefix: 'p3d_' } } : null
      ),
    };
    return { middleware: new McpAuthMiddleware(oauth as any, apiKeys as any), oauth, apiKeys };
  };

  it('reads the key from /mcp/<key> only', () => {
    expect(keyFromPath('/mcp/p3d_key')).toBe('p3d_key');
    expect(keyFromPath('/mcp/p3d_key?x=1')).toBe('p3d_key');
    expect(keyFromPath('/mcp')).toBe('');
    expect(keyFromPath('/mcp/a/b')).toBe('');
  });

  it('accepts an OAuth token or an API key, and says which', async () => {
    const { middleware } = setup();
    const viaOAuth: any = { method: 'POST', headers: { authorization: 'Bearer p3d_oat_good' }, originalUrl: '/mcp' };
    const next = jest.fn();
    await middleware.use(viaOAuth, response(), next);
    expect(viaOAuth.mcpCaller).toEqual({ org: { id: 'o1', name: 'Studio' }, via: { kind: 'oauth', name: 'Claude' } });

    const viaPath: any = { method: 'POST', headers: {}, originalUrl: '/mcp/p3d_key' };
    await middleware.use(viaPath, response(), next);
    expect(viaPath.org).toEqual({ id: 'o2', name: 'Keys' });
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('answers 401 with the resource metadata URL, which starts OAuth in clients', async () => {
    const { middleware } = setup();
    const res = response();
    const next = jest.fn();
    await middleware.use({ method: 'POST', headers: {}, originalUrl: '/mcp' } as any, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.headers['WWW-Authenticate']).toBe(
      'Bearer resource_metadata="https://pocket3d.co/.well-known/oauth-protected-resource/mcp"'
    );

    const bad = response();
    await middleware.use({ method: 'POST', headers: { authorization: 'Bearer p3d_oat_revoked' }, originalUrl: '/mcp' } as any, bad, next);
    expect(bad.headers['WWW-Authenticate']).toContain('error="invalid_token"');
  });
});
