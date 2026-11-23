import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@pocket3d/frontend/components/auth/auth.shell';
import { RegisterForm } from '@pocket3d/frontend/components/auth/register.form';
import { Notice } from '@pocket3d/frontend/components/ui/notice';
import { getAuthOptions } from '@pocket3d/frontend/lib/session';
import { Analytics } from '@pocket3d/frontend/components/analytics';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign up · pocket3d' };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, options] = await Promise.all([searchParams, getAuthOptions()]);
  const nextParam = typeof next === 'string' ? next : undefined;
  const withNext = (path: string) => (nextParam ? `${path}?next=${encodeURIComponent(nextParam)}` : path);
  const footer = (
    <>
      Already have an account?{' '}
      <Link href={withNext('/auth/login')} className="text-accent hover:underline">
        Log in
      </Link>
    </>
  );

  if (!options.register) {
    return (
      <AuthShell title="Sign up" footer={footer}>
        <Notice tone="info">Registration is closed on this instance.</Notice>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" subtitle="Then connect your AI agent and publish from it or from your terminal." footer={footer}>
      <RegisterForm next={nextParam} />
      <Analytics />
    </AuthShell>
  );
}
