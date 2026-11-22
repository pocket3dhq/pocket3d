import Link from 'next/link';
import { FC, ReactNode } from 'react';
import { Logo } from '@pocket3d/frontend/components/ui/logo';

// The frame around every /auth page
export const AuthShell: FC<{
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}> = ({ title, subtitle, children, footer }) => (
  <main className="mx-auto flex min-h-screen w-full max-w-[400px] flex-col justify-center gap-[24px] px-[16px] py-[48px]">
    <Link href="/" className="w-fit">
      <Logo />
    </Link>
    <div className="flex flex-col gap-[6px]">
      <h1 className="text-[28px] font-semibold leading-tight tracking-heading">
        {title}
      </h1>
      {!!subtitle && <p className="text-[14px] text-textMuted">{subtitle}</p>}
    </div>
    {children}
    {!!footer && <div className="text-[14px] text-textMuted">{footer}</div>}
  </main>
);
