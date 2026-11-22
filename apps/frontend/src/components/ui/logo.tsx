import { FC } from 'react';

// The wordmark: a cube outline in the accent colour and the name in monospace
export const Logo: FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex items-center gap-[8px] font-mono text-[15px] font-medium tracking-[-0.02em] text-textColor ${className}`}
  >
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-[18px] w-[18px] text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5L12 2.5z" />
      <path d="M3.5 7.25L12 12l8.5-4.75M12 12v9.5" />
    </svg>
    pocket3d
  </span>
);
