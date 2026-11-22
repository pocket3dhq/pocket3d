import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@pocket3d/frontend/components/auth/auth.shell';
import { ConsentForm } from '@pocket3d/frontend/components/oauth/consent.form';
import { Notice } from '@pocket3d/frontend/components/ui/notice';
import { internalFetch } from '@pocket3d/helpers/utils/internal.fetch';
import { getSelf } from '@pocket3d/frontend/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Connect an app · pocket3d', robots: { index: false } };

// The OAuth parameters this page passes on, untouched, to the backend
const PARAMS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'code_challenge',
  'code_challenge_method',
  'state',
  'scope',
  'resource',
] as const;

type Search = Partial<Record<(typeof PARAMS)[number], string | string[]>>;

// MAIN_URL/oauth/authorize: the authorization endpoint MCP clients (Claude,
// Cursor, Codex...) open in the browser. proxy.ts sends signed-out visitors
// to login first and back here after
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const request: Record<string, string> = {};
  for (const key of PARAMS) {
    const value = search[key];
    if (typeof value === 'string') {
      request[key] = value;
    }
  }
  const query = new URLSearchParams(request).toString();

  const self = await getSelf();
  if (!self) {
    // stale cookie: clear it, log in, come back
    redirect(`/auth/logout?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }

  const res = await internalFetch(`/oauth/authorize/check?${query}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // the client and its redirect URI are verified: the error goes back to it
    if (typeof body?.redirect === 'string') {
      redirect(body.redirect);
    }
    return (
      <AuthShell title="This connection can't continue">
        <Notice>{body?.error_description || 'The app sent an invalid authorization request.'}</Notice>
        <p className="text-[14px] text-textMuted">Go back to the app and connect pocket3d again.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={`Connect ${body.client.name}`}>
      <ConsentForm
        clientName={body.client.name}
        redirectHost={body.redirectHost}
        orgName={self.org.name}
        email={self.email}
        request={request}
      />
    </AuthShell>
  );
}
