import { PublicAuthMiddleware, readKey } from './public.auth.middleware';

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('PublicAuthMiddleware', () => {
  it('reads "<key>" and "Bearer <key>"', () => {
    expect(readKey({ headers: { authorization: 'p3d_abc' } } as any)).toBe('p3d_abc');
    expect(readKey({ headers: { authorization: '  bearer   p3d_abc ' } } as any)).toBe('p3d_abc');
    expect(readKey({ headers: {} } as any)).toBe('');
  });

  it('401s without a key, without asking the database', async () => {
    const keys = { validate: jest.fn() };
    const res = response();
    const next = jest.fn();
    await new PublicAuthMiddleware(keys as any).use({ headers: {} } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ msg: 'No API Key found' });
    expect(keys.validate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('401s for an unknown or revoked key', async () => {
    const keys = { validate: jest.fn().mockResolvedValue(null) };
    const res = response();
    const next = jest.fn();
    await new PublicAuthMiddleware(keys as any).use({ headers: { authorization: 'p3d_x' } } as any, res, next);
    expect(res.json).toHaveBeenCalledWith({ msg: 'Invalid API key' });
    expect(next).not.toHaveBeenCalled();
  });

  it('puts the org and the key on the request', async () => {
    const found = { org: { id: 'o1', name: 'O' }, apiKey: { id: 'k1', name: 'n', prefix: 'p3d_abcd' } };
    const keys = { validate: jest.fn().mockResolvedValue(found) };
    const req: any = { headers: { authorization: 'Bearer p3d_x' } };
    const next = jest.fn();
    await new PublicAuthMiddleware(keys as any).use(req, response(), next);
    expect(keys.validate).toHaveBeenCalledWith('p3d_x');
    expect(req.org).toEqual(found.org);
    expect(req.apiKey).toEqual(found.apiKey);
    expect(next).toHaveBeenCalled();
  });
});
