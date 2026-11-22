'use client';

import {
  CSSProperties,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { onMotionChange, prefersStill } from './motion';

// The home page's second section: what pocket3d does, in three tabs.
// Each tab plays a short CSS story; the bar under the tabs moves to the next
// one when it fills. Nothing plays until the section is on screen

const TABS = [
  {
    id: 'publish',
    label: 'Publish',
    line: 'Your .glb goes online in seconds, from a file or a URL.',
  },
  {
    id: 'share',
    label: 'Share',
    line: 'A link anyone can open on any phone, with a real preview in the chat.',
  },
  {
    id: 'manage',
    label: 'Manage',
    line: 'Every model in one library. Rename it, find it, take it down.',
  },
] as const;

const TAB_MS = 5500;

const at = (seconds: number): CSSProperties => ({
  animationDelay: `${seconds}s`,
});

function Cube({ size = 56 }: { size?: number }) {
  return (
    <div className="p3d-cube-wrap">
      <div className="p3d-cube" style={{ '--s': `${size}px` } as CSSProperties}>
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

function Check() {
  return (
    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent text-accentText">
      <svg
        viewBox="0 0 12 12"
        className="h-[10px] w-[10px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M2.5 6.5l2.2 2.2L9.5 3.8" />
      </svg>
    </span>
  );
}

function PublishStory() {
  return (
    <div className="flex flex-col items-center gap-[24px]">
      <div className="p3d-pop" style={at(2.4)}>
        <Cube size={64} />
      </div>
      <div className="w-[300px] max-w-full rounded-[14px] border border-line bg-bg p-[14px] text-left text-[13px]">
        <div className="p3d-rise font-mono text-textMuted" style={at(0.2)}>
          <span className="text-accent">$</span> npx pocket3d publish fox.glb
        </div>
        <div className="mt-[12px] h-[6px] overflow-hidden rounded-full bg-line">
          <div
            className="p3d-fill h-full rounded-full bg-accent"
            style={at(0.8)}
          />
        </div>
        <div
          className="p3d-rise mt-[12px] flex items-center gap-[8px]"
          style={at(2.4)}
        >
          <Check />
          <span>
            Live at{' '}
            <span className="font-mono text-accent">pocket3d.co/m/3fK9…</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function ShareStory() {
  return (
    <div className="relative h-[300px] w-[190px] overflow-hidden rounded-[28px] border border-line bg-bg">
      {/* the chat, until the link is tapped */}
      <div
        className="p3d-out absolute inset-0 flex flex-col justify-end gap-[8px] p-[12px] text-left text-[12px]"
        style={at(2.9)}
      >
        <div
          className="p3d-rise w-fit rounded-[12px] bg-bgInner px-[10px] py-[6px]"
          style={at(0.2)}
        >
          here&apos;s the fox for the client
        </div>
        <div
          className="p3d-rise relative w-[150px] overflow-hidden rounded-[12px] border border-line bg-bgInner"
          style={at(0.9)}
        >
          <div className="p3d-stage flex h-[84px] items-center justify-center">
            <Cube size={30} />
          </div>
          <div className="p-[8px]">
            <div className="font-semibold">Low-poly fox</div>
            <div className="text-[11px] text-textMuted">pocket3d.co</div>
          </div>
          <span
            className="p3d-tap absolute left-[60px] top-[30px] h-[28px] w-[28px] rounded-full border-2 border-accent"
            style={at(2.2)}
          />
        </div>
      </div>
      {/* the viewer it opens */}
      <div
        className="p3d-rise p3d-stage absolute inset-0 flex flex-col items-center justify-center gap-[28px]"
        style={at(3.1)}
      >
        <Cube size={72} />
        <div className="text-[11px] text-textMuted">drag to rotate</div>
      </div>
    </div>
  );
}

const LIBRARY = ['fox', 'chair', 'robot', 'lamp', 'boat', 'test-3'];

function ManageStory() {
  return (
    <div className="w-[320px] max-w-full rounded-[14px] border border-line bg-bg p-[12px] text-left text-[12px]">
      <div className="relative mb-[10px] h-[16px] text-textMuted">
        <span className="p3d-out absolute" style={at(3)}>
          Your library · 6 models
        </span>
        <span className="p3d-rise absolute" style={at(3.3)}>
          Your library · 5 models
        </span>
      </div>
      <div className="grid grid-cols-3 gap-[8px]">
        {LIBRARY.map((name) => {
          const renamed = name === 'robot';
          const deleted = name === 'test-3';
          return (
            <div
              key={name}
              className={`relative rounded-[10px] border border-line bg-bgInner ${
                deleted ? 'p3d-out' : ''
              }`}
              style={deleted ? at(2.8) : undefined}
            >
              <div className="p3d-stage flex h-[54px] items-center justify-center rounded-t-[10px]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-[20px] w-[20px] text-accent"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5L12 2.5z" />
                  <path d="M3.5 7.25L12 12l8.5-4.75M12 12v9.5" />
                </svg>
              </div>
              <div className="relative h-[26px] px-[8px] py-[5px]">
                {renamed ? (
                  <>
                    <span className="p3d-out absolute" style={at(1)}>
                      robot
                    </span>
                    <span
                      className="p3d-rise absolute font-semibold text-accent"
                      style={at(1.3)}
                    >
                      Robot v2
                    </span>
                  </>
                ) : (
                  name
                )}
              </div>
              {deleted && (
                <span
                  className="p3d-pop absolute right-[6px] top-[6px] rounded-full bg-danger px-[6px] py-[1px] text-[10px] text-accentText"
                  style={at(2)}
                >
                  delete
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STORIES = {
  publish: PublishStory,
  share: ShareStory,
  manage: ManageStory,
};

export function CoreSection() {
  const [tab, setTab] = useState(0);
  const [seen, setSeen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const still = useSyncExternalStore(onMotionChange, prefersStill, () => false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const current = TABS[tab];
  const Story = STORIES[current.id];
  const playing = seen && !still;

  return (
    <section
      ref={ref}
      className="flex flex-col items-center gap-[20px] py-[32px] text-center"
    >
      <h2 className="text-balance text-[28px] font-bold leading-tight sm:text-[36px]">
        One sentence to your agent. Your model is live.
      </h2>
      <div className="w-full max-w-[420px]">
        <div
          role="tablist"
          className="grid grid-cols-3 rounded-full border border-line p-[4px] text-[14px]"
        >
          {TABS.map((t, i) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={i === tab}
              onClick={() => setTab(i)}
              className={`rounded-full px-[12px] py-[8px] transition-colors ${
                i === tab
                  ? 'bg-accent font-semibold text-accentText'
                  : 'text-textMuted hover:text-textColor'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mx-[12px] mt-[10px] h-[2px] overflow-hidden rounded-full bg-line">
          {playing && (
            <div
              key={tab}
              className="p3d-fill h-full bg-accent"
              style={{
                animationDuration: `${TAB_MS}ms`,
                animationTimingFunction: 'linear',
              }}
              onAnimationEnd={() => setTab((tab + 1) % TABS.length)}
            />
          )}
        </div>
      </div>
      <p
        key={current.id}
        className="p3d-rise max-w-[420px] text-balance text-[17px] leading-relaxed text-textColor"
      >
        {current.line}
      </p>
      <div
        aria-hidden
        className="flex h-[360px] w-full max-w-[640px] items-center justify-center overflow-hidden rounded-[20px] border border-line bg-bgInner px-[16px]"
      >
        {(seen || still) && <Story key={current.id} />}
      </div>
    </section>
  );
}
