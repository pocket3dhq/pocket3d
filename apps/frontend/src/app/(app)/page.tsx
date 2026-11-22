import Link from 'next/link';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { SESSION_COOKIE } from '@pocket3d/frontend/lib/session';
import { AgentHero } from '@pocket3d/frontend/components/home/agent.hero';
import { CoreSection } from '@pocket3d/frontend/components/home/core.section';
import { FaqSection } from '@pocket3d/frontend/components/home/faq.section';
import { SiteFooter } from '@pocket3d/frontend/components/home/site.footer';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'pocket3d: publish and manage your 3D models with your AI agent',
  description:
    'Your 3D library for Claude Code, Claude, Codex and Cursor. Every model gets a link anyone can open, on any phone or computer.',
};

// The whole pitch on one screen. REPO_URL / DEMO_URL are read at request
// time, so a deploy doesn't need a rebuild to show them
export default async function HomePage() {
  const signedIn = (await cookies()).has(SESSION_COOKIE);
  const repoUrl = process.env.REPO_URL;
  const demoUrl = process.env.DEMO_URL;

  const code = 'font-mono text-textColor';
  const link = 'text-accent hover:underline';

  return (
    <>
      <main className="mx-auto flex min-h-screen w-full max-w-[880px] flex-col justify-center gap-[28px] px-[16px] py-[48px]">
        <div className="flex items-center justify-between text-[14px]">
          <div className="font-semibold tracking-wide text-accent">
            pocket3d
          </div>
          <nav className="flex items-center gap-[16px]">
            {signedIn ? (
              <Link
                href="/dashboard"
                className="text-textColor hover:text-accent"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="text-textMuted hover:text-textColor"
                >
                  Log in
                </Link>
                <Link
                  href="/auth/register"
                  className="rounded-[10px] border border-line px-[12px] py-[6px] hover:bg-bgInner"
                >
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
        <AgentHero>
          <div className="flex flex-wrap items-center justify-center gap-[12px] text-[14px]">
            <Link
              href={signedIn ? '/dashboard/keys' : '/auth/register'}
              className="rounded-[10px] bg-accent px-[16px] py-[10px] font-semibold text-accentText hover:opacity-90"
            >
              {signedIn ? 'Connect your agent' : 'Create a free account'}
            </Link>
            {!!demoUrl && (
              <a
                href={demoUrl}
                className="rounded-[10px] border border-line px-[16px] py-[10px] hover:bg-bgInner"
              >
                See a demo
              </a>
            )}
            {!!repoUrl && (
              <a
                href={repoUrl}
                rel="noopener"
                className="rounded-[10px] border border-line px-[16px] py-[10px] hover:bg-bgInner"
              >
                Open source on GitHub
              </a>
            )}
          </div>
        </AgentHero>
        <CoreSection />
        <p className="text-center text-[14px] text-textMuted">
          Or from your terminal:
        </p>
        <pre className="overflow-x-auto rounded-[12px] border border-line bg-bgInner p-[16px] font-mono text-[14px] leading-relaxed">
          <span className="text-textMuted">$ </span>npx pocket3d publish
          model.glb --cover cover.png
          {'\n'}
          <span className="text-accent">
            https://pocket3d.co/m/3fK9xQ2mLp7Z
          </span>
        </pre>
        <ul className="grid gap-[12px] text-[14px] leading-relaxed sm:grid-cols-3">
          <li className="rounded-[12px] border border-line p-[16px]">
            <div className="mb-[6px] font-semibold text-textColor">
              Made for agents
            </div>
            <p className="text-textMuted">
              The CLI (<code className={code}>npx pocket3d</code>), an MCP
              server at <code className={code}>/mcp</code>, setup they can read
              at{' '}
              <a href="/llms.txt" className={link}>
                /llms.txt
              </a>{' '}
              and an{' '}
              <a href="/api/docs" className={link}>
                HTTP API
              </a>
              .
            </p>
          </li>
          <li className="rounded-[12px] border border-line p-[16px]">
            <div className="mb-[6px] font-semibold text-textColor">
              Your 3D library
            </div>
            <p className="text-textMuted">
              Everything you publish lands in your dashboard, where you can find
              it, rename it or take it down.
            </p>
          </li>
          <li className="rounded-[12px] border border-line p-[16px]">
            <div className="mb-[6px] font-semibold text-textColor">
              Open source
            </div>
            <p className="text-textMuted">
              AGPL-3.0. Use pocket3d.co or{' '}
              {repoUrl ? (
                <a href={repoUrl} rel="noopener" className={link}>
                  host it yourself
                </a>
              ) : (
                'host it yourself'
              )}{' '}
              with Docker.
            </p>
          </li>
        </ul>
        <FaqSection />
      </main>
      <SiteFooter repoUrl={repoUrl} demoUrl={demoUrl} />
    </>
  );
}
