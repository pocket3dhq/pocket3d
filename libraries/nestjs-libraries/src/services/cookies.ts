import { Request, Response } from 'express';

// The browser login. One origin (nginx in production, the Next rewrite in
// dev) serves both the pages and /api, so the cookie needs no domain and
// SameSite=Lax keeps it off cross-site POSTs
export const SESSION_COOKIE = 'p3d_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const isSecure = () => (process.env.MAIN_URL || '').startsWith('https://');

// A tiny cookie header parser, so there's no cookie-parser dependency
export function readCookie(req: Pick<Request, 'headers'>, name: string): string | undefined {
  const header = req.headers?.cookie;
  if (!header) {
    return undefined;
  }
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) {
      continue;
    }
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return undefined;
}

export function setSessionCookie(res: Response, value: string) {
  res.cookie(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: 'lax',
    path: '/',
  });
}
