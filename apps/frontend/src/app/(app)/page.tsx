import Link from 'next/link';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@pocket3d/frontend/lib/session';

export const dynamic = 'force-dynamic';

// The whole pitch on one screen. REPO_URL / DEMO_URL are read at request
// time, so a deploy doesn't need a rebuild to show them
export default async function HomePage() {
  const signedIn = (await cookies()).has(SESSION_COOKIE);
  const repoUrl = process.env.REPO_URL;
  const demoUrl = process.env.DEMO_URL;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[720px] flex-col justify-center gap-[28px] px-[16px] py-[48px]">
      <div className="flex items-center justify-between text-[14px]">
        <div className="font-semibold tracking-wide text-accent">pocket3d</div>
        <nav className="flex items-center gap-[16px]">
          {signedIn ? (
            <Link href="/dashboard" className="text-textColor hover:text-accent">
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/auth/login" className="text-textMuted hover:text-textColor">
                Log in
              </Link>
              <Link href="/auth/register" className="rounded-[10px] border border-line px-[12px] py-[6px] hover:bg-bgInner">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
      <h1 className="text-[34px] font-bold leading-tight sm:text-[44px]">
        Publish a 3D model.
        <br />
        Get a link anyone can open.
      </h1>
      <p className="text-[16px] leading-relaxed text-textMuted">
        One command from your terminal or your AI agent (Claude Code, Codex, Cursor). The link
        opens an interactive viewer on any phone or computer, with a proper preview when you
        share it.
      </p>
      <pre className="overflow-x-auto rounded-[12px] border border-line bg-bgInner p-[16px] font-mono text-[14px] leading-relaxed">
        <span className="text-textMuted">$ </span>npx pocket3d publish model.glb --cover cover.png
        {'\n'}
        <span className="text-accent">https://pocket3d.co/m/3fK9xQ2mLp7Z</span>
      </pre>
      <div className="flex flex-wrap items-center gap-[12px] text-[14px]">
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
      <p className="text-[14px] leading-relaxed text-textMuted">
        For agents: the CLI (<code className="font-mono text-textColor">npx pocket3d</code>), an MCP server at{' '}
        <code className="font-mono text-textColor">/mcp</code>, and setup instructions they can read at{' '}
        <a href="/llms.txt" className="text-accent hover:underline">
          /llms.txt
        </a>
        . The HTTP API is documented at{' '}
        <a href="/api/docs" className="text-accent hover:underline">
          /api/docs
        </a>
        .
      </p>
    </main>
  );
}
