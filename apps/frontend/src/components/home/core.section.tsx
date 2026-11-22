'use client';

import {
  CSSProperties,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { onMotionChange, prefersStill } from './motion';
import { SectionHeading } from './section.heading';
import { Cube } from './cube';

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

function Check() {
  return (
    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-success text-bg">
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
      <div className="w-[300px] max-w-full rounded-panel border border-line bg-bg p-[14px] text-left text-[13px]">
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
          className="p3d-rise w-fit rounded-panel bg-bgInner px-[10px] py-[6px]"
          style={at(0.2)}
        >
          here&apos;s the fox for the client
        </div>
        <div
          className="p3d-rise relative w-[150px] overflow-hidden rounded-panel border border-line bg-bgInner"
          style={at(0.9)}
        >
          <div className="p3d-stage flex h-[84px] items-center justify-center">
            <Cube size={30} />
          </div>
          <div className="p-[8px]">
            <div className="font-medium">Low-poly fox</div>
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
        <div className="font-mono text-[11px] text-textMuted">
          drag to rotate
        </div>
      </div>
    </div>
  );
}

const LIBRARY = ['fox', 'chair', 'robot', 'lamp', 'boat', 'test-3'];

function ManageStory() {
  return (
    <div className="w-[320px] max-w-full rounded-panel border border-line bg-bg p-[12px] text-left text-[12px]">
      <div className="relative mb-[10px] h-[16px] font-mono text-textMuted">
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
              className={`relative rounded-control border border-line bg-bgInner ${
                deleted ? 'p3d-out' : ''
              }`}
              style={deleted ? at(2.8) : undefined}
            >
              <div className="p3d-stage flex h-[54px] items-center justify-center rounded-t-control">
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
                      className="p3d-rise absolute font-medium text-accent"
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
                  className="p3d-pop absolute right-[6px] top-[6px] rounded-control bg-danger px-[6px] py-[1px] font-mono text-[10px] text-bg"
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
    <section ref={ref} className="flex flex-col gap-[32px]">
      <SectionHeading
        title="One sentence to your agent."
        subtitle="Your model is live, shared and in your library."
      />
      <div className="grid border border-line lg:grid-cols-[1fr_1.5fr]">
        <div
          role="tablist"
          aria-orientation="vertical"
          className="flex flex-col"
        >
          {TABS.map((t, i) => {
            const active = i === tab;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(i)}
                className={`relative flex flex-col gap-[8px] border-b border-line px-[24px] py-[24px] text-left transition-colors last:border-b-0 lg:flex-1 lg:justify-center sm:px-[32px] ${
                  active ? 'bg-bgInner/60' : 'hover:bg-bgInner/30'
                }`}
              >
                <span
                  className={`font-mono text-[18px] tracking-[-0.02em] ${
                    active ? 'text-textColor' : 'text-textMuted'
                  }`}
                >
                  {t.label}
                </span>
                <span
                  className={`text-[15px] leading-relaxed ${
                    active ? 'text-textMuted' : 'text-textMuted/60'
                  }`}
                >
                  {t.line}
                </span>
                {/* how long until the next tab: fills, then moves on */}
                <span className="absolute inset-x-0 bottom-[-1px] h-[2px] overflow-hidden">
                  {active && playing && (
                    <span
                      key={tab}
                      className="p3d-fill block h-full bg-accent"
                      style={{
                        animationDuration: `${TAB_MS}ms`,
                        animationTimingFunction: 'linear',
                      }}
                      onAnimationEnd={() => setTab((tab + 1) % TABS.length)}
                    />
                  )}
                  {active && !playing && (
                    <span className="block h-full bg-accent" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <div
          aria-hidden
          className="p3d-stage flex h-[380px] items-center justify-center overflow-hidden border-t border-line px-[16px] lg:h-auto lg:min-h-[420px] lg:border-l lg:border-t-0"
        >
          {(seen || still) && <Story key={current.id} />}
        </div>
      </div>
    </section>
  );
}
