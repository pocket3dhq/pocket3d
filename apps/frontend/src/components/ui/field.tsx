import { FC, InputHTMLAttributes, useId } from 'react';

export const Field: FC<
  InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }
> = ({ label, hint, className = '', ...props }) => {
  const id = useId();
  return (
    <div className="flex flex-col gap-[6px]">
      <label
        htmlFor={id}
        className="font-mono text-[12px] uppercase tracking-[0.04em] text-textMuted"
      >
        {label}
      </label>
      <input
        id={id}
        className={`w-full rounded-control border border-line bg-bgInner px-[12px] py-[10px] text-[15px] text-textColor outline-none transition placeholder:text-textMuted/60 focus:border-accent focus:ring-2 focus:ring-accent/25 ${className}`}
        {...props}
      />
      {!!hint && <p className="text-[12px] text-textMuted">{hint}</p>}
    </div>
  );
};
