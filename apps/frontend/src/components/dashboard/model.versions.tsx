'use client';

import Link from 'next/link';
import { FC, FormEvent, useState } from 'react';
import { useSWRConfig } from 'swr';
import { OwnedModel, OwnedVersion, useAsset } from '@pocket3d/frontend/hooks/use.asset';
import { apiFetch } from '@pocket3d/frontend/lib/api';
import { BUTTON_BASE, BUTTON_VARIANTS, Button } from '@pocket3d/frontend/components/ui/button';
import { Notice } from '@pocket3d/frontend/components/ui/notice';
import { CopyButton } from '@pocket3d/frontend/components/dashboard/copy.button';
import { UploadModel } from '@pocket3d/frontend/components/dashboard/upload.model';
import { ModelViewer } from '@pocket3d/frontend/components/viewer/model.viewer';
import { PanelAction, VersionsPanel } from '@pocket3d/frontend/components/viewer/versions.panel';
import { shortDate, sourceLabel } from '@pocket3d/frontend/components/viewer/versions';
import { downloadFile, downloadFileName, formatCount, formatSize } from '@pocket3d/frontend/components/viewer/download';

const NOTE_MAX_LENGTH = 280;

const STATS_HELP =
  'Views: visits to the share link (embeds included) from a browser, once per tab; your own visits while signed in and link-preview bots are not counted. Downloads: clicks on the Download button of the share link. Fetching the file URL directly is not counted.';

// Why a version can't be deleted (null: it can)
const deleteBlock = (model: OwnedModel, version: OwnedVersion) => {
  if (version.status === 'draft') return null;
  if (model.versions <= 1) return 'The only published version: delete the model instead';
  if (version.live) return 'The live version: make another version live first';
  return null;
};

// The owner's page for one model (/dashboard/m/<id>): its versions, drafts
// included, the viewer to look at any of them, and every change: publish a
// draft, make a version live (roll back), edit a note, delete, upload the
// next version. The public viewer has none of these (it can be framed by
// other sites; this page can't)
export const ModelVersions: FC<{ id: string; initialVersion: number | null }> = ({ id, initialVersion }) => {
  const { data: model, error, isLoading } = useAsset(id);
  const { mutate } = useSWRConfig();
  const [selected, setSelected] = useState<number | null>(initialVersion);
  const [editing, setEditing] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (error) {
    return (
      <div className="flex flex-col gap-[12px]">
        <Notice>{(error as Error).message}</Notice>
        <Link href="/dashboard" className="text-[14px] text-accent hover:underline">
          ← Your models
        </Link>
      </div>
    );
  }
  if (isLoading || !model) {
    return <p className="text-[14px] text-textMuted">Loading the model…</p>;
  }

  const history = model.history;
  // the version on screen: the one asked for if it still exists, else the live one
  const shown =
    history.find((version) => version.number === selected) ||
    history.find((version) => version.live) ||
    history[0];

  const select = (number: number) => {
    setSelected(number);
    setEditing(null);
    setConfirmDelete(null);
    window.history.replaceState(null, '', `/dashboard/m/${model.id}?v=${number}`);
  };

  // every change refreshes this page, the list and the storage meter
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      await action();
      await mutate((key) => typeof key === 'string' && key.startsWith('/assets'));
      return true;
    } catch (err) {
      setProblem((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const base = `/assets/${encodeURIComponent(model.id)}`;
  const publish = (number: number, live: boolean) =>
    run(() => apiFetch(`${base}/versions/${number}/publish`, { method: 'POST', body: { live } }));
  const makeLive = (number: number) => run(() => apiFetch(base, { method: 'PUT', body: { liveVersion: number } }));
  const setDownloads = (allowDownload: boolean) => run(() => apiFetch(base, { method: 'PUT', body: { allowDownload } }));
  // the owner can always save their own file (drafts too); it isn't counted
  const download = async () => {
    setDownloading(true);
    try {
      await downloadFile(shown.path, downloadFileName(model.title, shown.number, model.live));
    } finally {
      setDownloading(false);
    }
  };
  const remove = async (number: number) => {
    const done = await run(() => apiFetch(`${base}/versions/${number}`, { method: 'DELETE' }));
    if (done) {
      setConfirmDelete(null);
      if (shown.number === number) setSelected(null);
    }
  };
  const saveNote = async (event: FormEvent) => {
    event.preventDefault();
    if (editing === null) return;
    const done = await run(() => apiFetch(`${base}/versions/${editing}`, { method: 'PUT', body: { note } }));
    if (done) setEditing(null);
  };
  const startEditing = (version: OwnedVersion) => {
    select(version.number);
    setNote(version.note || '');
    setEditing(version.number);
  };

  const actions = (item: { number: number }): PanelAction[] => {
    const version = history.find((entry) => entry.number === item.number)!;
    const blocked = deleteBlock(model, version);
    const remove: PanelAction = {
      label: 'Delete…',
      danger: true,
      disabled: !!blocked,
      hint: blocked || undefined,
      onSelect: () => {
        select(version.number);
        setConfirmDelete(version.number);
      },
    };
    const edit: PanelAction = { label: 'Edit note', onSelect: () => startEditing(version) };
    if (version.status === 'draft') {
      return [
        { label: 'Publish', hint: 'Adds it to the public history; the link keeps showing the live version', onSelect: () => publish(version.number, false) },
        { label: 'Publish & make live', onSelect: () => publish(version.number, true) },
        edit,
        remove,
      ];
    }
    return [
      {
        label: 'Make live',
        disabled: version.live,
        hint: version.live ? 'Already what the link shows' : undefined,
        onSelect: () => makeLive(version.number),
      },
      {
        label: 'Copy link to this version',
        onSelect: () => version.url && navigator.clipboard?.writeText(version.url),
      },
      edit,
      remove,
    ];
  };

  const draft = shown.status === 'draft';
  return (
    <main className="flex flex-col gap-[16px]">
      <Link href="/dashboard" className="self-start text-[13px] text-textMuted hover:text-textColor">
        ← Your models
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-[12px]">
        <div className="flex min-w-0 flex-col gap-[4px]">
          <h1 className="truncate text-[28px] font-semibold tracking-heading">{model.title}</h1>
          <p className="text-[13px] text-textMuted">
            {model.versions} version{model.versions === 1 ? '' : 's'}
            {model.drafts ? ` · ${model.drafts} draft${model.drafts === 1 ? '' : 's'}` : ''} · {formatSize(model.storage)} in total
          </p>
          <p className="text-[13px] text-textMuted" title={STATS_HELP}>
            <span className="text-textColor">{formatCount(model.views, 'view', 'views')}</span> ·{' '}
            <span className={model.allowDownload ? 'text-textColor' : undefined}>
              {formatCount(model.downloads, 'download', 'downloads')}
            </span>
            {!model.allowDownload && ' (downloads off)'}
            {' · '}last {model.recent.days} days: {formatCount(model.recent.views, 'view', 'views')},{' '}
            {formatCount(model.recent.downloads, 'download', 'downloads')}
          </p>
        </div>
        <div className="flex flex-wrap gap-[8px]">
          <Button variant="outline" loading={downloading} onClick={download} title={`Save v${shown.number} (${formatSize(shown.fileSize)})`}>
            Download
          </Button>
          <CopyButton value={model.url} label="Copy link" />
          <a href={model.url} target="_blank" rel="noopener" className={`${BUTTON_BASE} ${BUTTON_VARIANTS.primary}`}>
            Open
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[4px] border border-line px-[16px] py-[12px]">
        <button
          type="button"
          role="switch"
          aria-checked={model.allowDownload}
          aria-labelledby="downloads-label"
          disabled={busy}
          onClick={() => setDownloads(!model.allowDownload)}
          className={`relative h-[22px] w-[40px] shrink-0 rounded-full border transition disabled:opacity-50 ${
            model.allowDownload ? 'border-accent bg-accent' : 'border-line bg-line'
          }`}
        >
          <span
            aria-hidden
            className={`absolute top-[2px] h-[16px] w-[16px] rounded-full bg-textColor transition-[left] ${
              model.allowDownload ? 'left-[20px]' : 'left-[2px]'
            }`}
          />
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span id="downloads-label" className="text-[14px]">
            Visitors can download the .glb
          </span>
          <span className="text-[12px] text-textMuted">
            {model.allowDownload
              ? 'The share link shows a Download button for the version on screen.'
              : 'Off: no Download button on the share link.'}{' '}
            The viewer still loads the file to show it, so turning this off can't fully stop someone saving it.
          </span>
        </div>
      </div>

      <Notice>{problem}</Notice>

      <div className="grid gap-[16px] md:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-[12px]">
          <div className="p3d-stage relative h-[360px] overflow-hidden rounded-panel border border-line md:h-[440px]">
            <ModelViewer src={shown.path} title={`${model.title} v${shown.number}`} />
          </div>

          {draft && (
            <div className="flex flex-wrap items-center gap-[10px] rounded-control border border-dashed border-textColor/25 px-[12px] py-[10px] text-[14px]">
              <span className="flex-1">
                <strong>Draft:</strong> only you can see v{shown.number}. People with the link see v{model.live}.
              </span>
              <Button variant="secondary" loading={busy} onClick={() => publish(shown.number, false)}>
                Publish
              </Button>
              <Button loading={busy} onClick={() => publish(shown.number, true)}>
                Publish & make live
              </Button>
            </div>
          )}

          <section className="flex flex-col gap-[8px] border border-line p-[16px]">
            <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[4px] text-[13px] text-textMuted">
              <span className="font-mono text-[15px] font-semibold text-textColor">v{shown.number}</span>
              <span>{shown.live ? <span className="text-success">Live</span> : draft ? 'Draft' : 'Published'}</span>
              <span>{shortDate(shown.createdAt)}</span>
              <span>{formatSize(shown.fileSize)}</span>
              <span>{sourceLabel(shown.source, shown.sourceName)}</span>
            </div>
            {editing === shown.number ? (
              <form onSubmit={saveNote} className="flex flex-wrap gap-[8px]">
                <input
                  aria-label="Note"
                  value={note}
                  maxLength={NOTE_MAX_LENGTH}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="What changed in this version"
                  className="min-w-0 flex-1 rounded-control border border-line bg-bgInner px-[10px] py-[6px] text-[14px] outline-none focus:border-accent"
                  autoFocus
                />
                <Button type="submit" loading={busy}>
                  Save
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <p className="text-[14px]">
                {shown.note || <span className="text-textMuted">No note.</span>}{' '}
                <button type="button" onClick={() => startEditing(shown)} className="text-[13px] text-accent hover:underline">
                  Edit
                </button>
              </p>
            )}
            {shown.url && (
              <p className="break-all font-mono text-[12px] text-textMuted">
                Link to this version: {shown.url}
              </p>
            )}
            {confirmDelete === shown.number && (
              <div className="flex flex-col gap-[8px] border-t border-line pt-[10px]">
                <p className="text-[13px] text-textMuted">
                  {draft
                    ? `Delete the draft v${shown.number}? Its file is removed.`
                    : `Delete v${shown.number}? Links pinned to it will show the live version instead, and its file is removed.`}
                </p>
                <div className="flex gap-[8px]">
                  <Button variant="danger" loading={busy} onClick={() => remove(shown.number)}>
                    Delete for good
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                    Keep it
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="max-h-[560px] self-start overflow-y-auto rounded-panel border border-line bg-bgInner/40 p-[8px]">
          <VersionsPanel
            versions={history}
            live={model.live}
            shown={shown.number}
            onSelect={select}
            actions={actions}
          />
        </aside>
      </div>

      <UploadModel model={{ id: model.id, title: model.title }} onDone={select} />
    </main>
  );
};
