import { AuthMiddleware } from './auth.middleware';

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// is() mimics express: false (not null) when Content-Length: 0 and no type
const request = (method: string, contentType?: string, cookie?: string, contentLength?: string): any => ({
  method,
  headers: {
    ...(cookie ? { cookie } : {}),
    ...(contentType ? { 'content-type': contentType } : {}),
    ...(contentLength ? { 'content-length': contentLength } : {}),
  },
  is: (type: string) => (contentType ? contentType.startsWith(type) && type : contentLength ? false : null),
});

describe('AuthMiddleware', () => {
  const session = { sessionId: 's1', user: { id: 'u1', email: 'e', name: null as string | null }, org: { id: 'o1', name: 'O' } };

  it('puts the user, org and session on the request', async () => {
    const sessions = { validate: jest.fn().mockResolvedValue(session) };
    const req = request('GET', undefined, 'p3d_session=abc');
    const next = jest.fn();
    await new AuthMiddleware(sessions as any).use(req, response(), next);
    expect(sessions.validate).toHaveBeenCalledWith('abc');
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual(session.user);
    expect(req.org).toEqual(session.org);
    expect(req.sessionId).toBe('s1');
  });

  it('401s without a valid session', async () => {
    const sessions = { validate: jest.fn().mockResolvedValue(null) };
    const res = response();
    const next = jest.fn();
    await new AuthMiddleware(sessions as any).use(request('GET'), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', 'application/x-www-form-urlencoded'],
    ['POST', 'multipart/form-data'],
    ['POST', 'text/plain'],
    ['POST', undefined],
    ['PUT', undefined],
    ['DELETE', 'text/plain'],
  ])('refuses %s with %s before looking at the session (CSRF)', async (method, type) => {
    const sessions = { validate: jest.fn().mockResolvedValue(session) };
    const res = response();
    const next = jest.fn();
    await new AuthMiddleware(sessions as any).use(request(method, type, 'p3d_session=abc'), res, next);
    expect(res.status).toHaveBeenCalledWith(415);
    expect(sessions.validate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('lets a bodyless DELETE with "Content-Length: 0" through (what proxies send)', async () => {
    const sessions = { validate: jest.fn().mockResolvedValue(session) };
    const next = jest.fn();
    await new AuthMiddleware(sessions as any).use(request('DELETE', undefined, 'p3d_session=abc', '0'), response(), next);
    expect(next).toHaveBeenCalled();
  });

  it.each([
    ['POST', 'application/json'],
    ['PUT', 'application/json; charset=utf-8'],
    ['DELETE', undefined],
    ['DELETE', 'application/json'],
    ['GET', undefined],
  ])('lets %s with %s through', async (method, type) => {
    const sessions = { validate: jest.fn().mockResolvedValue(session) };
    const next = jest.fn();
    await new AuthMiddleware(sessions as any).use(request(method, type, 'p3d_session=abc'), response(), next);
    expect(next).toHaveBeenCalled();
  });
});
