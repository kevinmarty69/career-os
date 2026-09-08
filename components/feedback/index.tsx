/* ============================================================
   Career OS — components/feedback/index.tsx
   RÉTROACTION & CHARGEMENT DE RÉFÉRENCE. À copier tels quels.

   Source normative : « 01b - Design System - Primitives » §04 et §05.

   La règle la plus mal comprise du produit est ici :
   ┌────────────────────────────────────────────────────────────┐
   │ Attente de DONNÉES  → Skeleton, au-delà de 300 ms.         │
   │ Attente de TRAVAIL  → on montre le résultat qui arrive :   │
   │   étapes cochées, affirmations qui s'ajoutent, journal.     │
   │ Un Skeleton ou un spinner à la place d'un run est un       │
   │ ÉCHEC DE REVUE, pas un détail.                             │
   └────────────────────────────────────────────────────────────┘
   ============================================================ */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn, Icon, Button, type IconName } from '@/components/ui';
import { useDialogFocus } from '@/components/use-dialog-focus';
import { useI18n } from '@/components/i18n/i18n-provider';

/* ============================================================
   TOAST — bas-droite, 380px, 5s.
   Persistant si tone="error" ou si une action est offerte.
   Empilement de 3 maximum, la plus ancienne sort d'abord.
   Ne porte JAMAIS une information qu'on ne peut retrouver ailleurs.
   ============================================================ */

export type ToastTone = 'success' | 'neutral' | 'warn' | 'error';

export type Toast = {
  id: string;
  tone?: ToastTone;
  message: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
};

const TOAST_ICON: Record<ToastTone, IconName> = {
  success: 'check_circle',
  neutral: 'info',
  warn: 'rule',
  error: 'error',
};

const TOAST_ICON_COLOR: Record<ToastTone, string> = {
  success: 'text-success',
  neutral: 'text-ink-600',
  warn: 'text-amber',
  error: 'text-clay-strong',
};

const ToastCtx = createContext<{
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = crypto.randomUUID();
      // 3 maximum : la plus ancienne sort en premier
      setToasts((prev) => [...prev.slice(-2), { id, ...t }]);
      const persistent = t.tone === 'error' || Boolean(t.action);
      if (!persistent) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), 5000),
        );
      }
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    },
    [],
  );

  return (
    <ToastCtx.Provider value={{ toasts, push, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast doit être utilisé dans <ToastProvider>');
  return ctx;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-[380px] max-w-[calc(100vw-3rem)] flex-col gap-[11px]"
    >
      {toasts.map((t) => {
        const tone = t.tone ?? 'neutral';
        return (
          <div
            key={t.id}
            className={cn(
              'co-toast-in pointer-events-auto flex items-start gap-[14px] rounded-card bg-card px-[18px] py-4 shadow-overlay',
              tone === 'error' && 'border-l-[3px] border-clay',
            )}
          >
            <Icon
              name={TOAST_ICON[tone]}
              size={19}
              className={TOAST_ICON_COLOR[tone]}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="text-ui text-ink-800">{t.message}</span>
              {t.detail && (
                <span className="text-caption text-ink-600">{t.detail}</span>
              )}
            </div>
            {t.action ? (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  onDismiss(t.id);
                }}
                className="co-hover shrink-0 whitespace-nowrap text-label font-semibold text-ink-900"
              >
                {t.action.label}
              </button>
            ) : (
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => onDismiss(t.id)}
                className="co-hover shrink-0 text-ink-400 hover:text-ink-900"
              >
                <Icon name="close" size={17} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   TOOLTIP — encre pleine, rayon 12, délai 400ms, pas de flèche.
   INTERDITE pour une information nécessaire à la décision :
   celle-ci va dans le corps de l'écran.
   ============================================================ */

export function Tooltip({
  label,
  children,
  side = 'top',
}: {
  label: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => {
        timer.current = setTimeout(() => setOpen(true), 400);
      }}
      onMouseLeave={() => {
        clearTimeout(timer.current);
        setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={cn(
            'co-toast-in pointer-events-none absolute z-40 flex flex-col gap-[3px] whitespace-nowrap rounded-control bg-ink-900 px-[14px] py-[11px] text-label font-semibold text-white shadow-raised',
            side === 'top'
              ? 'bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2'
              : 'left-[calc(100%+8px)] top-1/2 -translate-y-1/2',
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}

/* ============================================================
   MENU CONTEXTUEL — largeur min 220.
   Le destructif est isolé sous un séparateur, toujours en dernier.
   ============================================================ */

export type MenuItem =
  | {
      kind?: 'item';
      icon?: IconName;
      label: string;
      shortcut?: string;
      destructive?: boolean;
      onSelect?: () => void;
    }
  | { kind: 'separator' };

export function Menu({
  items,
  open,
  onClose,
  className,
}: {
  items: MenuItem[];
  open: boolean;
  onClose?: () => void;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="menu"
      className={cn(
        'co-command-in absolute right-0 top-[calc(100%+6px)] z-40 flex min-w-[220px] flex-col gap-[2px] rounded-tile bg-card p-[6px] shadow-overlay',
        className,
      )}
    >
      {items.map((item, i) =>
        'kind' in item && item.kind === 'separator' ? (
          <span key={i} className="mx-2 my-1 h-px bg-ink-100" />
        ) : (
          <button
            key={i}
            role="menuitem"
            type="button"
            onClick={() => {
              (item as Extract<MenuItem, { label: string }>).onSelect?.();
              onClose?.();
            }}
            className={cn(
              'co-hover flex items-center gap-[11px] rounded-nav-sm px-3 py-[10px] text-left hover:bg-panel',
              (item as Extract<MenuItem, { label: string }>).destructive
                ? 'text-clay-strong'
                : 'text-ink-800',
            )}
          >
            {(item as Extract<MenuItem, { label: string }>).icon && (
              <Icon
                name={(item as Extract<MenuItem, { label: string }>).icon!}
                size={17}
                className={
                  (item as Extract<MenuItem, { label: string }>).destructive
                    ? 'text-clay-strong'
                    : 'text-ink-600'
                }
              />
            )}
            <span className="min-w-0 flex-1 text-ui">
              {(item as Extract<MenuItem, { label: string }>).label}
            </span>
            {(item as Extract<MenuItem, { label: string }>).shortcut && (
              <span className="shrink-0 font-mono text-mono-xs text-ink-600">
                {(item as Extract<MenuItem, { label: string }>).shortcut}
              </span>
            )}
          </button>
        ),
      )}
    </div>
  );
}

/* ============================================================
   SKELETON — ink-100, miroitement 1,4s.
   Reprend la FORME RÉELLE du contenu attendu. 3 lignes maximum.
   Jamais pour du travail d'agent.
   ============================================================ */

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

/** Squelette de transition de route — en-tête + 3 lignes, pas plus. */
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

/**
 * N'affiche le squelette qu'au-delà d'un délai — évite le clignotement
 * sur les réponses rapides. 300 ms par défaut, valeur du DS.
 */
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

/* ============================================================
   DIALOGUE DE CONFIRMATION
   Toute action destructive annonce QUI PERD QUOI, puis ce qui reste.
   Une alternative moins violente est proposée quand elle existe
   (suspendre plutôt que révoquer).
   ============================================================ */

export function ConfirmDialog({
  open,
  tone = 'neutral',
  icon,
  title,
  description,
  /** Ce qui se passe : liste explicite, perdu et conservé mélangés dans l'ordre d'importance */
  consequences,
  /** Voie de sortie moins violente */
  alternative,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  confirmDisabled = false,
  children,
}: {
  open: boolean;
  tone?: 'neutral' | 'destructive';
  icon?: IconName;
  title: string;
  description?: string;
  consequences?: { icon: IconName; tone: 'keep' | 'lose'; text: string }[];
  alternative?: {
    icon: IconName;
    title: string;
    detail: string;
    label: string;
    onSelect: () => void;
  };
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmDisabled?: boolean;
  children?: ReactNode;
}) {
  const fr = useI18n().locale === 'fr';
  const titleId = useId();
  const dialog = useDialogFocus<HTMLDivElement>(
    () => onCancel?.(),
    false,
    open,
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/[.32] p-6">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="co-decision-in flex w-[560px] max-w-full max-h-[90dvh] overflow-y-auto flex-col gap-[22px] rounded-shell bg-card p-[30px] shadow-overlay"
      >
        <div className="flex items-start gap-4">
          {icon && (
            <span
              className={cn(
                'grid place-items-center size-11 shrink-0 rounded-tile',
                tone === 'destructive' ? 'bg-clay-tint' : 'bg-panel',
              )}
            >
              <Icon
                name={icon}
                size={23}
                className={
                  tone === 'destructive' ? 'text-clay-strong' : 'text-ink-900'
                }
              />
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span id={titleId} className="text-hero">
              {title}
            </span>
            {description && (
              <span className="text-body-sm text-ink-700">{description}</span>
            )}
          </div>
        </div>

        {consequences && consequences.length > 0 && (
          <div className="flex flex-col gap-[14px] rounded-card bg-panel px-[22px] py-5">
            <span className="text-overline text-ink-600">
              {fr ? 'CE QUI SE PASSE' : 'WHAT HAPPENS'}
            </span>
            <div className="flex flex-col gap-3">
              {consequences.map((c, i) => (
                <div key={i} className="flex gap-3">
                  <Icon
                    name={c.icon}
                    size={18}
                    className={
                      c.tone === 'keep' ? 'text-success' : 'text-clay-strong'
                    }
                  />
                  <span className="min-w-0 flex-1 text-label text-ink-700">
                    {c.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {alternative && (
          <div className="flex items-center gap-[14px] rounded-card border border-ink-100 px-[18px] py-4">
            <Icon name={alternative.icon} size={19} className="text-ink-600" />
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="text-ui font-semibold text-ink-800">
                {alternative.title}
              </span>
              <span className="text-caption text-ink-600">
                {alternative.detail}
              </span>
            </div>
            <Button variant="inline" onClick={alternative.onSelect}>
              {alternative.label}
            </Button>
          </div>
        )}

        {children}

        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 text-mono text-ink-600">
            {tone === 'destructive'
              ? fr
                ? 'Action irréversible'
                : 'Irreversible action'
              : ''}
          </span>
          <Button variant="secondary-on-panel" onClick={onCancel}>
            {cancelLabel ?? (fr ? 'Annuler' : 'Cancel')}
          </Button>
          <Button
            variant={tone === 'destructive' ? 'destructive' : 'primary'}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   DRAWER LATÉRAL — 480px (contacts), 420px (notifications).
   Rayon 22px 0 0 22px. Entrée x 24→0, 240ms.
   État porté par l'URL (?contacts=1) pour être partageable.
   ============================================================ */

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

/* ============================================================
   ÉTAT OPTIMISTE
   Décision d'arbitrage, épinglage, bascule d'interrupteur :
   appliqués immédiatement, réconciliés en arrière-plan.
   En cas d'échec : retour à l'état antérieur + toast erreur « Réessayer ».
   Jamais de blocage d'écran pour ces trois gestes.
   ============================================================ */

export function useOptimistic<T>(
  initial: T,
  commit: (next: T) => Promise<unknown>,
) {
  const [value, setValue] = useState(initial);
  const { push } = useToast();

  const apply = useCallback(
    async function applyNext(next: T) {
      const previous = value;
      setValue(next);
      try {
        await commit(next);
      } catch {
        setValue(previous);
        push({
          tone: 'error',
          message: "La modification n'a pas été enregistrée.",
          action: { label: 'Réessayer', onClick: () => void applyNext(next) },
        });
      }
    },
    [value, commit, push],
  );

  return [value, apply] as const;
}
