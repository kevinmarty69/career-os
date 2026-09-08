'use client';
import { useI18n } from '@/components/i18n/i18n-provider';
import { cn } from '@/lib/class-names';
import type { ReactNode } from 'react';

export type IconName = string;

export function Icon({
  name,
  size = 19,
  className,
  spin = false,
}: {
  name: IconName;
  /** 21 nav · 20 bouton icône · 19 en-tête · 18 liste · 17 dense · 15 inline */
  size?: 15 | 17 | 18 | 19 | 20 | 21 | 23 | 28 | 30;
  className?: string;
  spin?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'material-symbols-rounded shrink-0',
        spin && 'co-spin',
        className,
      )}
      style={{ fontSize: size }}
    >
      {name}
    </span>
  );
}

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'secondary-on-panel'
  | 'ghost'
  | 'destructive'
  | 'icon'
  | 'inline';

const buttonBase =
  'co-kit-control co-hover inline-flex items-center justify-center gap-[9px] shrink-0 whitespace-nowrap ' +
  'disabled:opacity-45 disabled:pointer-events-none';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'rounded-pill bg-ink-900 text-white text-btn px-[22px] py-[14px] hover:bg-ink-800',
  secondary:
    'rounded-pill bg-card text-ink-700 text-[13.5px] font-medium px-[20px] py-[13px] hover:bg-panel',
  'secondary-on-panel':
    'rounded-pill bg-panel text-ink-700 text-[13.5px] font-medium px-[20px] py-[13px] hover:bg-canvas',
  ghost:
    'rounded-pill bg-transparent hover:bg-transparent text-ink-600 text-btn font-medium px-2 py-[14px] hover:text-ink-900',
  destructive:
    'rounded-pill bg-clay-strong text-white text-[13.5px] font-semibold px-[22px] py-[13px] hover:bg-clay-hover',
  icon: 'rounded-full bg-card size-[42px] text-ink-900 hover:bg-panel',
  inline:
    'bg-transparent hover:bg-transparent px-0 py-0 text-label font-semibold text-ink-900 underline decoration-ink-300 underline-offset-[3px] hover:decoration-ink-900',
};

export function Button({
  variant = 'secondary',
  icon,
  /** right = progression (arrow_forward) · left = nature de l'action */
  iconPosition = 'right',
  children,
  className,
  ...props
}: {
  variant?: ButtonVariant;
  icon?: IconName;
  iconPosition?: 'left' | 'right';
  children?: ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const iconSize = variant === 'icon' ? 20 : 18;
  return (
    <button
      type="button"
      className={cn(buttonBase, buttonVariants[variant], className)}
      {...props}
    >
      {icon && iconPosition === 'left' && <Icon name={icon} size={iconSize} />}
      {children}
      {icon && iconPosition === 'right' && <Icon name={icon} size={iconSize} />}
    </button>
  );
}

export type ClaimStatus =
  'verified' | 'declared' | 'conflicted' | 'unsourced' | 'stale' | 'gap_owned';

const statusMap: Record<
  ClaimStatus,
  { label: string; icon: IconName; dot: string; chip: string; icon_c: string }
> = {
  verified: {
    label: 'Vérifiée',
    icon: 'verified',
    dot: 'bg-green',
    chip: 'bg-green-tint text-green-text',
    icon_c: 'text-green',
  },
  declared: {
    label: 'Déclarée',
    icon: 'rule',
    dot: 'bg-amber',
    chip: 'bg-amber-tint text-amber-text',
    icon_c: 'text-amber',
  },
  conflicted: {
    label: 'Conflit',
    icon: 'rule',
    dot: 'bg-amber',
    chip: 'bg-amber-tint text-amber-text',
    icon_c: 'text-amber',
  },
  unsourced: {
    label: 'Sans source',
    icon: 'link_off',
    dot: 'bg-clay',
    chip: 'bg-clay-tint text-clay-text',
    icon_c: 'text-clay',
  },
  stale: {
    label: 'Périmée',
    icon: 'schedule',
    dot: 'bg-ink-500',
    chip: 'bg-panel text-ink-600',
    icon_c: 'text-ink-600',
  },
  gap_owned: {
    label: 'Écart assumé',
    icon: 'remove_circle_outline',
    dot: 'bg-ink-500',
    chip: 'bg-panel text-ink-600',
    icon_c: 'text-ink-600',
  },
};

export function StatusChip({
  status,
  size = 'status',
  withIcon = false,
  label,
  className,
}: {
  status: ClaimStatus;
  /** status 11.5/600 · banner 12.5/600 + icône · meta 10.5/600 */
  size?: 'status' | 'banner' | 'meta';
  withIcon?: boolean;
  /** surcharge du libellé (ex. « Le chiffre dépasse la preuve ») */
  label?: string;
  className?: string;
}) {
  const fr = useI18n().locale === 'fr';
  const base = statusMap[status];
  const s = {
    ...base,
    label: fr
      ? base.label
      : (
          {
            verified: 'Verified',
            declared: 'Declared by you',
            conflicted: 'Conflict',
            unsourced: 'No source',
            stale: 'Outdated',
            gap_owned: 'Acknowledged gap',
          } as const
        )[status],
  };
  const sizes = {
    status: 'text-caption font-semibold px-[11px] py-[5px]',
    banner: 'text-label font-semibold px-[14px] py-2 gap-[9px]',
    meta: 'text-[10.5px] font-semibold px-[10px] py-1',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-pill shrink-0',
        s.chip,
        sizes[size],
        className,
      )}
    >
      {(withIcon || size === 'banner') && <Icon name={s.icon} size={17} />}
      {label ?? s.label}
    </span>
  );
}

export function Overline({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('text-overline uppercase text-ink-600', className)}>
      {children}
    </span>
  );
}

export function Mono({
  children,
  size = 12,
  className,
}: {
  children: ReactNode;
  size?: 10.5 | 11 | 12 | 14;
  className?: string;
}) {
  return (
    <span
      className={cn('font-mono text-ink-600', className)}
      style={{ fontSize: size }}
    >
      {children}
    </span>
  );
}

export function StepDots({
  total,
  current,
  className,
}: {
  total: number;
  /** index 0-based de l'étape en cours */
  current: number;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'co-hover h-1 w-[34px] rounded-sm',
            i < current && 'bg-green',
            i === current && 'bg-ink-900',
            i > current && 'bg-ink-200',
          )}
        />
      ))}
    </div>
  );
}

export function Monogram({
  value,
  tone = 'neutral',
  size = 32,
  className,
}: {
  value: string;
  tone?: 'neutral' | 'green' | 'amber' | 'clay' | 'indigo' | 'ink' | 'card';
  size?: 26 | 30 | 32 | 38 | 42 | 52;
  className?: string;
}) {
  const tones = {
    neutral: 'bg-panel text-ink-600',
    card: 'bg-card text-ink-600',
    green: 'bg-green-tint text-green-strong',
    amber: 'bg-amber-tint text-amber-text',
    clay: 'bg-clay-tint text-clay-strong',
    indigo: 'bg-indigo-tint text-indigo-deep',
    ink: 'bg-ink-900 text-white',
  } as const;
  const radius =
    size >= 52 ? 16 : size >= 42 ? 14 : size >= 38 ? 13 : size >= 30 ? 11 : 9;
  const font = size >= 52 ? 15 : size >= 42 ? 13 : size >= 32 ? 12 : 10.5;
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center font-semibold',
        tones[tone],
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: font,
      }}
    >
      {value}
    </span>
  );
}
