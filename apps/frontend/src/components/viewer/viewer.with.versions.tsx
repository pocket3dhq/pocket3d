'use client';

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { ModelViewer } from './model.viewer';
import { VersionsPanel } from './versions.panel';
import { canPrefetch, isTyping, neighbours, PanelVersion, shortDate, versionHref } from './versions';
import { downloadFile, downloadFileName, firstViewInTab, formatSize, sendStat } from './download';

// The public viewer (/m/<id>): the model, its title, and when it has more
// than one published version, the history to click through. Everything it
// shows comes from the server render (published versions only), so
// switching versions never asks the API anything and the model URL always
// comes from that list, never from the address bar. When the owner allows
// it, a Download button saves the version on screen
export const ViewerWithVersions: FC<{
  id: string;
  title: string;
  live: number;
  shown: number;
  // ?v= named a version that is deleted or not public: the live one is shown
  missing?: number;
  versions: PanelVersion[];
  allowDownload?: boolean;
}> = ({ id, title, live, shown: initialShown, missing, versions, allowDownload }) => {
  const [shown, setShown] = useState(initialShown);
  // open when the link named a version: it was shared to show that one
  const [open, setOpen] = useState(initialShown !== live || missing !== undefined);
  const [notice, setNotice] = useState(missing);
  const [copied, setCopied] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const prefetched = useRef(new Set<string>());

  const base = `/m/${id}`;
  const current = versions.find((version) => version.number === shown) || versions[0];
  const hasHistory = versions.length > 1;

  const select = useCallback(
    (number: number) => {
      setShown(number);
      setNotice(undefined);
      // the address bar follows, so the link can be copied as is
      window.history.replaceState(null, '', versionHref(base, number, live));
    },
    [base, live]
  );

  // Warms the browser cache (files never change at their URL), only for
  // files small enough not to cost a phone plan
  const prefetch = useCallback(
    (number: number) => {
      const version = versions.find((item) => item.number === number);
      const saveData = !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
      if (!version || prefetched.current.has(version.path) || !canPrefetch(version.fileSize, saveData)) return;
      prefetched.current.add(version.path);
      fetch(version.path)
        .then((res) => res.arrayBuffer())
        .catch(() => prefetched.current.delete(version.path));
    },
    [versions]
  );

  useEffect(() => {
    document.title = shown === live ? `${title} · pocket3d` : `${title} · v${shown} · pocket3d`;
    if (!hasHistory) return;
    const { newer, older } = neighbours(versions, shown);
    if (newer) prefetch(newer);
    if (older) prefetch(older);
  }, [shown, live, title, hasHistory, versions, prefetch]);

  // One view per visit (not per reload or version switch). Automated
  // browsers don't count
  useEffect(() => {
    if (navigator.webdriver || !firstViewInTab(id)) return;
    sendStat(id, 'views');
  }, [id]);

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    sendStat(id, 'downloads');
    try {
      await downloadFile(current.path, downloadFileName(title, current.number, live));
    } finally {
      setDownloading(false);
    }
  };

  // [ and ] step through versions from anywhere on the page
  useEffect(() => {
    if (!hasHistory) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.key !== '[' && event.key !== ']') || event.metaKey || event.ctrlKey || isTyping(event.target)) return;
      const { newer, older } = neighbours(versions, shown);
      const next = event.key === ']' ? newer : older;
      if (next) select(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasHistory, versions, shown, select]);

  const copyLink = (number: number) => {
    navigator.clipboard?.writeText(`${window.location.origin}${versionHref(base, number, live)}`).then(() => {
      setCopied(number);
      setTimeout(() => setCopied((value) => (value === number ? null : value)), 1500);
    });
  };

  return (
    <>
      <ModelViewer src={current.path} title={title} />
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-[10px] p-[16px]">
        <h1 className="min-w-0 truncate text-[16px] font-semibold text-textColor drop-shadow">{title}</h1>
        {hasHistory && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="versions-panel"
            className="pointer-events-auto flex shrink-0 items-center gap-[4px] rounded-control border border-line bg-bgInner/80 px-[8px] py-[3px] font-mono text-[12px] text-textColor backdrop-blur hover:border-textColor/30"
          >
            <span className={shown === live ? 'text-success' : undefined}>v{shown}</span>
            <span className="sr-only">, show the versions</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={open ? 'rotate-180' : undefined}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
        {allowDownload && (
          <button
            type="button"
            onClick={download}
            aria-busy={downloading || undefined}
            title={`Download ${downloadFileName(title, current.number, live)} (${formatSize(current.fileSize)})`}
            className="pointer-events-auto ms-auto flex shrink-0 items-center gap-[6px] rounded-control border border-line bg-bgInner/80 px-[10px] py-[5px] font-mono text-[12px] text-textColor backdrop-blur hover:border-textColor/30 disabled:opacity-60"
            disabled={downloading}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3v12" />
              <polyline points="7 10 12 15 17 10" />
              <path d="M5 21h14" />
            </svg>
            <span className="max-sm:sr-only">{downloading ? 'Downloading…' : 'Download'}</span>
            <span className="text-textMuted max-sm:hidden">{formatSize(current.fileSize)}</span>
          </button>
        )}
      </header>

      {(notice !== undefined || shown !== live) && (
        <div className="pointer-events-none absolute inset-x-0 top-[52px] flex justify-center px-[16px]">
          <div
            role="status"
            className="pointer-events-auto flex max-w-full items-center gap-[8px] rounded-control border border-line bg-bgInner/90 px-[10px] py-[6px] text-[12px] text-textMuted backdrop-blur"
          >
            {notice !== undefined ? (
              <>
                <span>
                  v{notice} isn't available · showing the live version (v{live})
                </span>
                <button type="button" onClick={() => setNotice(undefined)} className="text-textColor hover:underline" aria-label="Dismiss">
                  ×
                </button>
              </>
            ) : (
              <>
                <span className="truncate">
                  v{shown} · {shortDate(current.createdAt)} · not the live version
                </span>
                <button type="button" onClick={() => select(live)} className="shrink-0 font-medium text-accent hover:underline">
                  See live
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {hasHistory && open && (
        <aside
          id="versions-panel"
          aria-label="Versions"
          className="fixed inset-x-0 bottom-0 z-10 max-h-[60vh] overflow-y-auto rounded-t-panel border-t border-line bg-bgInner/95 p-[8px] pb-[20px] backdrop-blur sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-[16px] sm:top-[56px] sm:max-h-[calc(100%-120px)] sm:w-[300px] sm:rounded-panel sm:border sm:pb-[8px]"
        >
          {/* phones: the sheet closes from its corner (desktop: the v3 chip) */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute end-[14px] top-[12px] z-10 bg-bgInner px-[4px] text-[13px] text-textMuted hover:text-textColor sm:hidden"
          >
            Close
          </button>
          <VersionsPanel
            versions={versions}
            live={live}
            shown={shown}
            onSelect={select}
            onPrefetch={prefetch}
            actions={(version) => [
              {
                label: copied === version.number ? 'Copied' : 'Copy link to this version',
                onSelect: () => copyLink(version.number),
              },
            ]}
          />
        </aside>
      )}
    </>
  );
};
