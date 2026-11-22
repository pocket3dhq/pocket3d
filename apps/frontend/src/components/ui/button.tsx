import { ButtonHTMLAttributes, FC } from 'react';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';

// Monospace labels, 4px corners: one look for every action in the app
export const BUTTON_BASE =
  'inline-flex items-center justify-center gap-[8px] rounded-control px-[16px] py-[10px] font-mono text-[14px] tracking-[-0.02em] transition disabled:cursor-not-allowed disabled:opacity-50';

export const BUTTON_VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accentText hover:bg-accent/90',
  secondary: 'bg-line text-textColor hover:bg-line/70',
  outline:
    'border border-textColor/25 text-textColor hover:border-textColor/60',
  danger: 'border border-danger/50 text-danger hover:bg-danger/10',
  ghost: 'text-textMuted hover:text-textColor',
};

export const Button: FC<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    loading?: boolean;
  }
> = ({
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
    className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`}
    {...props}
  >
    {loading ? 'Working…' : children}
  </button>
);
