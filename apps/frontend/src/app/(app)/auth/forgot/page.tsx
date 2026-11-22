import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@pocket3d/frontend/components/auth/auth.shell';
import { ForgotForm } from '@pocket3d/frontend/components/auth/forgot.form';
import { Notice } from '@pocket3d/frontend/components/ui/notice';
import { getAuthOptions } from '@pocket3d/frontend/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reset your password · pocket3d' };

export default async function ForgotPage() {
  const options = await getAuthOptions();
  return (
    <AuthShell
      title="Reset your password"
      footer={
        <Link href="/auth/login" className="text-accent hover:underline">
          Back to log in
        </Link>
      }
    >
      {options.emailEnabled ? (
        <ForgotForm />
      ) : (
        <Notice tone="info">This instance doesn't send email, so passwords can't be reset here. Ask whoever runs it.</Notice>
      )}
    </AuthShell>
  );
}
