'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FC } from 'react';

const LINKS = [
  { href: '/dashboard', label: 'Models' },
  { href: '/dashboard/keys', label: 'Connect' },
  { href: '/dashboard/settings', label: 'Settings' },
];

export const DashboardNav: FC<{ email: string }> = ({ email }) => {
  const pathname = usePathname();
  return (
    <header className="flex flex-col gap-[14px] border-b border-line pb-[14px] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-[20px]">
        <Link href="/" className="text-[14px] font-semibold tracking-wide text-accent">
          pocket3d
        </Link>
        <nav className="flex gap-[4px]" aria-label="Dashboard">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-[8px] px-[10px] py-[6px] text-[14px] ${
                  active ? 'bg-bgInner text-textColor' : 'text-textMuted hover:text-textColor'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-[12px] text-[13px] text-textMuted">
        <span className="max-w-[220px] truncate">{email}</span>
        {/* a plain link: the route clears the cookie and redirects */}
        <a href="/auth/logout" className="hover:text-textColor">
          Log out
        </a>
      </div>
    </header>
  );
};
