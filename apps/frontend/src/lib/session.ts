// Server only (next/headers): Server Components and Route Handlers

import { cookies } from 'next/headers';
import { cache } from 'react';
import { internalFetch } from '@pocket3d/helpers/utils/internal.fetch';

export const SESSION_COOKIE = 'p3d_session';

export interface Self {
  id: string;
  email: string;
  name: string | null;
  org: { id: string; name: string };
  emailEnabled: boolean;
}

// The signed-in account, or null. The backend checks the session; this only
// forwards the cookie. Cached per request (layout + page share one call)
export const getSelf = cache(async (): Promise<Self | null> => {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!session) {
    return null;
  }
  const res = await internalFetch('/user/self', {
    headers: { Cookie: `${SESSION_COOKIE}=${encodeURIComponent(session)}` },
  });
  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Backend answered ${res.status} for /user/self`);
  }
  return res.json();
});

export const getAuthOptions = cache(async (): Promise<{ register: boolean; emailEnabled: boolean }> => {
  const res = await internalFetch('/auth/can-register');
  if (!res.ok) {
    throw new Error(`Backend answered ${res.status} for /auth/can-register`);
  }
  return res.json();
});

export const mainUrl = () => (process.env.MAIN_URL || '').replace(/\/+$/, '');
