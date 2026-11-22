'use client';

import { FC, useState } from 'react';
import { apiFetch } from '@pocket3d/frontend/lib/api';
import { Button } from '@pocket3d/frontend/components/ui/button';
import { Notice } from '@pocket3d/frontend/components/ui/notice';

// Allow / Deny. The backend answers with where to send the browser: the
// app's redirect URI with a code (or an access_denied error)
export const ConsentForm: FC<{
  clientName: string;
  redirectHost: string;
  orgName: string;
  email: string;
  request: Record<string, string>;
}> = ({ clientName, redirectHost, orgName, email, request }) => {
  const [loading, setLoading] = useState<'allow' | 'deny' | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const answer = async (allow: boolean) => {
    setError('');
    setLoading(allow ? 'allow' : 'deny');
    try {
      const { redirect } = await apiFetch<{ redirect: string }>('/oauth/authorize', {
        method: 'POST',
        body: { ...request, allow },
      });
      setDone(allow);
      window.location.assign(redirect);
    } catch (err) {
      setError((err as Error).message);
      setLoading(null);
    }
  };

  if (done) {
    return (
      <Notice tone="info">
        Connected. You can go back to {clientName}; if it doesn&apos;t notice, close this tab and try again there.
      </Notice>
    );
  }

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex flex-col gap-[10px] border border-line bg-bgInner/50 p-[16px] text-[14px]">
        <p>
          <strong>{clientName}</strong> wants to use your pocket3d account <strong>{orgName}</strong> ({email}).
        </p>
        <p className="text-textMuted">It will be able to:</p>
        <ul className="ml-[18px] list-disc text-textMuted">
          <li>publish models (each one gets a public share link)</li>
          <li>list, rename and delete your models</li>
        </ul>
        <p className="text-textMuted">
          It can&apos;t see your password or API keys. Disconnect it any time from Dashboard → Connect.
        </p>
      </div>
      <p className="text-[13px] text-textMuted">
        You will be sent back to <span className="font-mono text-textColor">{redirectHost}</span>. Only continue if you
        started this from {clientName}.
      </p>
      <Notice>{error}</Notice>
      <div className="flex flex-wrap gap-[10px]">
        <Button onClick={() => answer(true)} loading={loading === 'allow'} disabled={!!loading}>
          Allow
        </Button>
        <Button variant="secondary" onClick={() => answer(false)} loading={loading === 'deny'} disabled={!!loading}>
          Deny
        </Button>
      </div>
    </div>
  );
};
