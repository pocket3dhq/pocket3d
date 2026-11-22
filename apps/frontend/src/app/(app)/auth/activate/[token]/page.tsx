import type { Metadata } from 'next';
import { AuthShell } from '@pocket3d/frontend/components/auth/auth.shell';
import { ActivateButton } from '@pocket3d/frontend/components/auth/activate.button';

export const metadata: Metadata = { title: 'Activate your account · pocket3d', robots: { index: false }, referrer: 'no-referrer' };

export default async function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthShell title="Activate your account" subtitle="One click and you're in.">
      <ActivateButton token={token} />
    </AuthShell>
  );
}
