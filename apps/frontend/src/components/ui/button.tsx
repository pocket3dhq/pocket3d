import { ButtonHTMLAttributes, FC } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accentText hover:opacity-90',
  secondary: 'border border-line bg-bgInner text-textColor hover:border-textMuted',
  danger: 'border border-danger/60 text-danger hover:bg-danger/10',
  ghost: 'text-textMuted hover:text-textColor',
};

export const Button: FC<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }> = ({
  variant = 'primary',
  loading,
  disabled,
  className = '',
  children,
  type = 'button',
  ...props
}) => (
  <button
    type={type}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    className={`inline-flex items-center justify-center gap-[8px] rounded-[10px] px-[14px] py-[9px] text-[14px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    {...props}
  >
    {loading ? 'Working…' : children}
  </button>
);
