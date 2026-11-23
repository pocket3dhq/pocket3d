'use client';

import { FC, KeyboardEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { PanelVersion, shortDate, sourceLabel, VersionSourceLabel } from './versions';

// One entry of a version's "⋯" menu
export interface PanelAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  // why it is disabled, or what it does
  hint?: string;
  danger?: boolean;
}

// Where a version came from, as a small icon (the screenshot's cloud /
// branch icons): dashboard upload, CLI / API, AI agent
const SourceIcon: FC<{ source: VersionSourceLabel }> = ({ source }) => {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (source === 'api') {
    return (
      <svg {...common}>
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    );
  }
  if (source === 'mcp') {
    return (
      <svg {...common}>
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
        <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A3.75 3.75 0 0 1 17.5 18z" />
      <polyline points="9.5 13.5 12 11 14.5 13.5" />
      <line x1="12" y1="11" x2="12" y2="16" />
    </svg>
  );
};

const Row: FC<{
  version: PanelVersion;
  live: boolean;
  showing: boolean;
  menuOpen: boolean;
  actions: PanelAction[];
  buttonRef: (element: HTMLButtonElement | null) => void;
  onSelect: () => void;
  onPrefetch?: () => void;
  onMenu: (open: boolean) => void;
}> = ({ version, live, showing, menuOpen, actions, buttonRef, onSelect, onPrefetch, onMenu }) => {
  const draft = version.status === 'draft';
  return (
    <li className="relative">
      <div
        className={`flex items-center gap-[8px] rounded-control pe-[4px] ${
          showing ? 'bg-textColor/[0.08]' : 'hover:bg-textColor/[0.04]'
        }`}
      >
        <button
          ref={buttonRef}
          type="button"
          onClick={onSelect}
          onMouseEnter={onPrefetch}
          onFocus={onPrefetch}
          aria-current={showing ? 'true' : undefined}
          className="flex min-w-0 flex-1 items-center gap-[10px] rounded-control py-[9px] ps-[10px] text-start outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <span
            aria-hidden
            className={`h-[7px] w-[7px] shrink-0 rounded-full ${
              live ? 'bg-success' : draft ? 'border border-dashed border-textMuted' : 'bg-textMuted/50'
            }`}
          />
          <span
            className={`w-[44px] shrink-0 font-mono text-[13px] font-semibold ${
              live ? 'text-success' : showing ? 'text-textColor' : 'text-textColor/80'
            }`}
          >
            v{version.number}
          </span>
          <span
            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-control bg-textColor/[0.06] text-textMuted"
            title={sourceLabel(version.source, version.sourceName)}
          >
            <SourceIcon source={version.source} />
            <span className="sr-only">{sourceLabel(version.source, version.sourceName)}</span>
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-textMuted">
            {live ? <span className="font-medium text-success">Live</span> : draft ? <span className="font-medium text-textColor/80">Draft</span> : null}
          </span>
          <span className="shrink-0 font-mono text-[12px] text-textMuted">{shortDate(version.createdAt)}</span>
        </button>
        {actions.length > 0 && (
          <button
            type="button"
            aria-label={`Actions for v${version.number}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => onMenu(!menuOpen)}
            className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-control text-textMuted outline-none hover:bg-textColor/[0.08] hover:text-textColor focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
        )}
      </div>
      {menuOpen && (
        <div
          role="menu"
          className="absolute end-[4px] top-[38px] z-20 flex min-w-[200px] flex-col rounded-control border border-line bg-bgInner py-[4px] shadow-lg"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              title={action.hint}
              onClick={() => {
                onMenu(false);
                action.onSelect();
              }}
              className={`flex flex-col px-[12px] py-[7px] text-start text-[13px] outline-none hover:bg-textColor/[0.06] focus-visible:bg-textColor/[0.08] disabled:cursor-not-allowed disabled:opacity-50 ${
                action.danger ? 'text-danger' : 'text-textColor'
              }`}
            >
              {action.label}
              {action.disabled && action.hint && <span className="text-[11px] text-textMuted">{action.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </li>
  );
};

const GroupHeading: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-[8px] px-[10px] pb-[4px] pt-[10px] font-mono text-[11px] uppercase tracking-wider text-textMuted">
    <span>{children}</span>
    <span className="h-px flex-1 bg-line" />
  </div>
);

// The list of a model's versions (the screenshot): newest first, the live
// one with a green dot and "Live", the one on screen highlighted, each with
// where it came from, its date and a "⋯" menu. Clicking a row shows that
// version; ↑ / ↓ move through the list. With drafts (the owner's view) they
// get their own group above the published ones
export const VersionsPanel: FC<{
  versions: PanelVersion[];
  live: number | null;
  shown: number;
  onSelect: (number: number) => void;
  onPrefetch?: (number: number) => void;
  actions: (version: PanelVersion) => PanelAction[];
  heading?: string;
}> = ({ versions, live, shown, onSelect, onPrefetch, actions, heading = 'Versions' }) => {
  const [menu, setMenu] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<number, HTMLButtonElement>());

  // a click elsewhere or Escape closes the menu
  useEffect(() => {
    if (menu === null) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const drafts = versions.filter((version) => version.status === 'draft');
  const published = versions.filter((version) => version.status !== 'draft');
  // the order on screen, for the arrow keys
  const ordered = [...drafts, ...published];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const index = ordered.findIndex((version) => version.number === shown);
    const next = ordered[index + (event.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    onSelect(next.number);
    buttons.current.get(next.number)?.focus();
  };

  const row = (version: PanelVersion) => (
    <Row
      key={version.number}
      version={version}
      live={version.number === live}
      showing={version.number === shown}
      menuOpen={menu === version.number}
      actions={actions(version)}
      buttonRef={(element) => {
        if (element) buttons.current.set(version.number, element);
        else buttons.current.delete(version.number);
      }}
      onSelect={() => onSelect(version.number)}
      onPrefetch={onPrefetch ? () => onPrefetch(version.number) : undefined}
      onMenu={(open) => setMenu(open ? version.number : null)}
    />
  );

  const note = versions.find((version) => version.number === shown)?.note;
  return (
    <div ref={rootRef} onKeyDown={onKeyDown}>
      {drafts.length > 0 && (
        <>
          <GroupHeading>Drafts</GroupHeading>
          <ul className="flex flex-col">{drafts.map(row)}</ul>
        </>
      )}
      <GroupHeading>{drafts.length ? 'Published' : heading}</GroupHeading>
      <ul className="flex flex-col">{published.map(row)}</ul>
      {note && (
        <p className="mx-[10px] mt-[10px] border-t border-line pt-[10px] text-[13px] text-textColor/80">
          <span className="font-mono text-[12px] text-textMuted">v{shown} · </span>
          {note}
        </p>
      )}
    </div>
  );
};
