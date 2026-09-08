'use client';
import { cn } from '@/lib/class-names';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/controls';
import { useDialogFocus } from '@/components/use-dialog-focus';
import { useI18n } from '@/components/i18n/i18n-provider';

export function Skeleton({
  className,
  radius = 4,
}: {
  className?: string;
  radius?: number;
}) {
  /* Pulsation d'opacité (co-skeleton), jamais de shimmer en dégradé :
     règle posée par globals.css et par le DS. */
  return (
    <span
      aria-hidden="true"
      className={cn('co-skeleton block bg-ink-100', className)}
      style={{ borderRadius: radius }}
    />
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  const fr = useI18n().locale === 'fr';
  return (
    <div
      role="status"
      aria-label={fr ? 'Chargement' : 'Loading'}
      className={cn('flex flex-col gap-4 rounded-card bg-card p-5', className)}
    >
      <div className="flex items-center gap-[13px]">
        <Skeleton className="size-[38px]" radius={12} />
        <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
          <Skeleton className="h-3 w-[62%]" />
          <Skeleton className="h-[10px] w-[38%]" />
        </div>
      </div>
      <div className="flex flex-col gap-[9px]">
        <Skeleton className="h-[11px] w-full" />
        <Skeleton className="h-[11px] w-[88%]" />
        <Skeleton className="h-[11px] w-[54%]" />
      </div>
    </div>
  );
}

export function useDelayedPending(pending: boolean, delay = 300) {
  const [show, setShow] = useState(false);
  const [previous, setPrevious] = useState(pending);
  if (pending !== previous) {
    setPrevious(pending);
    setShow(false);
  }
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [pending, delay]);
  return pending && show;
}

export function Drawer({
  open,
  width = 480,
  title,
  subtitle,
  icon,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  width?: 420 | 480;
  title: string;
  subtitle?: string;
  icon?: IconName;
  onClose?: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const fr = useI18n().locale === 'fr';
  const dialog = useDialogFocus<HTMLElement>(() => onClose?.(), false, open);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-ink-900/[.32]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        className="co-drawer-in fixed right-0 top-0 bottom-0 z-50 grid max-w-full grid-rows-[auto_1fr_auto] overflow-hidden rounded-l-shell bg-card shadow-overlay"
      >
        <div className="flex items-start gap-[14px] border-b border-ink-100 px-[22px] pb-[18px] pt-6">
          <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
            <span className="flex items-center gap-[11px] text-drawer">
              {icon && <Icon name={icon} size={19} className="text-ink-900" />}
              {title}
            </span>
            {subtitle && (
              <span className="text-label text-ink-600">{subtitle}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={fr ? 'Fermer' : 'Close'}
            className="co-kit-control co-hover grid size-9 !min-h-9 p-0 shrink-0 place-items-center rounded-full bg-panel text-ink-800"
          >
            <Icon name="close" size={19} />
          </button>
        </div>

        <div className="overflow-y-auto px-[22px] py-[18px]">{children}</div>

        {footer && (
          <div className="border-t border-ink-100 px-[22px] pb-6 pt-[18px]">
            {footer}
          </div>
        )}
      </aside>
    </>
  );
}
