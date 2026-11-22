import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'p3d_session';

// Optimistic check on the cookie only (the backend validates the session):
// signed-out visitors go to login, signed-in ones skip the login/signup forms.
// A stale cookie is cleared by /auth/logout, which the dashboard sends it to
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  // the dashboard and the OAuth consent page (an agent connecting) need a login
  if ((pathname.startsWith('/dashboard') || pathname === '/oauth/authorize') && !hasSession) {
    const login = new URL('/auth/login', request.url);
    login.searchParams.set('next', pathname + search);
    return NextResponse.redirect(login);
  }

  if ((pathname === '/auth/login' || pathname === '/auth/register') && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/oauth/authorize', '/auth/login', '/auth/register'],
};
