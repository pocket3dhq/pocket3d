import { FC, ReactNode } from 'react';

// A square panel drawn with 1px lines, a monospace title and a muted line under it
export const Card: FC<{
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}> = ({ title, description, children, className = '' }) => (
  <section
    className={`flex flex-col gap-[16px] border border-line bg-bg p-[24px] ${className}`}
  >
    {(title || description) && (
      <div className="flex flex-col gap-[6px]">
        {!!title && (
          <h2 className="font-mono text-[18px] tracking-[-0.02em]">{title}</h2>
        )}
        {!!description && (
          <div className="text-[15px] leading-relaxed text-textMuted">
            {description}
          </div>
        )}
      </div>
    )}
    {children}
  </section>
);
