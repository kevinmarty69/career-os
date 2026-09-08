/* ============================================================
   Career OS — components/form/index.tsx
   PRIMITIVES DE SAISIE DE RÉFÉRENCE. À copier telles quelles.

   Source normative : « 01b - Design System - Primitives » §01 à §03.

   Règles portées par ce fichier, non négociables :
   — hauteur de contrôle 46px, rayon 12px (radius-control), padding X 16px ;
   — focus = bordure 1.5px ink-900, JAMAIS de halo ni de couleur d'accent ;
   — validation au blur, jamais à la frappe (voir useFieldValidation) ;
   — pas d'astérisque de champ requis : on marque « facultatif » à l'inverse ;
   — le message d'erreur dit QUOI FAIRE, pas ce qui est invalide.

   Segmented, Toggle et RadioCard vivent dans components/ui — ils servent
   aussi hors formulaire. Ne pas les redéfinir ici.
   ============================================================ */

'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn, Icon, Mono, type IconName } from '@/components/ui';

/* ============================================================
   FIELD — enveloppe commune : intitulé, aide, erreur
   Gaps verticaux imposés : 8px label→champ→aide.
   ============================================================ */

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

/* ============================================================
   BOÎTE DE CONTRÔLE — la coquille visuelle partagée
   ============================================================ */

const controlShell =
  'co-kit-field flex items-center gap-3 min-w-0 h-[46px] px-4 rounded-control border co-hover';

function controlTone({
  invalid,
  disabled,
  onDark,
}: {
  invalid?: boolean;
  disabled?: boolean;
  onDark?: boolean;
}) {
  if (onDark)
    return 'bg-white/[.07] border-white/[.16] text-white focus-within:border-white';
  if (disabled) return 'bg-panel border-ink-100 text-ink-400';
  if (invalid) return 'border-[1.5px] border-clay text-ink-900';
  return 'bg-card border-ink-200 text-ink-900 focus-within:border-[1.5px] focus-within:border-ink-900';
}

/* ============================================================
   TEXT INPUT
   ============================================================ */

export function TextInput({
  value,
  onChange,
  onBlur,
  placeholder,
  /** Préfixe court : « € », « @ ». Rendu en mono ink-600. */
  prefix,
  /** Icône de fin : check quand la valeur est validée, lock si verrouillé. */
  trailingIcon,
  invalid = false,
  disabled = false,
  onDark = false,
  /** true pour les montants, URL, quotas, identifiants */
  mono = false,
  id,
  className,
  ...rest
}: {
  value: string;
  onChange?: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  prefix?: string;
  trailingIcon?: IconName;
  invalid?: boolean;
  disabled?: boolean;
  onDark?: boolean;
  mono?: boolean;
  id?: string;
  className?: string;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'onBlur' | 'className'
>) {
  return (
    <div
      className={cn(
        controlShell,
        controlTone({ invalid, disabled, onDark }),
        className,
      )}
    >
      {prefix && (
        <span className="font-mono text-mono-lg text-ink-600 shrink-0">
          {prefix}
        </span>
      )}
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange?.(e.target.value)}
        onBlur={onBlur}
        className={cn(
          'flex-1 min-w-0 bg-transparent outline-none',
          mono ? 'font-mono text-mono-lg' : 'text-[14px]',
          'placeholder:text-ink-400',
          onDark && 'placeholder:text-white/40',
        )}
        {...rest}
      />
      {trailingIcon && (
        <Icon
          name={trailingIcon}
          size={18}
          className={trailingIcon === 'check' ? 'text-success' : 'text-ink-300'}
        />
      )}
    </div>
  );
}

/* ============================================================
   TEXTAREA — min 108px, redimensionnable en hauteur seulement
   ============================================================ */

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

/* Compteur de caractères — à passer dans Field meta */
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

/* ============================================================
   SELECT — ≥ 5 options. En dessous : Segmented ou RadioCard.
   ============================================================ */

export function Select<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  onDark = false,
  id,
  className,
}: {
  value: T;
  options: { value: T; label: string; meta?: string }[];
  onChange?: (v: T) => void;
  disabled?: boolean;
  onDark?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        controlShell,
        controlTone({ disabled, onDark }),
        'relative',
        className,
      )}
    >
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value as T)}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {o.meta ? ` — ${o.meta}` : ''}
          </option>
        ))}
      </select>
      <span className="flex-1 min-w-0 truncate text-[14px] pointer-events-none">
        {options.find((o) => o.value === value)?.label}
      </span>
      <Icon
        name="unfold_more"
        size={19}
        className={cn(
          'pointer-events-none',
          onDark ? 'text-white/60' : 'text-ink-600',
        )}
      />
    </div>
  );
}

/* ============================================================
   CHECKBOX — sélection multiple dans une énumération
   20px, rayon 6, coché = ink-900 + check blanc 14px
   ============================================================ */

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

/* ============================================================
   SEARCH FIELD — pilule 42px.
   Le placeholder dit OÙ l'on cherche : « Chercher dans mes preuves… ».
   Jamais « Rechercher… » seul.
   ============================================================ */

export function SearchField({
  value,
  onChange,
  placeholder = 'Chercher dans mes preuves…',
  shortcut = '⌘K',
  className,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  shortcut?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'co-kit-field flex items-center gap-[13px] h-[42px] min-w-0 rounded-pill bg-card pl-[18px] pr-2',
        className,
      )}
    >
      <Icon name="search" size={19} className="text-ink-600" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        className="flex-1 min-w-0 bg-transparent text-[14px] outline-none placeholder:text-ink-400"
      />
      {shortcut && (
        <span className="shrink-0 rounded-[6px] bg-panel px-2 py-[5px] font-mono text-mono-sm text-ink-600">
          {shortcut}
        </span>
      )}
    </div>
  );
}

/* ============================================================
   URL FIELD — pilule 58px, bouton rond de soumission.
   Un collage de plus de 400 caractères doit basculer l'appelant
   vers un TextArea (onPasteLong) : les agents traitent aussi bien
   un copier-coller qu'une URL.
   ============================================================ */

export function UrlField({
  value,
  onChange,
  onSubmit,
  onPasteLong,
  placeholder = 'https://…',
  invalid = false,
  pending = false,
  className,
}: {
  value: string;
  onChange?: (v: string) => void;
  onSubmit?: () => void;
  onPasteLong?: (text: string) => void;
  placeholder?: string;
  invalid?: boolean;
  pending?: boolean;
  className?: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
      className={cn(
        'co-kit-field flex items-center gap-[14px] min-w-0 rounded-pill bg-card py-[7px] pl-5 pr-2',
        invalid
          ? 'border-[1.5px] border-clay'
          : 'border-[1.5px] border-ink-200',
        className,
      )}
    >
      <Icon name="link" size={20} className="text-ink-600" />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text');
          if (text.length > 400 && onPasteLong) {
            e.preventDefault();
            onPasteLong(text);
          }
        }}
        className="flex-1 min-w-0 bg-transparent text-[14.5px] outline-none placeholder:text-ink-400"
      />
      <button
        type="submit"
        disabled={pending}
        aria-label="Analyser cette offre"
        className="co-kit-control co-hover grid place-items-center size-[42px] shrink-0 rounded-full bg-ink-900 text-white disabled:opacity-60"
      >
        <Icon
          name={pending ? 'autorenew' : 'arrow_forward'}
          size={20}
          spin={pending}
        />
      </button>
    </form>
  );
}

/* ============================================================
   DROPZONE — 3 états : repos, survol de dépôt, envoi en cours
   ============================================================ */

export function Dropzone({
  title = 'Déposez un CV, une reco, un post-mortem',
  hint = 'PDF, DOCX, MD, TXT · 20 Mo max',
  dragging = false,
  onFiles,
  className,
}: {
  title?: string;
  hint?: string;
  dragging?: boolean;
  onFiles?: (files: FileList) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) onFiles?.(e.dataTransfer.files);
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-[9px] rounded-card px-6 py-[22px] text-center co-hover',
        dragging
          ? 'border-[1.5px] border-ink-900 bg-card'
          : 'border border-dashed border-ink-250 hover:border-ink-900 hover:bg-panel',
        className,
      )}
    >
      <input
        id={id}
        type="file"
        multiple
        className="sr-only"
        onChange={(e) => e.target.files && onFiles?.(e.target.files)}
      />
      <Icon
        name="upload_file"
        size={23}
        className={dragging ? 'text-ink-900' : 'text-ink-400'}
      />
      <span className="text-ui font-semibold text-ink-800">
        {dragging ? 'Relâchez pour importer' : title}
      </span>
      {!dragging && <span className="text-caption text-ink-600">{hint}</span>}
    </label>
  );
}

/* Ligne de fichier en cours d'envoi */
export function UploadRow({
  name,
  progress,
  icon = 'picture_as_pdf',
  onCancel,
}: {
  name: string;
  progress: number;
  icon?: IconName;
  onCancel?: () => void;
}) {
  return (
    <div className="flex items-center gap-[14px] rounded-card bg-card px-[18px] py-4">
      <span className="grid place-items-center size-[38px] shrink-0 rounded-tile bg-clay-tint">
        <Icon name={icon} size={20} className="text-clay-text" />
      </span>
      <div className="flex flex-1 min-w-0 flex-col gap-[6px]">
        <span className="truncate text-ui font-semibold text-ink-800">
          {name}
        </span>
        <span className="h-[5px] overflow-hidden rounded-[3px] bg-ink-100">
          <span
            className="block h-full rounded-[3px] bg-ink-900 co-progress"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </span>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Annuler cet envoi"
        className="co-hover shrink-0 text-ink-600 hover:text-ink-900"
      >
        <Icon name="close" size={19} />
      </button>
    </div>
  );
}

/* ============================================================
   TYPED CONFIRM — actions irréversibles seulement
   Le mot est toujours en français, majuscules, sans accent.
   ============================================================ */

export function TypedConfirm({
  word,
  value,
  onChange,
  onDark = true,
  className,
}: {
  word: string;
  value: string;
  onChange?: (v: string) => void;
  onDark?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-[9px]', className)}>
      <label
        htmlFor={id}
        className={cn(
          'text-caption',
          onDark ? 'text-white/60' : 'text-ink-600',
        )}
      >
        Tapez{' '}
        <span
          className={cn('font-mono', onDark ? 'text-white' : 'text-ink-900')}
        >
          {word}
        </span>{' '}
        pour confirmer
      </label>
      <input
        id={id}
        type="text"
        value={value}
        autoComplete="off"
        onChange={(e) => onChange?.(e.target.value)}
        className={cn(
          'rounded-control px-[15px] py-[13px] font-mono text-mono-lg outline-none',
          onDark
            ? 'border border-white/[.16] bg-white/[.07] text-white focus:border-white'
            : 'border border-ink-200 bg-card text-ink-900 focus:border-[1.5px] focus:border-ink-900',
        )}
      />
    </div>
  );
}

/** À utiliser pour activer le bouton destructif. Comparaison exacte. */
export function isConfirmed(word: string, value: string) {
  return value.trim() === word;
}

/* ============================================================
   VALIDATION — au blur, jamais à la frappe.
   Le message rendu doit dire quoi faire.
   ============================================================ */

export function useFieldValidation<T>(
  initial: T,
  validate: (v: T) => string | null,
) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  return {
    value,
    error: touched ? error : null,
    /** onChange : n'évalue rien, efface seulement une erreur affichée */
    set(v: T) {
      setValue(v);
      if (error) setError(null);
    },
    /** onBlur : c'est ici, et seulement ici, qu'on valide */
    blur() {
      setTouched(true);
      setError(validate(value));
    },
    /** Erreur renvoyée par le serveur, rattachée au champ */
    setServerError(message: string) {
      setTouched(true);
      setError(message);
    },
    reset() {
      setValue(initial);
      setError(null);
      setTouched(false);
    },
  };
}
