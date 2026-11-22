import type { Metadata } from 'next';
import { AuthShell } from '@pocket3d/frontend/components/auth/auth.shell';
import { ResetForm } from '@pocket3d/frontend/components/auth/reset.form';

export const metadata: Metadata = { title: 'Choose a new password · pocket3d', robots: { index: false }, referrer: 'no-referrer' };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthShell title="Choose a new password">
      <ResetForm token={token} />
    </AuthShell>
  );
}
