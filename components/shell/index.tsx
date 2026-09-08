/* ============================================================
   Career OS — components/shell/index.tsx
   GABARIT D'APPLICATION DE RÉFÉRENCE. À copier tel quel.

   Ces composants encodent les mesures du DS v2 §07 :
   sidebar 212px · padding contenu 24/22/22/0 · gap 18px ·
   rails 340/372/452 · surfaces canvas → panel → card.

   Un écran ne recompose JAMAIS ce gabarit à la main.
   ============================================================ */

'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn, Icon, CountBadge, Overline, type IconName } from '@/components/ui';

/* ============================================================
   SHELL — app/(app)/layout.tsx
   ============================================================ */

export function AppShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen grid-cols-[212px_1fr] bg-canvas">
      {sidebar}
      {/* padding-left à 0 : la gouttière vient de la sidebar */}
      <main className="flex min-w-0 flex-col gap-[18px] py-6 pr-[22px] pb-[22px]">
        {children}
      </main>
    </div>
  );
}

/* ============================================================
   BARRE LATÉRALE — DS v2 §08
   ============================================================ */

export type NavItem = {
  href: string;
  icon: IconName;
  label: string;
  badge?: { value: number | string; tone?: 'neutral' | 'green' };
  /** true = section pas encore atteignable (onboarding) */
  unavailable?: boolean;
  /** true = un agent tourne sur cette section */
  busy?: boolean;
};

export function AppSidebar({
  nav,
  secondary,
  footer,
  user,
}: {
  nav: NavItem[];
  secondary?: { title: string; children: ReactNode };
  footer?: ReactNode;
  user: { name: string; monogram: string };
}) {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col px-4 py-6">
      {/* Logo — pastille 30/r9, wordmark 17/600, padding-bottom 30 */}
      <Link
        href="/home"
        className="flex items-center gap-[11px] px-[10px] pb-[30px] no-underline"
      >
        <span className="grid size-[30px] shrink-0 place-items-center rounded-logo bg-ink-900">
          <Icon name="layers" size={18} className="text-white" />
        </span>
        <span className="text-wordmark text-ink-900">careeros</span>
      </Link>

      {/* Nav principale — item 11px/12px, r12, gap 13, icône 21, label 14.5 */}
      <nav className="flex flex-col gap-1">
        {nav.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'co-hover flex items-center gap-[13px] rounded-nav px-3 py-[11px] no-underline',
                active ? 'bg-ink-900' : 'hover:bg-panel',
                item.unavailable && 'pointer-events-none opacity-45',
              )}
            >
              <Icon
                name={item.icon}
                size={21}
                className={active ? 'text-white' : 'text-ink-600'}
              />
              <span
                className={cn(
                  'text-nav',
                  active ? 'font-semibold text-white' : 'text-ink-700',
                )}
              >
                {item.label}
              </span>
              {item.busy && (
                <Icon
                  name="autorenew"
                  size={17}
                  spin
                  className={cn(
                    'ml-auto',
                    active ? 'text-white' : 'text-indigo',
                  )}
                />
              )}
              {item.badge && !item.busy && (
                <CountBadge
                  value={item.badge.value}
                  tone={
                    active
                      ? 'inverted'
                      : (item.badge.tone ?? 'neutral') === 'green'
                        ? 'green'
                        : 'neutral'
                  }
                  className="ml-auto"
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Groupe secondaire — margin-top 26, items 9/12 r11 */}
      {secondary && (
        <div className="mt-[26px] flex flex-col gap-[10px]">
          <Overline className="px-3">{secondary.title}</Overline>
          <div className="flex flex-col gap-[2px]">{secondary.children}</div>
        </div>
      )}

      {/* Pied — carte de santé puis compte */}
      <div className="mt-auto flex flex-col gap-[14px]">
        {footer}
        <button
          type="button"
          className="flex items-center gap-3 px-3 text-left"
        >
          <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-ink-900 text-[11px] font-semibold text-white">
            {user.monogram}
          </span>
          <span className="flex-1 truncate text-body-sm text-ink-700">
            {user.name}
          </span>
          <Icon name="unfold_more" size={18} className="text-ink-600" />
        </button>
      </div>
    </aside>
  );
}

/** Item de groupe secondaire (candidatures en cours, santé de la mémoire…) */
export function SidebarSubItem({
  href,
  label,
  meta,
  dot,
  icon,
  active = false,
}: {
  href?: string;
  label: string;
  meta?: ReactNode;
  dot?: string;
  icon?: IconName;
  active?: boolean;
}) {
  const Cmp = href ? Link : 'div';
  return (
    <Cmp
      // @ts-expect-error href conditionnel
      href={href}
      className={cn(
        'co-hover flex items-center gap-[11px] rounded-nav-sm px-3 py-[9px] no-underline',
        active && 'bg-panel',
      )}
    >
      {dot && <span className={cn('size-[7px] shrink-0 rounded-full', dot)} />}
      {icon && <Icon name={icon} size={17} className="text-ink-600" />}
      <span
        className={cn(
          'flex-1 truncate text-ui',
          active ? 'font-semibold text-ink-800' : 'text-ink-600',
        )}
      >
        {label}
      </span>
      {meta}
    </Cmp>
  );
}

/** Carte de santé en pied de sidebar — r16, p16 */
export function HealthCard({
  icon,
  iconClass,
  title,
  progress,
  note,
  tone = 'panel',
}: {
  icon: IconName;
  iconClass?: string;
  title: string;
  progress?: { value: number; tone: 'green' | 'amber' | 'clay' | 'ink' };
  note?: string;
  tone?: 'panel' | 'ink';
}) {
  const dark = tone === 'ink';
  return (
    <div
      className={cn(
        'flex flex-col gap-[9px] rounded-card p-4',
        dark ? 'bg-ink-900' : 'bg-panel',
      )}
    >
      <div className="flex items-center gap-[9px]">
        <Icon name={icon} size={18} className={iconClass ?? 'text-green'} />
        <span
          className={cn(
            'text-ui font-semibold',
            dark ? 'text-white' : 'text-ink-800',
          )}
        >
          {title}
        </span>
      </div>
      {progress && (
        <div className="h-[5px] w-full overflow-hidden rounded-[3px] bg-track">
          <div
            className={cn(
              'co-progress box-border h-full',
              progress.tone === 'green' && 'bg-green',
              progress.tone === 'amber' && 'bg-amber',
              progress.tone === 'clay' && 'bg-clay',
              progress.tone === 'ink' && 'bg-ink-900',
            )}
            style={{ width: `${progress.value * 100}%` }}
          />
        </div>
      )}
      {note && (
        <span
          className={cn(
            'text-caption leading-[1.45]',
            dark ? 'text-white/70' : 'text-ink-600',
          )}
        >
          {note}
        </span>
      )}
    </div>
  );
}

/* ============================================================
   EN-TÊTE DE CONTENU — eyebrow + titre à gauche, actions à droite.
   Les actions portent pt-[26px] pour aligner sur la ligne de base.
   ============================================================ */

export function ContentHeader({
  eyebrow,
  breadcrumb,
  title,
  titleSize = 'display',
  actions,
}: {
  eyebrow?: ReactNode;
  breadcrumb?: { label: string; href?: string }[];
  title: string;
  titleSize?: 'display' | 'h1';
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-start gap-6">
      <div className="flex min-w-0 flex-col gap-[10px]">
        {breadcrumb && (
          <div className="flex items-center gap-[10px] text-ui text-ink-600">
            {breadcrumb.map((c, i) => (
              <span key={i} className="flex items-center gap-[10px]">
                {i > 0 && (
                  <Icon
                    name="chevron_right"
                    size={17}
                    className="text-ink-300"
                  />
                )}
                <span
                  className={i === breadcrumb.length - 1 ? 'text-ink-700' : ''}
                >
                  {c.label}
                </span>
              </span>
            ))}
          </div>
        )}
        {eyebrow}
        <h1
          className={cn(
            'm-0 text-ink-900',
            titleSize === 'display' ? 'text-display' : 'text-h1',
          )}
        >
          {title}
        </h1>
      </div>
      {actions && (
        <div className="ml-auto flex shrink-0 items-center gap-[10px] pt-[26px]">
          {actions}
        </div>
      )}
    </header>
  );
}

/** Eyebrow standard : icône + libellé coloré au-dessus du titre */
export function HeaderEyebrow({
  icon,
  label,
  tone,
  spin = false,
}: {
  icon: IconName;
  label: string;
  tone: 'green' | 'amber' | 'clay' | 'indigo' | 'ink';
  spin?: boolean;
}) {
  const tones = {
    green: 'text-green',
    amber: 'text-amber-text',
    clay: 'text-clay-strong',
    indigo: 'text-indigo-text',
    ink: 'text-ink-600',
  } as const;
  return (
    <div className="flex items-center gap-[11px]">
      <Icon
        name={icon}
        size={19}
        spin={spin}
        className={tone === 'amber' ? 'text-amber' : tones[tone]}
      />
      <span className={cn('text-ui font-semibold', tones[tone])}>{label}</span>
    </div>
  );
}

/* ============================================================
   SURFACES
   ============================================================ */

/** N1 · panneau gris — regroupement thématique */
export function Panel({
  title,
  meta,
  padding = 24,
  className,
  children,
}: {
  title?: string;
  meta?: ReactNode;
  padding?: 22 | 24 | 26;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn('flex flex-col gap-4 rounded-panel bg-panel', className)}
      style={{ padding }}
    >
      {(title || meta) && (
        <div className="flex items-center gap-[14px]">
          {title && <h2 className="m-0 text-section text-ink-900">{title}</h2>}
          {meta && <div className="ml-auto shrink-0">{meta}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** N2 · carte blanche.
    bordered=true UNIQUEMENT si la carte est posée sur du blanc. */
export function Card({
  bordered = false,
  selected = false,
  radius = 20,
  padding = 22,
  className,
  children,
}: {
  bordered?: boolean;
  selected?: boolean;
  radius?: 14 | 16 | 18 | 20;
  padding?: 14 | 16 | 18 | 20 | 22 | 24;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-[14px] bg-card',
        bordered && !selected && 'border border-hairline',
        selected && 'border-[1.5px] border-ink-900 shadow-raised',
        className,
      )}
      style={{ borderRadius: radius, padding }}
    >
      {children}
    </div>
  );
}

/* ============================================================
   BARRE D'ACTION BASSE — carte blanche pleine largeur, r18, p18/22.
   RÈGLE R5 : le message se tronque, les boutons jamais.
   ============================================================ */

export function ActionBar({
  icon,
  iconClass,
  message,
  secondary,
  primary,
  highlighted = false,
}: {
  icon?: IconName;
  iconClass?: string;
  message: ReactNode;
  secondary?: ReactNode;
  primary?: ReactNode;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-card-lg bg-card px-[22px] py-[18px]',
        highlighted && 'border-[1.5px] border-ink-900 shadow-raised',
      )}
    >
      {icon && (
        <Icon
          name={icon}
          size={21}
          className={cn('shrink-0', iconClass ?? 'text-ink-600')}
        />
      )}
      <div className="min-w-0 flex-1 text-body-sm leading-[1.55] text-ink-700">
        {message}
      </div>
      {secondary}
      {primary}
    </div>
  );
}

/* ============================================================
   COLONNES DE CONTENU — les 5 seules dispositions (DS v2 §07)
   ============================================================ */

export function ContentGrid({
  layout,
  className,
  children,
}: {
  layout:
    | 'single'
    | 'halves'
    | 'thirds'
    | 'content-rail'
    | 'content-rail-sm'
    | 'content-rail-lg'
    | 'two-and-rail';
  className?: string;
  children: ReactNode;
}) {
  const layouts = {
    single: 'grid-cols-1',
    halves: 'grid-cols-2',
    thirds: 'grid-cols-3',
    'content-rail': 'grid-cols-[1fr_372px]',
    'content-rail-sm': 'grid-cols-[1fr_340px]',
    'content-rail-lg': 'grid-cols-[1fr_452px]',
    'two-and-rail': 'grid-cols-[1fr_1fr_340px]',
  } as const;
  return (
    <div className={cn('grid min-w-0 gap-[18px]', layouts[layout], className)}>
      {children}
    </div>
  );
}
