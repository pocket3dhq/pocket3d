import Link from 'next/link';
import { FC, ReactNode } from 'react';

// The overlay around the canvas: title on top, brand at the bottom. Server
// component, so it's in the HTML before any JavaScript runs
export const ViewerChrome: FC<{ title: string; repoUrl?: string; children: ReactNode }> = ({
  title,
  repoUrl,
  children,
}) => {
  return (
    <main className="p3d-stage fixed inset-0 overflow-hidden">
      {children}
      <header className="pointer-events-none absolute inset-x-0 top-0 p-[16px]">
        <h1 className="max-w-[80vw] truncate text-[16px] font-semibold text-textColor drop-shadow">
          {title}
        </h1>
      </header>
      <footer className="absolute bottom-0 end-0 flex items-center gap-[10px] p-[14px] text-[12px] text-textMuted">
        <Link href="/" className="font-semibold text-textColor/80 hover:text-textColor">
          pocket3d
        </Link>
        {!!repoUrl && (
          <>
            <span aria-hidden>·</span>
            <a href={repoUrl} className="hover:text-textColor" rel="noopener">
              open source
            </a>
          </>
        )}
      </footer>
    </main>
  );
};
