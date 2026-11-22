'use client';

import { FC, FormEvent, useState } from 'react';
import { ApiKeyRow, useApiKeys } from '@pocket3d/frontend/hooks/use.api.keys';
import { apiFetch } from '@pocket3d/frontend/lib/api';
import { Button } from '@pocket3d/frontend/components/ui/button';
import { Field } from '@pocket3d/frontend/components/ui/field';
import { Notice } from '@pocket3d/frontend/components/ui/notice';
import { Card } from '@pocket3d/frontend/components/ui/card';
import { CopyButton } from '@pocket3d/frontend/components/dashboard/copy.button';
import { cliLogin } from '@pocket3d/frontend/components/dashboard/agent.setup';

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'never';

const NewKey: FC<{
  mainUrl: string;
  created: { name: string; key: string };
  onDone: () => void;
}> = ({ mainUrl, created, onDone }) => {
  const command = cliLogin(mainUrl, created.key);
  return (
    <Card
      title={`Key "${created.name}" created`}
      description="Copy it now: it won't be shown again. Anyone with it can publish to your account."
      className="border-accent/60"
    >
      <div className="flex flex-col gap-[8px]">
        <code className="break-all rounded-panel border border-line bg-bgInner p-[12px] font-mono text-[13px]">
          {created.key}
        </code>
        <div className="flex flex-wrap gap-[8px]">
          <CopyButton value={created.key} label="Copy key" />
          <CopyButton value={command} label="Copy login command" />
        </div>
      </div>
      <div className="flex flex-col gap-[6px] text-[14px] text-textMuted">
        <span>Then, in your terminal:</span>
        <pre className="overflow-x-auto rounded-panel border border-line bg-bgInner p-[12px] font-mono text-[13px] text-textColor">
          {command}
          {'\n'}npx -y pocket3d publish model.glb --title &quot;My model&quot;
        </pre>
        <span>
          The setup commands above now include this key. For CI you can set
          POCKET3D_URL and POCKET3D_API_KEY instead.
        </span>
      </div>
      <div>
        <Button variant="secondary" onClick={onDone}>
          Done, I saved it
        </Button>
      </div>
    </Card>
  );
};

const KeyRow: FC<{ apiKey: ApiKeyRow; onRevoked: () => void }> = ({
  apiKey,
  onRevoked,
}) => {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const revoke = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api-keys/${apiKey.id}`, { method: 'DELETE' });
      onRevoked();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-[8px] border-b border-line py-[12px] last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-[2px]">
        <span className="truncate text-[15px] font-semibold">
          {apiKey.name}
        </span>
        <span className="text-[12px] text-textMuted">
          <span className="font-mono">{apiKey.prefix}…</span> · created{' '}
          {when(apiKey.createdAt)} · last used {when(apiKey.lastUsedAt)}
        </span>
        <Notice>{error}</Notice>
      </div>
      <div className="flex gap-[8px]">
        {confirm ? (
          <>
            <Button variant="danger" onClick={revoke} loading={busy}>
              Revoke now
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Revoke
          </Button>
        )}
      </div>
    </li>
  );
};

export const ApiKeys: FC<{
  mainUrl: string;
  onCreated?: (key: string) => void;
}> = ({ mainUrl, onCreated }) => {
  const { data, error, isLoading, mutate } = useApiKeys();
  const [name, setName] = useState('');
  const [created, setCreated] = useState<{ name: string; key: string } | null>(
    null
  );
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    setBusy(true);
    try {
      const result = await apiFetch<{ name: string; key: string }>(
        '/api-keys',
        { method: 'POST', body: { name } }
      );
      setCreated({ name: result.name, key: result.key });
      onCreated?.(result.key);
      setName('');
      mutate();
    } catch (err) {
      setFormError((err as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-[20px]">
      {created && (
        <NewKey
          mainUrl={mainUrl}
          created={created}
          onDone={() => setCreated(null)}
        />
      )}
      <Card
        title="API keys"
        description="For the CLI, scripts and agents without OAuth. One per machine or agent, so you can revoke one without touching the others."
      >
        <form
          onSubmit={create}
          className="flex flex-col gap-[12px] sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <Field
              label="Name"
              placeholder="Claude Code on my laptop"
              maxLength={60}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button type="submit" loading={busy} disabled={!name.trim()}>
            Create key
          </Button>
        </form>
        <Notice>{formError}</Notice>
      </Card>
      <Card title="Your keys">
        {error ? (
          <Notice>{(error as Error).message}</Notice>
        ) : isLoading || !data ? (
          <p className="text-[14px] text-textMuted">Loading…</p>
        ) : data.length === 0 ? (
          <p className="text-[14px] text-textMuted">No keys yet.</p>
        ) : (
          <ul className="flex flex-col">
            {data.map((apiKey) => (
              <KeyRow
                key={apiKey.id}
                apiKey={apiKey}
                onRevoked={() => mutate()}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
