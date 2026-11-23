'use client';

import Link from 'next/link';
import { FC, FormEvent, useState } from 'react';
import { OwnedAsset, useAssets } from '@pocket3d/frontend/hooks/use.assets';
import { apiFetch } from '@pocket3d/frontend/lib/api';
import { BUTTON_BASE, BUTTON_VARIANTS, Button } from '@pocket3d/frontend/components/ui/button';
import { Notice } from '@pocket3d/frontend/components/ui/notice';
import { Card } from '@pocket3d/frontend/components/ui/card';
import { formatCount } from '@pocket3d/frontend/components/viewer/download';

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
    : bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(bytes ? 1 : 0, Math.round(bytes / 1024))} KB`;

// "12.3 MB of 500 MB used", with a bar when there is a limit
const StorageMeter: FC<{ used: number; limit: number | null }> = ({
  used,
  limit,
}) => {
  if (limit === null) {
    return (
      <p className="text-[13px] text-textMuted">{formatSize(used)} stored</p>
    );
  }
  const percent = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="flex flex-col gap-[6px]">
      <p className="text-[13px] text-textMuted">
        {formatSize(used)} of {formatSize(limit)} used
      </p>
      <div
        className="h-[6px] w-full max-w-[320px] overflow-hidden rounded-full bg-bgInner"
        role="progressbar"
        aria-label="Storage used"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full ${percent >= 90 ? 'bg-danger' : 'bg-accent'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

const ModelRow: FC<{ asset: OwnedAsset; onChange: () => void }> = ({
  asset,
  onChange,
}) => {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(asset.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/assets/${asset.id}`, { method: 'PUT', body: { title } });
      setEditing(false);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/assets/${asset.id}`, { method: 'DELETE' });
      onChange();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-[10px] border-b border-line py-[14px] last:border-b-0">
      <div className="flex items-start gap-[14px]">
        <div className="h-[56px] w-[56px] shrink-0 overflow-hidden rounded-control border border-line bg-bgInner">
          {asset.coverPath && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.coverPath}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
          {editing ? (
            <form onSubmit={rename} className="flex flex-wrap gap-[8px]">
              <input
                aria-label="Title"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                className="min-w-0 flex-1 rounded-control border border-line bg-bgInner px-[10px] py-[6px] text-[14px] outline-none focus:border-accent"
                autoFocus
              />
              <Button type="submit" loading={busy}>
                Save
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setTitle(asset.title);
                }}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <Link
              href={`/dashboard/m/${asset.id}`}
              className="truncate text-[15px] font-semibold hover:underline"
            >
              {asset.title}
            </Link>
          )}
          <div className="flex flex-wrap gap-x-[10px] text-[12px] text-textMuted">
            <span>{formatDate(asset.activityAt || asset.createdAt)}</span>
            {asset.version !== null && (asset.versions > 1 || asset.drafts > 0) && (
              <span>
                <span className="text-success">v{asset.version}</span> · {asset.versions} versions
                {asset.drafts > 0 ? ` · ${asset.drafts} draft${asset.drafts === 1 ? '' : 's'}` : ''}
              </span>
            )}
            <span>{formatSize(asset.fileSize)}</span>
            <span>
              {formatCount(asset.views, 'view', 'views')}
              {asset.allowDownload || asset.downloads > 0
                ? ` · ${formatCount(asset.downloads, 'download', 'downloads')}${asset.allowDownload ? '' : ' (off)'}`
                : ''}
            </span>
            <span className="truncate font-mono">{asset.url}</span>
          </div>
        </div>
      </div>
      {!editing && (
        <div className="flex flex-wrap gap-[8px] ps-[70px]">
          <a
            href={asset.url}
            target="_blank"
            rel="noopener"
            className={`${BUTTON_BASE} ${BUTTON_VARIANTS.secondary}`}
          >
            Open
          </a>
          <Button
            variant="secondary"
            onClick={() => navigator.clipboard?.writeText(asset.url)}
          >
            Copy link
          </Button>
          <Link
            href={`/dashboard/m/${asset.id}`}
            className={`${BUTTON_BASE} ${BUTTON_VARIANTS.secondary}`}
          >
            Versions
          </Link>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Rename
          </Button>
          {confirmDelete ? (
            <>
              <Button variant="danger" onClick={remove} loading={busy}>
                Delete for good
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
        </div>
      )}
      {confirmDelete && (
        <p className="ps-[70px] text-[13px] text-textMuted">
          The link stops working and the files are removed
          {asset.versions + asset.drafts > 1
            ? ` (all ${asset.versions + asset.drafts} versions).`
            : '.'}
        </p>
      )}
      <div className="ps-[70px]">
        <Notice>{error}</Notice>
      </div>
    </li>
  );
};

export const ModelsList: FC = () => {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, mutate } = useAssets(page);

  if (error) {
    return <Notice>{(error as Error).message}</Notice>;
  }
  if (isLoading || !data) {
    return <p className="text-[14px] text-textMuted">Loading your models…</p>;
  }
  if (!data.total) {
    return (
      <div className="flex flex-col gap-[16px]">
        <StorageMeter used={data.storage.used} limit={data.storage.limit} />
        <Card
          title="No models yet"
          description="Drop a .glb above, or publish one from your terminal or your AI agent:"
        >
          <pre className="overflow-x-auto rounded-panel border border-line bg-bgInner p-[14px] font-mono text-[13px]">
            npx -y pocket3d publish model.glb --title &quot;My model&quot;
          </pre>
          <p className="text-[14px] text-textMuted">
            First{' '}
            <Link
              href="/dashboard/keys"
              className="text-accent hover:underline"
            >
              connect your agent
            </Link>{' '}
            (Claude Code, Cursor, Codex, Claude.ai) or log the CLI in.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[16px]">
      <StorageMeter used={data.storage.used} limit={data.storage.limit} />
      <ul className="flex flex-col">
        {data.assets.map((asset) => (
          <ModelRow key={asset.id} asset={asset} onChange={() => mutate()} />
        ))}
      </ul>
      {data.pages > 1 && (
        <div className="flex items-center gap-[12px] text-[14px] text-textMuted">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span>
            Page {data.page} of {data.pages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= data.pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};
