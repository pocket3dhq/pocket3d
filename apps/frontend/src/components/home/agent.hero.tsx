'use client';

import { ReactNode, useEffect, useState, useSyncExternalStore } from 'react';
import { onMotionChange, prefersStill } from './motion';

// The home page hero: the agent name in the headline rotates, and a mock chat
// below plays what that agent does with pocket3d, one step at a time.
// Only agents the Connect page really sets up belong here

type Step = { text: string; link?: string };
type Scene = { agent: string; prompt: string; steps: Step[]; preview?: string };

const SCENES: Scene[] = [
  {
    agent: 'Claude Code',
    prompt: 'Publish ./out/fox.glb and give me a link for the team.',
    steps: [
      { text: 'Uploaded fox.glb · 2.4 MB' },
      { text: 'Link ready', link: 'pocket3d.co/m/3fK9xQ2mLp7Z' },
    ],
    preview: 'Low-poly fox',
  },
  {
    agent: 'Claude',
    prompt:
      'Put the chair you just generated online so my client can see it on their phone.',
    steps: [
      { text: 'Fetched chair.glb from the generator' },
      { text: 'Link ready', link: 'pocket3d.co/m/Qm8vT2kLx9Ra' },
    ],
    preview: 'Lounge chair',
  },
  {
    agent: 'Codex',
    prompt: 'Rename the robot model to "Robot v2" and send me its link.',
    steps: [
      { text: 'Found "robot" in your library' },
      { text: 'Renamed to Robot v2', link: 'pocket3d.co/m/Zp4nW7cYb2Ke' },
    ],
  },
  {
    agent: 'Cursor',
    prompt: 'List my models and take down the old test uploads.',
    steps: [
      { text: '12 models in your library' },
      { text: 'Deleted 3 test models, their links are gone' },
    ],
  },
];

// step 0: prompt, 1: "Using pocket3d", 2..: each step, then the preview card
const STEP_MS = 900;
const HOLD_MS = 2600;

export function AgentHero({ children }: { children?: ReactNode }) {
  const [scene, setScene] = useState(0);
  const [step, setStep] = useState(0);
  const still = useSyncExternalStore(onMotionChange, prefersStill, () => false);

  const current = SCENES[scene];
  const last = current.steps.length + 2;

  useEffect(() => {
    if (still) return;
    const timer = setTimeout(
      () => {
        if (step < last) {
          setStep(step + 1);
        } else {
          setScene((scene + 1) % SCENES.length);
          setStep(0);
        }
      },
      step < last ? STEP_MS : HOLD_MS
    );
    return () => clearTimeout(timer);
  }, [scene, step, last, still]);

  // with reduced motion, show the first scene finished and keep it there
  const shown = still ? last : step;

  return (
    <div className="flex flex-col items-center gap-[28px] text-center">
      <h1 className="text-balance text-[34px] font-bold leading-tight sm:text-[48px]">
        Publish and manage your 3D models
        <br />
        with{' '}
        <span key={current.agent} className="p3d-swap inline-block text-accent">
          {current.agent}
        </span>
      </h1>
      <p className="max-w-[560px] text-[16px] leading-relaxed text-textMuted">
        Every model gets a link anyone can open, on any phone or computer, with
        a proper preview when you paste it in a chat.
      </p>
      {children}

      <div
        aria-hidden
        className="w-full max-w-[560px] overflow-hidden rounded-[16px] border border-line bg-bgInner text-left text-[14px]"
      >
        <div className="flex items-center gap-[8px] border-b border-line px-[16px] py-[12px] font-semibold">
          <span className="h-[8px] w-[8px] rounded-full bg-accent" />
          <span key={current.agent} className="p3d-swap">
            {current.agent}
          </span>
        </div>
        <div className="flex min-h-[320px] flex-col gap-[12px] p-[16px]">
          <div
            key={current.prompt}
            className="p3d-rise ml-auto max-w-[85%] rounded-[14px] bg-bg px-[14px] py-[10px] leading-relaxed"
          >
            {current.prompt}
          </div>
          {shown >= 1 && (
            <div className="p3d-rise w-fit rounded-full border border-line px-[10px] py-[4px] text-[12px] text-textMuted">
              Using <span className="text-accent">pocket3d</span>
            </div>
          )}
          {current.steps.map((s, i) => {
            const at = i + 2;
            if (shown < at - 1) return null;
            const done = shown >= at;
            return (
              <div
                key={s.text}
                className="p3d-rise flex items-start gap-[10px]"
              >
                <span
                  className={`mt-[2px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${
                    done
                      ? 'border-accent bg-accent text-accentText'
                      : 'p3d-spin border-line border-t-accent'
                  }`}
                >
                  {done && (
                    <svg
                      viewBox="0 0 12 12"
                      className="h-[10px] w-[10px]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M2.5 6.5l2.2 2.2L9.5 3.8" />
                    </svg>
                  )}
                </span>
                <span className={done ? 'text-textColor' : 'text-textMuted'}>
                  {s.text}
                  {done && s.link && (
                    <span className="block font-mono text-[13px] text-accent">
                      {s.link}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
          {current.preview && shown >= last && (
            <div className="p3d-rise ml-[28px] flex w-fit items-center gap-[12px] rounded-[12px] border border-line bg-bg p-[10px] pr-[16px]">
              <div className="p3d-stage flex h-[44px] w-[44px] items-center justify-center rounded-[8px]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-[22px] w-[22px] text-accent"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5L12 2.5z" />
                  <path d="M3.5 7.25L12 12l8.5-4.75M12 12v9.5" />
                </svg>
              </div>
              <div>
                <div className="font-semibold">{current.preview}</div>
                <div className="text-[12px] text-textMuted">
                  pocket3d.co · interactive 3D
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
