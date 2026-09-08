'use client';
import { cn } from '@/lib/class-names';
import { type ReactNode } from 'react';
import { Icon, Mono } from '@/components/ui/controls';

export function Field({
  label,
  /** Affiché à droite de l'intitulé. On marque « facultatif », jamais requis. */
  optional = false,
  hint,
  error,
  /** Compteur ou unité aligné à droite sous le champ */
  meta,
  htmlFor,
  children,
  className,
}: {
  label?: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  meta?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2 min-w-0', className)}>
      {label && (
        <div className="flex items-baseline gap-2">
          <label
            htmlFor={htmlFor}
            className="text-label font-semibold text-ink-800"
          >
            {label}
          </label>
          {optional && (
            <span className="text-caption text-ink-600">facultatif</span>
          )}
        </div>
      )}

      {children}

      {(hint || error || meta) && (
        <div className="flex items-start gap-3">
          {error ? (
            <span className="flex items-start gap-2 min-w-0 flex-1">
              <Icon name="error" size={17} className="text-clay-strong mt-px" />
              <span className="text-caption text-clay-strong">{error}</span>
            </span>
          ) : (
            hint && (
              <span className="text-caption text-ink-600 min-w-0 flex-1">
                {hint}
              </span>
            )
          )}
          {meta && <span className="shrink-0">{meta}</span>}
        </div>
      )}
    </div>
  );
}

export function TextArea({
  value,
  onChange,
  onBlur,
  placeholder,
  invalid = false,
  disabled = false,
  rows = 4,
  maxLength,
  id,
  className,
}: {
  value: string;
  onChange?: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  rows?: number;
  maxLength?: number;
  id?: string;
  className?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      rows={rows}
      maxLength={maxLength}
      disabled={disabled}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange?.(e.target.value)}
      onBlur={onBlur}
      className={cn(
        'co-kit-textarea min-h-[108px] w-full resize-y px-4 py-[14px] rounded-control border outline-none',
        'text-[14px] leading-[1.65] placeholder:text-ink-400',
        'co-hover',
        disabled
          ? 'bg-panel border-ink-100 text-ink-400'
          : invalid
            ? 'border-[1.5px] border-clay text-ink-900'
            : 'bg-card border-ink-200 text-ink-900 focus:border-[1.5px] focus:border-ink-900',
        className,
      )}
    />
  );
}

export function CharCount({ value, max }: { value: number; max: number }) {
  return (
    <Mono
      size={11}
      className={value > max ? 'text-clay-strong' : 'text-ink-600'}
    >
      {value.toLocaleString('fr-FR')} / {max.toLocaleString('fr-FR')}
    </Mono>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  trailing,
  className,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'relative flex items-center gap-3 min-w-0',
        disabled ? 'opacity-55' : 'cursor-pointer',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="co-kit-checkbox absolute left-0 z-10 !size-5 !min-h-0 m-0 cursor-pointer opacity-0"
      />
      <span
        aria-hidden="true"
        className={cn(
          'grid place-items-center size-5 rounded-[6px] shrink-0 border-[1.5px] co-hover',
          checked
            ? 'bg-ink-900 border-ink-900'
            : disabled
              ? 'bg-ink-100 border-ink-200'
              : 'bg-transparent border-ink-300',
        )}
      >
        {checked && <Icon name="check" size={15} className="text-white" />}
      </span>
      <span className="flex-1 min-w-0 text-ui text-ink-800">{label}</span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </label>
  );
}
