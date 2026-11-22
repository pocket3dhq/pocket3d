import { FC, InputHTMLAttributes, useId } from 'react';

export const Field: FC<InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }> = ({
  label,
  hint,
  className = '',
  ...props
}) => {
  const id = useId();
  return (
    <div className="flex flex-col gap-[6px]">
      <label htmlFor={id} className="text-[13px] font-medium text-textMuted">
        {label}
      </label>
      <input
        id={id}
        className={`w-full rounded-[10px] border border-line bg-bgInner px-[12px] py-[10px] text-[15px] text-textColor outline-none placeholder:text-textMuted/60 focus:border-accent ${className}`}
        {...props}
      />
      {!!hint && <p className="text-[12px] text-textMuted">{hint}</p>}
    </div>
  );
};
