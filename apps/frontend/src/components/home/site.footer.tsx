import Link from 'next/link';
import { Logo } from '@pocket3d/frontend/components/ui/logo';
import { AgentIcon } from './agent.icon';
import { AGENT_DOORS, AGENTS } from './agents';

// The home page footer: a big wordmark, a short tagline, a few link columns.
// Only links to pages that exist; the demo link shows when DEMO_URL is set

type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
  icon?: string;
  agent?: boolean;
};

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
      // every agent opens the Connect page, where its setup is
      title: 'AI agents',
      links: [
        ...AGENTS.map((a) => ({
          label: a.name,
          href: '/dashboard/keys',
          icon: a.icon,
          agent: true,
        })),
        ...AGENT_DOORS.map((d) => ({
          label: d.name,
          href: d.href,
          icon: d.icon,
          agent: true,
        })),
      ],
    },
    {
      title: 'Connect',
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
    <footer className="mt-[96px] border-t border-line">
      <div
        aria-hidden
        className="h-[15vw] max-h-[200px] overflow-hidden text-center"
      >
        <span className="block select-none font-mono text-[19vw] font-medium leading-none tracking-[-0.06em] text-bgInner sm:text-[min(19vw,240px)]">
          pocket3d
        </span>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto grid w-full max-w-[1200px] grid-cols-2 gap-[32px] px-[16px] py-[48px] sm:px-[24px] lg:grid-cols-[1.6fr_1fr_1.2fr_1fr_1fr]">
          <div className="col-span-2 flex flex-col gap-[8px] lg:col-span-1">
            <Logo />
            <p className="text-[14px] leading-relaxed text-textMuted">
              pocket3d is an open-source agentic 3D digital asset management
              platform that lets you publish and manage your 3D assets from your
              favorite AI agents.
            </p>
          </div>
          {columns.map((col) => (
            <nav
              key={col.title}
              aria-label={col.title}
              className="flex flex-col gap-[10px] text-[14px]"
            >
              <div className="font-mono text-[12px] uppercase tracking-[0.04em] text-textMuted">
                {col.title}
              </div>
              {col.links.map((l) =>
                l.external ? (
                  <a
                    key={l.label}
                    href={l.href}
                    rel="noopener"
                    className="text-textColor/80 hover:text-textColor"
                  >
                    {l.label}
                  </a>
                ) : (
                  <Link
                    key={l.label}
                    href={l.href}
                    className="flex items-center gap-[10px] text-textColor/80 hover:text-textColor"
                  >
                    {l.agent && (
                      <AgentIcon name={l.label} icon={l.icon} size={16} />
                    )}
                    {l.label}
                  </Link>
                )
              )}
            </nav>
          ))}
        </div>
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap justify-between gap-[8px] border-t border-line px-[16px] py-[20px] font-mono text-[12px] text-textMuted sm:px-[24px]">
          <span>© pocket3d, {new Date().getFullYear()}</span>
          <span className="flex items-center gap-[14px]">
            AGPL-3.0 · hosted cloud + open source
            {!!repoUrl && (
              <a
                href={repoUrl}
                rel="noopener"
                aria-label="pocket3d on GitHub"
                className="flex items-center gap-[6px] text-textColor/80 hover:text-textColor"
              >
                <AgentIcon name="GitHub" icon="github" size={16} />
                GitHub
              </a>
            )}
          </span>
        </div>
      </div>
    </footer>
  );
}
