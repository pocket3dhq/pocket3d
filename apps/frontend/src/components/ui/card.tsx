import { FC, ReactNode } from 'react';

export const Card: FC<{ title?: string; description?: ReactNode; children: ReactNode; className?: string }> = ({
  title,
  description,
  children,
  className = '',
}) => (
  <section className={`flex flex-col gap-[16px] rounded-[14px] border border-line bg-bgInner/60 p-[20px] ${className}`}>
    {(title || description) && (
      <div className="flex flex-col gap-[4px]">
        {!!title && <h2 className="text-[16px] font-semibold">{title}</h2>}
        {!!description && <div className="text-[14px] text-textMuted">{description}</div>}
      </div>
    )}
    {children}
  </section>
);
