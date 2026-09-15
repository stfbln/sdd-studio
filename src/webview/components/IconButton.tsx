import type { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  label: string;
  /** Renders the label next to the icon instead of only as a tooltip. */
  showLabel?: boolean;
  variant?: 'ghost' | 'primary' | 'secondary' | 'danger';
}

export function IconButton({ icon, label, showLabel, variant = 'ghost', className = '', ...rest }: Props) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`btn btn-${variant} ${showLabel ? 'btn-labelled' : 'btn-icon'} ${className}`}
      {...rest}
    >
      <span className={`codicon codicon-${icon}`} aria-hidden="true" />
      {showLabel && <span>{label}</span>}
    </button>
  );
}
