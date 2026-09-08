/* ============================================================
   Career OS — components/ui/index.tsx
   PRIMITIVES DE RÉFÉRENCE. À copier telles quelles.

   Règle absolue : ces composants sont la SEULE façon de produire
   un bouton, un état de preuve, un panneau, une puce. Si un écran
   a besoin d'une variante, on l'ajoute ICI — on ne recopie pas les
   classes ailleurs.

   Les valeurs en px arbitraires (py-[11px], text-[13.5px]) sont
   VOULUES : elles viennent de mesures sur maquette validée.
   Ne pas les convertir vers l'échelle Tailwind par défaut.
   ============================================================ */

'use client';

import { useI18n } from '@/components/i18n/i18n-provider';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ReactNode } from 'react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ============================================================
   ICÔNE
   ============================================================ */

export type IconName = string; // nom Material Symbols, cf. DS v2 §09

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

/* ============================================================
   BOUTON — DS v2 §08
   Un seul variant="primary" par écran. Règle vérifiée en revue.
   ============================================================ */

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
  ghost: 'text-ink-600 text-btn font-medium px-2 py-[14px] hover:text-ink-900',
  destructive:
    'rounded-pill bg-clay-strong text-white text-[13.5px] font-semibold px-[22px] py-[13px] hover:bg-clay-hover',
  icon: 'rounded-full bg-card size-[42px] text-ink-900 hover:bg-panel',
  inline:
    'text-label font-semibold text-ink-900 underline decoration-ink-300 underline-offset-[3px] hover:decoration-ink-900',
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

/* ============================================================
   ÉTAT DE PREUVE — DS v2 §03
   Source unique de vérité couleur + icône + libellé.
   INTERDIT de passer une couleur en prop.
   ============================================================ */

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
        'inline-flex items-center rounded-pill shrink-0',
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

export function StatusDot({
  status,
  size = 8,
  className,
}: {
  status: ClaimStatus;
  size?: 7 | 8;
  className?: string;
}) {
  const s = statusMap[status];
  return (
    <span
      role="img"
      aria-label={s.label}
      className={cn('shrink-0 rounded-full', s.dot, className)}
      style={{ width: size, height: size }}
    />
  );
}

export function StatusIcon({
  status,
  size = 19,
  className,
}: {
  status: ClaimStatus;
  size?: 17 | 18 | 19 | 20;
  className?: string;
}) {
  const s = statusMap[status];
  return <Icon name={s.icon} size={size} className={cn(s.icon_c, className)} />;
}

/* ============================================================
   BADGE DE COMPTEUR — nav et onglets
   ============================================================ */

export function CountBadge({
  value,
  tone = 'neutral',
  className,
}: {
  value: number | string;
  /** inverted = sur un item de nav actif (fond ink-900) */
  tone?: 'neutral' | 'accent' | 'inverted' | 'green';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-panel text-ink-600',
    accent: 'bg-ink-900 text-white',
    inverted: 'bg-white text-ink-900',
    green: 'bg-green-tint text-green-text',
  } as const;
  return (
    <span
      className={cn(
        'shrink-0 rounded-pill px-2 py-[2px] text-caption font-semibold',
        tones[tone],
        className,
      )}
    >
      {value}
    </span>
  );
}

/* ============================================================
   TEXTE STRUCTURANT
   ============================================================ */

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

/* Référence de source — format canonique DS v2 §03.
   Toujours mono 11–12px ink-500, séparateur « · ». */
export function SourceRefLabel({
  label,
  locator,
  className,
}: {
  label: string;
  locator: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'min-w-0 truncate font-mono text-mono-sm text-ink-600',
        className,
      )}
    >
      {label} · {locator}
    </span>
  );
}

/* ============================================================
   PROGRESSION
   ============================================================ */

export function ProgressBar({
  value,
  tone = 'ink',
  height = 6,
  className,
}: {
  /** 0..1 */
  value: number;
  tone?: 'ink' | 'green' | 'amber' | 'clay' | 'indigo';
  /** 6 = progression de run · 5 = santé */
  height?: 5 | 6;
  className?: string;
}) {
  const tones = {
    ink: 'bg-ink-900',
    green: 'bg-green',
    amber: 'bg-amber',
    clay: 'bg-clay',
    indigo: 'bg-indigo',
  } as const;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('w-full overflow-hidden rounded bg-track', className)}
      style={{ height, borderRadius: height === 6 ? 4 : 3 }}
    >
      <div
        className={cn('co-progress h-full box-border', tones[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}

/* Stepper 3 segments — assistant de décision */
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

/* ============================================================
   CONTRÔLES
   ============================================================ */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  surface = 'on-panel',
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange?: (v: T) => void;
  /** on-panel = piste blanche · on-card = piste grise */
  surface?: 'on-panel' | 'on-card';
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center gap-[5px] rounded-pill p-[5px]',
        surface === 'on-panel' ? 'bg-card' : 'bg-panel',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(o.value)}
            className={cn(
              'co-hover rounded-pill px-[15px] py-[9px] text-label',
              active
                ? 'bg-ink-900 font-semibold text-white'
                : 'text-ink-600 hover:text-ink-900',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  title,
  description,
  className,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange?.(!checked)}
      className={cn('flex w-full items-center gap-[11px] text-left', className)}
    >
      <Icon
        name={checked ? 'toggle_on' : 'toggle_off'}
        size={20}
        className={checked ? 'text-green' : 'text-ink-300'}
      />
      <span className="flex min-w-0 flex-col gap-[2px]">
        <span
          className={cn(
            'text-label',
            checked ? 'font-semibold text-ink-800' : 'text-ink-700',
          )}
        >
          {title}
        </span>
        {description && (
          <span className="text-mono-sm leading-[1.4] text-ink-600">
            {description}
          </span>
        )}
      </span>
    </button>
  );
}

export function RadioCard({
  selected,
  title,
  description,
  meta,
  onSelect,
  className,
}: {
  selected: boolean;
  title: string;
  description?: string;
  meta?: ReactNode;
  onSelect?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'co-hover flex w-full flex-col gap-[9px] rounded-tile bg-card p-4 text-left',
        selected
          ? 'border-[1.5px] border-ink-900'
          : 'border border-ink-200 hover:border-ink-250',
        className,
      )}
    >
      <span className="flex items-center gap-[11px]">
        <Icon
          name={selected ? 'radio_button_checked' : 'radio_button_unchecked'}
          size={19}
          className={selected ? 'text-ink-900' : 'text-ink-300'}
        />
        <span
          className={cn(
            'flex-1 text-body-sm',
            selected ? 'font-semibold text-ink-900' : 'text-ink-700',
          )}
        >
          {title}
        </span>
        {meta}
      </span>
      {description && (
        <span className="pl-[30px] text-label leading-[1.55] text-ink-700">
          {description}
        </span>
      )}
    </button>
  );
}

/* ============================================================
   PASTILLE D'ICÔNE / MONOGRAMME
   3 tailles seulement : 44/r14, 38/r12, 32/r11
   ============================================================ */

export function IconTile({
  icon,
  tone = 'neutral',
  size = 38,
  className,
}: {
  icon: IconName;
  tone?: 'neutral' | 'green' | 'amber' | 'clay' | 'indigo' | 'card';
  size?: 32 | 38 | 44;
  className?: string;
}) {
  const tones = {
    neutral: 'bg-panel text-ink-600',
    card: 'bg-card text-ink-600',
    green: 'bg-green-tint text-green-text',
    amber: 'bg-amber-tint text-amber-text',
    clay: 'bg-clay-tint text-clay-strong',
    indigo: 'bg-indigo-tint text-indigo-text',
  } as const;
  const radius = size === 44 ? 14 : size === 38 ? 12 : 11;
  const glyph = size === 44 ? 23 : size === 38 ? 20 : 18;
  return (
    <span
      className={cn('grid shrink-0 place-items-center', tones[tone], className)}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <Icon name={icon} size={glyph as 18 | 20 | 23} />
    </span>
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

/* Avatars empilés — agents d'un run, contacts d'une entreprise */
export function AvatarStack({
  items,
  className,
}: {
  items: { value: string; tone?: Parameters<typeof Monogram>[0]['tone'] }[];
  className?: string;
}) {
  return (
    <div className={cn('flex items-center', className)}>
      {items.map((it, i) => (
        <Monogram
          key={i}
          value={it.value}
          tone={it.tone ?? 'neutral'}
          size={32}
          className={cn(
            'rounded-full border-2 border-white',
            i > 0 && '-ml-[9px]',
          )}
        />
      ))}
    </div>
  );
}
