import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { internalFetch } from '@pocket3d/helpers/utils/internal.fetch';
import { SESSION_COOKIE } from '@pocket3d/frontend/lib/session';
import { safeNext } from '@pocket3d/frontend/lib/api';

// Ends the session and clears the cookie, then back to login. Also where the
// dashboard (and the OAuth consent page, with ?next=) sends a browser whose
// cookie no longer matches a session
export async function GET(request: Request) {
  const next = new URL(request.url).searchParams.get('next');
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (session) {
    await internalFetch('/auth/logout', {
      method: 'POST',
      headers: { Cookie: `${SESSION_COOKIE}=${encodeURIComponent(session)}` },
    }).catch(() => {});
  }
  const login = new URL('/auth/login', process.env.MAIN_URL || request.url);
  if (next) {
    login.searchParams.set('next', safeNext(next));
  }
  const response = NextResponse.redirect(login);
  response.cookies.delete({ name: SESSION_COOKIE, path: '/' });
  return response;
}
