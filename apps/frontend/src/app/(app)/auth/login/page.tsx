import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@pocket3d/frontend/components/auth/auth.shell';
import { LoginForm } from '@pocket3d/frontend/components/auth/login.form';
import { getAuthOptions } from '@pocket3d/frontend/lib/session';
import { Analytics } from '@pocket3d/frontend/components/analytics';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Log in · pocket3d' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, options] = await Promise.all([searchParams, getAuthOptions()]);
  const nextParam = typeof next === 'string' ? next : undefined;
  return (
    <AuthShell
      title="Log in"
      subtitle="Manage your models and the API keys your CLI and agents publish with."
      footer={
        options.register ? (
          <>
            No account yet?{' '}
            <Link
              href={nextParam ? `/auth/register?next=${encodeURIComponent(nextParam)}` : '/auth/register'}
              className="text-accent hover:underline"
            >
              Sign up
            </Link>
          </>
        ) : undefined
      }
    >
      <LoginForm next={nextParam} emailEnabled={options.emailEnabled} />
      <Analytics />
    </AuthShell>
  );
}
