import Link from 'next/link';

// The home page footer: a big wordmark, a short tagline, a few link columns.
// Only links to pages that exist; REPO_URL / DEMO_URL ones show when they're set

type FooterLink = { label: string; href: string; external?: boolean };

export function SiteFooter({
  repoUrl,
  demoUrl,
}: {
  repoUrl?: string;
  demoUrl?: string;
}) {
  const columns: { title: string; links: FooterLink[] }[] = [
    {
      title: 'Product',
      links: [
        ...(demoUrl ? [{ label: 'Demo', href: demoUrl }] : []),
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Sign up', href: '/auth/register' },
        { label: 'Log in', href: '/auth/login' },
      ],
    },
    {
      title: 'AI agents',
      links: [
        { label: 'Connect your agent', href: '/dashboard/keys' },
        { label: 'Agent instructions', href: '/skill.md' },
        { label: 'llms.txt', href: '/llms.txt' },
      ],
    },
    {
      title: 'Developers',
      links: [
        { label: 'API docs', href: '/api/docs' },
        ...(repoUrl
          ? [
              { label: 'GitHub', href: repoUrl, external: true },
              {
                label: 'Self-host',
                href: `${repoUrl}#self-hosting`,
                external: true,
              },
            ]
          : []),
      ],
    },
  ];

  return (
    <footer className="mt-[48px] border-t border-line">
      <div
        aria-hidden
        className="h-[15vw] max-h-[200px] overflow-hidden text-center"
      >
        <span className="block select-none text-[21vw] font-bold leading-none tracking-tight text-accent sm:text-[min(24vw,270px)]">
          pocket3d
        </span>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto grid w-full max-w-[880px] grid-cols-3 gap-[24px] px-[16px] py-[40px] sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:gap-[32px]">
          <div className="col-span-3 flex flex-col gap-[8px] sm:col-span-1">
            <div className="font-semibold tracking-wide text-accent">
              pocket3d
            </div>
            <p className="text-[14px] leading-relaxed text-textMuted">
              Publish and manage your 3D models with your AI agent. Hosted cloud
              or open source.
            </p>
          </div>
          {columns.map((col) => (
            <nav
              key={col.title}
              aria-label={col.title}
              className="flex flex-col gap-[10px] text-[14px]"
            >
              <div className="font-semibold text-textColor">{col.title}</div>
              {col.links.map((l) =>
                l.external ? (
                  <a
                    key={l.label}
                    href={l.href}
                    rel="noopener"
                    className="text-textMuted hover:text-textColor"
                  >
                    {l.label}
                  </a>
                ) : (
                  <Link
                    key={l.label}
                    href={l.href}
                    className="text-textMuted hover:text-textColor"
                  >
                    {l.label}
                  </Link>
                )
              )}
            </nav>
          ))}
        </div>
        <div className="mx-auto flex w-full max-w-[880px] flex-wrap justify-between gap-[8px] border-t border-line px-[16px] py-[20px] text-[12px] text-textMuted">
          <span>© pocket3d, {new Date().getFullYear()}</span>
          <span>AGPL-3.0 · hosted cloud + open source</span>
        </div>
      </div>
    </footer>
  );
}
