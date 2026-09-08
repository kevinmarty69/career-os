import { cn } from '@/lib/class-names';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/controls';

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
