import { ConnectAgent } from '@pocket3d/frontend/components/dashboard/connect.agent';
import { mainUrl } from '@pocket3d/frontend/lib/session';

export default function KeysPage() {
  return (
    <main className="flex flex-col gap-[16px]">
      <div className="flex flex-col gap-[4px]">
        <h1 className="text-[28px] font-semibold tracking-heading">Connect</h1>
        <p className="text-[14px] text-textMuted">Publish from Claude Code, Cursor, Codex, Claude.ai or your terminal.</p>
      </div>
      <ConnectAgent mainUrl={mainUrl()} />
    </main>
  );
}
