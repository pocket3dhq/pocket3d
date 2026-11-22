import { FC, ReactNode } from 'react';

// Form feedback, announced to screen readers
export const Notice: FC<{ tone?: 'error' | 'info'; children: ReactNode }> = ({ tone = 'error', children }) =>
  children ? (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-[10px] border px-[12px] py-[10px] text-[14px] ${
        tone === 'error' ? 'border-danger/50 text-danger' : 'border-line bg-bgInner text-textColor'
      }`}
    >
      {children}
    </p>
  ) : null;
