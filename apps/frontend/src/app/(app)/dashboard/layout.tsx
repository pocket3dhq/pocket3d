import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';
import { DashboardNav } from '@pocket3d/frontend/components/dashboard/dashboard.nav';
import { getSelf } from '@pocket3d/frontend/lib/session';
import { Analytics } from '@pocket3d/frontend/components/analytics';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dashboard · pocket3d', robots: { index: false } };

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const self = await getSelf();
  if (!self) {
    // the cookie is stale: /auth/logout clears it (proxy would loop otherwise)
    redirect('/auth/logout');
  }
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[860px] flex-col gap-[28px] px-[16px] py-[24px]">
      <DashboardNav email={self.email} />
      {children}
      <Analytics />
    </div>
  );
}
