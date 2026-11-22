import type { Metadata } from 'next';
import { AuthShell } from '@pocket3d/frontend/components/auth/auth.shell';
import { UploadForm } from '@pocket3d/frontend/components/upload/upload.form';
import { Notice } from '@pocket3d/frontend/components/ui/notice';
import { internalFetch } from '@pocket3d/helpers/utils/internal.fetch';

export const dynamic = 'force-dynamic';
// The token is in the URL: no indexing, and never sent on as a Referer
export const metadata: Metadata = {
  title: 'Upload a model · pocket3d',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

type Props = { params: Promise<{ token: string }> };

// MAIN_URL/u/<token>: the upload link from the MCP tool create_upload_link,
// as a page. For agents whose sandbox can't reach this server (Claude.ai,
// Claude Desktop): the person drops the file here instead. No login, the
// single-use link is the permission, exactly like the curl form of it
export default async function UploadLinkPage({ params }: Props) {
  const { token } = await params;
  const ticket = await getTicket(token);

  if (!ticket) {
    return (
      <AuthShell title="This upload link doesn't work any more">
        <Notice>It was already used, or it expired (links last 10 minutes).</Notice>
        <p className="text-[14px] text-textMuted">
          Ask your AI assistant for a new upload link. If you already uploaded the model through this link, the assistant
          can find its share link for you.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Upload your 3D model"
      subtitle="Drop the .glb file your assistant asked for. You'll get a link anyone can open in a 3D viewer."
    >
      <UploadForm token={token} title={ticket.title} expiresAt={ticket.expiresAt} />
    </AuthShell>
  );
}

async function getTicket(token: string): Promise<{ title: string | null; expiresAt: string } | null> {
  if (!/^p3d_up_[A-Za-z0-9]{1,100}$/.test(token)) {
    return null;
  }
  const res = await internalFetch(`/public/v1/uploads/${encodeURIComponent(token)}`);
  if (res.status === 410) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Backend answered ${res.status} for an upload link`);
  }
  return res.json();
}
