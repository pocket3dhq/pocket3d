import { FC } from 'react';

// Two-tone section heading: the statement, then a muted line that qualifies it
export const SectionHeading: FC<{
  title: string;
  subtitle?: string;
  className?: string;
}> = ({ title, subtitle, className = '' }) => (
  <h2
    className={`text-balance text-[28px] font-normal leading-[1.2] tracking-heading sm:text-[36px] ${className}`}
  >
    {title}
    {!!subtitle && (
      <>
        <br />
        <span className="text-textMuted">{subtitle}</span>
      </>
    )}
  </h2>
);
