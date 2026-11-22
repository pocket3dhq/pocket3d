'use client';

import { FC, useState } from 'react';
import { apiFetch } from '@pocket3d/frontend/lib/api';
import { OAuthGrantRow, useOAuthGrants } from '@pocket3d/frontend/hooks/use.oauth.grants';
import { Button } from '@pocket3d/frontend/components/ui/button';
import { Card } from '@pocket3d/frontend/components/ui/card';
import { Notice } from '@pocket3d/frontend/components/ui/notice';

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'never';

const AppRow: FC<{ app: OAuthGrantRow; onRevoked: () => void }> = ({ app, onRevoked }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const revoke = async () => {
    setBusy(true);
    try {
      await apiFetch(`/oauth/grants/${app.id}`, { method: 'DELETE' });
      onRevoked();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-[8px] border-b border-line py-[12px] last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-[2px]">
        <span className="truncate text-[15px] font-semibold">{app.name}</span>
        <span className="text-[12px] text-textMuted">
          connected {when(app.createdAt)} · last used {when(app.lastUsedAt)}
        </span>
        <Notice>{error}</Notice>
      </div>
      <Button variant="danger" onClick={revoke} loading={busy}>
        Disconnect
      </Button>
    </li>
  );
};

// Apps connected through the MCP server's OAuth (Claude.ai, Cursor...)
export const ConnectedApps: FC = () => {
  const { data, error, isLoading, mutate } = useOAuthGrants();
  return (
    <Card title="Connected apps" description="Apps you allowed through the MCP server. Disconnecting one signs it out at once.">
      {error ? (
        <Notice>{(error as Error).message}</Notice>
      ) : isLoading || !data ? (
        <p className="text-[14px] text-textMuted">Loading…</p>
      ) : data.length === 0 ? (
        <p className="text-[14px] text-textMuted">No connected apps.</p>
      ) : (
        <ul className="flex flex-col">
          {data.map((app) => (
            <AppRow key={app.id} app={app} onRevoked={() => mutate()} />
          ))}
        </ul>
      )}
    </Card>
  );
};
