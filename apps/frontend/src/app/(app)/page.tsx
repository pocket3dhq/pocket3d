import Link from 'next/link';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { SESSION_COOKIE } from '@pocket3d/frontend/lib/session';
import { repoUrl as getRepoUrl } from '@pocket3d/frontend/lib/repo';
import { AgentHero } from '@pocket3d/frontend/components/home/agent.hero';
import { AgentsSection } from '@pocket3d/frontend/components/home/agents.section';
import { CoreSection } from '@pocket3d/frontend/components/home/core.section';
import { ReplaceSection } from '@pocket3d/frontend/components/home/replace.section';
import { FaqSection } from '@pocket3d/frontend/components/home/faq.section';
import { SectionHeading } from '@pocket3d/frontend/components/home/section.heading';
import { SiteFooter } from '@pocket3d/frontend/components/home/site.footer';
import {
  BUTTON_BASE,
  BUTTON_VARIANTS,
} from '@pocket3d/frontend/components/ui/button';
import { Logo } from '@pocket3d/frontend/components/ui/logo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'pocket3d: publish and manage your 3D models with your AI agent',
  description:
    'pocket3d is an open-source agentic 3D digital asset management platform that lets you publish and manage your 3D assets from your favorite AI agents. Every model gets a link anyone can open, on any phone or computer.',
};

const navLink =
  'font-mono text-[13px] uppercase tracking-[0.02em] text-textMuted hover:text-textColor';
const inlineLink = 'text-accent hover:underline';
const code = 'font-mono text-[14px] text-textColor';

// The whole pitch on one page. REPO_URL / DEMO_URL are read at request
// time, so a deploy doesn't need a rebuild to show them
export default async function HomePage() {
  const signedIn = (await cookies()).has(SESSION_COOKIE);
  const repoUrl = getRepoUrl();
  const demoUrl = process.env.DEMO_URL;

  const features = [
    {
      title: 'Made for agents',
      body: (
        <>
          The CLI (<code className={code}>npx pocket3d</code>), an MCP server at{' '}
          <code className={code}>/mcp</code>, setup they can read at{' '}
          <a href="/llms.txt" className={inlineLink}>
            /llms.txt
          </a>{' '}
          and an{' '}
          <a href="/api/docs" className={inlineLink}>
            HTTP API
          </a>
          .
        </>
      ),
    },
    {
      title: 'Your 3D library',
      body: 'Everything you publish lands in your dashboard, where you can find it, rename it or take it down.',
    },
    {
      title: 'Open source',
      body: (
        <>
          AGPL-3.0. Use pocket3d.co or{' '}
          {repoUrl ? (
            <a href={repoUrl} rel="noopener" className={inlineLink}>
              host it yourself
            </a>
          ) : (
            'host it yourself'
          )}{' '}
          with Docker.
        </>
      ),
    },
  ];

  return (
    <>
      <header className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-[16px] px-[16px] py-[20px] sm:px-[24px]">
        <div className="flex items-center gap-[24px]">
          <Link href="/" aria-label="pocket3d home">
            <Logo />
          </Link>
          <nav
            className="hidden items-center gap-[20px] sm:flex"
            aria-label="Site"
          >
            <a href="/api/docs" className={navLink}>
              API
            </a>
            <a href="/llms.txt" className={navLink}>
              llms.txt
            </a>
            {!!repoUrl && (
              <a href={repoUrl} rel="noopener" className={navLink}>
                GitHub
              </a>
            )}
          </nav>
        </div>
        <nav className="flex items-center gap-[8px]" aria-label="Account">
          {signedIn ? (
            <Link
              href="/dashboard"
              className={`${BUTTON_BASE} ${BUTTON_VARIANTS.secondary} py-[8px]`}
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/auth/login"
                className={`${BUTTON_BASE} bg-accent/20 py-[8px] text-accent hover:bg-accent/30`}
              >
                Log in
              </Link>
              <Link
                href="/auth/register"
                className={`${BUTTON_BASE} ${BUTTON_VARIANTS.secondary} py-[8px]`}
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-[96px] px-[16px] pb-[48px] sm:gap-[128px] sm:px-[24px]">
        <AgentHero>
          <div className="flex flex-wrap items-center justify-center gap-[12px]">
            <Link
              href={signedIn ? '/dashboard/keys' : '/auth/register'}
              className={`${BUTTON_BASE} ${BUTTON_VARIANTS.primary} px-[24px] py-[14px] text-[15px]`}
            >
              {signedIn ? 'Connect your agent' : 'Start for free'}
            </Link>
            {!!demoUrl && (
              <a
                href={demoUrl}
                className={`${BUTTON_BASE} ${BUTTON_VARIANTS.outline} px-[24px] py-[14px] text-[15px]`}
              >
                See a demo
              </a>
            )}
          </div>
        </AgentHero>

        <AgentsSection />

        <CoreSection />

        <ReplaceSection />

        <section className="flex flex-col gap-[32px]">
          <SectionHeading
            title="One command."
            subtitle="From your terminal, your agent or your CI."
          />
          <div className="overflow-hidden rounded-panel border border-line bg-bgInner">
            <div className="flex items-center gap-[6px] border-b border-line px-[16px] py-[12px]">
              <span className="h-[10px] w-[10px] rounded-full bg-line" />
              <span className="h-[10px] w-[10px] rounded-full bg-line" />
              <span className="h-[10px] w-[10px] rounded-full bg-line" />
              <span className="ml-[8px] font-mono text-[12px] text-textMuted">
                terminal
              </span>
            </div>
            <pre className="overflow-x-auto p-[20px] font-mono text-[14px] leading-[1.9]">
              <span className="text-textMuted">$ </span>npx pocket3d publish
              model.glb --cover cover.png
              {'\n'}
              <span className="text-success">✓</span>{' '}
              <span className="text-textMuted">Published</span>{' '}
              <span className="text-accent">
                https://pocket3d.co/m/3fK9xQ2mLp7Z
              </span>
            </pre>
          </div>
        </section>

        <section className="flex flex-col gap-[32px]">
          <SectionHeading
            title="Built for agents."
            subtitle="Open, and yours to keep."
          />
          <ul className="grid border-l border-t border-line sm:grid-cols-3">
            {features.map((f) => (
              <li
                key={f.title}
                className="flex flex-col gap-[12px] border-b border-r border-line p-[24px] sm:p-[32px]"
              >
                <h3 className="font-mono text-[18px] tracking-[-0.02em]">
                  {f.title}
                </h3>
                <p className="text-[15px] leading-relaxed text-textMuted">
                  {f.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <FaqSection />
      </main>
      <SiteFooter repoUrl={repoUrl} demoUrl={demoUrl} />
    </>
  );
}
