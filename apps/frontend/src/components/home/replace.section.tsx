import { FC, ReactNode } from 'react';
import { Cube } from './cube';
import { MaskIcon } from './agent.icon';
import { SectionHeading } from './section.heading';

// Why not a shared folder: a before / after panel. Left, what a generic file
// store does to a 3D model; right, what pocket3d does. Only claims the app
// keeps today (viewer, preview, library, agents, open source)

const BEFORE = [
  'A .glb is just a file to download',
  'Most phones can’t open it at all',
  'Links show a file icon, not your model',
  'Built for documents, not for 3D',
];

const AFTER = [
  'Opens as an interactive 3D viewer',
  'Works on any phone, nothing to install',
  'A real preview card in every chat',
  'Your agent publishes, renames and cleans up',
];

// what a shared "models" folder ends up looking like
const FOLDER = [
  'fox_final.glb',
  'fox_final_v2.glb',
  'fox_FINAL_really.glb',
  'chair (copy).glb',
  'chair (copy 2).glb',
];

// a product named in the text, with its logo in front
const Brand: FC<{ icon: string; children: ReactNode }> = ({
  icon,
  children,
}) => (
  <span className="inline-flex items-baseline gap-[0.3em] whitespace-nowrap">
    <MaskIcon
      src={`/brands/${icon}.svg`}
      size="0.95em"
      className="translate-y-[0.12em]"
    />
    {children}
  </span>
);

const Mark: FC<{ ok?: boolean }> = ({ ok }) => (
  <span
    aria-hidden
    className={`mt-[3px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full ${
      ok ? 'bg-success text-bg' : 'border border-textMuted/40 text-textMuted'
    }`}
  >
    <svg
      viewBox="0 0 12 12"
      className="h-[9px] w-[9px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      {ok ? (
        <path d="M2.5 6.5l2.2 2.2L9.5 3.8" />
      ) : (
        <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" />
      )}
    </svg>
  </span>
);

const Label: FC<{ children: ReactNode; accent?: boolean }> = ({
  children,
  accent,
}) => (
  <div
    className={`font-mono text-[12px] uppercase tracking-[0.04em] ${
      accent ? 'text-accent' : 'text-textMuted'
    }`}
  >
    {children}
  </div>
);

export function ReplaceSection() {
  return (
    <section className="flex flex-col gap-[32px]">
      <div className="flex flex-col gap-[20px]">
        <SectionHeading
          title="Retire the shared folder."
          subtitle="3D deserves better than a file browser."
        />
        <p className="max-w-[720px] text-[18px] leading-[1.6] text-textMuted">
          Finally replace <Brand icon="dropbox">Dropbox</Brand>,{' '}
          <Brand icon="googledrive">Google Drive</Brand> and every other generic
          file store with a{' '}
          <span className="text-textColor">purpose-built 3D platform</span> you
          pilot from your favorite AI agents.
        </p>
      </div>

      <div className="relative grid border border-line lg:grid-cols-2">
        {/* before */}
        <div className="flex flex-col gap-[28px] p-[24px] sm:p-[40px]">
          <Label>
            Before · <Brand icon="dropbox">Dropbox</Brand>,{' '}
            <Brand icon="googledrive">Google Drive</Brand>,{' '}
            <Brand icon="wetransfer">WeTransfer</Brand>…
          </Label>
          <div
            aria-hidden
            className="rounded-panel border border-line bg-bgInner/50 font-mono text-[13px]"
          >
            <div className="flex items-center gap-[8px] border-b border-line px-[14px] py-[10px] text-textMuted">
              <svg
                viewBox="0 0 24 24"
                className="h-[14px] w-[14px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M3 6.5A1.5 1.5 0 014.5 5h4l2 2h9A1.5 1.5 0 0121 8.5v9a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.5z" />
              </svg>
              Shared / 3D models
            </div>
            <ul className="flex flex-col gap-[2px] p-[8px]">
              {FOLDER.map((name, i) => (
                <li
                  key={name}
                  className={`flex items-center justify-between rounded-control px-[8px] py-[6px] ${
                    i === 2
                      ? 'bg-line/60 text-textColor/80'
                      : 'text-textMuted/70'
                  }`}
                >
                  <span className="truncate">{name}</span>
                  <span className="shrink-0 pl-[12px] text-[11px] text-textMuted/50">
                    download
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <ul className="flex flex-col gap-[14px] text-[15px] text-textMuted">
            {BEFORE.map((line) => (
              <li key={line} className="flex gap-[12px]">
                <Mark />
                {line}
              </li>
            ))}
          </ul>
        </div>

        {/* the turn, on the line between the two halves */}
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 z-10 hidden h-[44px] w-[44px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-bg text-accent lg:flex"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>

        {/* after */}
        <div className="relative flex flex-col gap-[28px] overflow-hidden border-t border-line bg-bgInner/40 p-[24px] sm:p-[40px] lg:border-l lg:border-t-0">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-[120px] -top-[120px] h-[320px] w-[320px] rounded-full bg-accent/10 blur-[80px]"
          />
          <Label accent>After · pocket3d</Label>
          <div
            aria-hidden
            className="relative overflow-hidden rounded-panel border border-line bg-bg"
          >
            <div className="p3d-stage flex h-[150px] items-center justify-center">
              <Cube size={64} />
            </div>
            <div className="flex items-center justify-between gap-[12px] border-t border-line px-[14px] py-[12px]">
              <div className="min-w-0">
                <div className="truncate font-medium">Low-poly fox</div>
                <div className="truncate font-mono text-[12px] text-accent">
                  pocket3d.co/m/3fK9xQ2mLp7Z
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-[6px] rounded-control bg-success/15 px-[8px] py-[3px] font-mono text-[11px] text-success">
                <span className="h-[6px] w-[6px] rounded-full bg-success" />
                live
              </span>
            </div>
          </div>
          <ul className="relative flex flex-col gap-[14px] text-[15px] text-textColor">
            {AFTER.map((line) => (
              <li key={line} className="flex gap-[12px]">
                <Mark ok />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
