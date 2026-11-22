import Link from 'next/link';
import { FC, ReactNode } from 'react';

// The frame around every /auth page
export const AuthShell: FC<{ title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }> = ({
  title,
  subtitle,
  children,
  footer,
}) => (
  <main className="mx-auto flex min-h-screen w-full max-w-[400px] flex-col justify-center gap-[24px] px-[16px] py-[48px]">
    <Link href="/" className="text-[14px] font-semibold tracking-wide text-accent">
      pocket3d
    </Link>
    <div className="flex flex-col gap-[6px]">
      <h1 className="text-[26px] font-bold leading-tight">{title}</h1>
      {!!subtitle && <p className="text-[14px] text-textMuted">{subtitle}</p>}
    </div>
    {children}
    {!!footer && <div className="text-[14px] text-textMuted">{footer}</div>}
  </main>
);
