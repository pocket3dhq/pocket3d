import { clearSessionCookie, readCookie, SESSION_COOKIE, setSessionCookie } from './cookies';

describe('cookies', () => {
  it('reads one cookie out of the header', () => {
    const req = { headers: { cookie: 'a=1; p3d_session=abc%20def; other=x=y' } } as any;
    expect(readCookie(req, 'p3d_session')).toBe('abc def');
    expect(readCookie(req, 'other')).toBe('x=y');
    expect(readCookie(req, 'missing')).toBeUndefined();
    expect(readCookie({ headers: {} } as any, 'a')).toBeUndefined();
    expect(readCookie({ headers: { cookie: 'bad=%E0%A4%A' } } as any, 'bad')).toBe('%E0%A4%A');
    // a cookie whose name only ends with ours doesn't match
    expect(readCookie({ headers: { cookie: 'xp3d_session=evil' } } as any, 'p3d_session')).toBeUndefined();
  });

  it('sets an httpOnly Lax cookie, Secure only on https', () => {
    const original = process.env.MAIN_URL;
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as any;
    process.env.MAIN_URL = 'https://pocket3d.co';
    setSessionCookie(res, 'value');
    expect(res.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE,
      'value',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/', secure: true })
    );
    process.env.MAIN_URL = 'http://localhost:4200';
    setSessionCookie(res, 'value');
    expect(res.cookie.mock.calls[1][2].secure).toBe(false);
    clearSessionCookie(res);
    expect(res.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, expect.objectContaining({ path: '/' }));
    process.env.MAIN_URL = original;
  });
});
