'use client';

import { type ReactNode } from 'react';

export type Tone = 'ok' | 'warn' | 'crit' | 'accent' | 'muted';

export function Icon({ children }: { children: string }) {
  return (
    <span className="material-symbols-rounded co-icon" aria-hidden="true">
      {children}
    </span>
  );
}

export function Badge({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return <span className={`co-badge ${tone}`}>{children}</span>;
}

export function Button({
  children,
  quiet = false,
  danger = false,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  quiet?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={`co-button${quiet ? ' quiet' : ''}${danger ? ' danger' : ''}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function PageHeader({
  eyebrow,
  title,
  copy,
  actions,
}: {
  eyebrow?: string;
  title: string;
  copy?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="co-page-header">
      <div>
        {eyebrow ? <p>{eyebrow}</p> : null}
        <h1>{title}</h1>
        {copy ? <span>{copy}</span> : null}
      </div>
      {actions ? <div className="co-actions">{actions}</div> : null}
    </header>
  );
}

export function Stat({
  icon,
  value,
  label,
  tone = 'muted',
}: {
  icon: string;
  value: ReactNode;
  label: string;
  tone?: Tone;
}) {
  return (
    <article className="co-stat">
      <span className={tone}>
        <Icon>{icon}</Icon>
      </span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </article>
  );
}

export function Company({
  name,
  initials,
  sub,
}: {
  name: string;
  initials: string;
  sub: string;
}) {
  return (
    <span className="co-company">
      <i>{initials}</i>
      <span>
        <strong>{name}</strong>
        <small>{sub}</small>
      </span>
    </span>
  );
}

export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="co-table">
      <div className="co-table-head">
        {headers.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {rows.map((row, i) => (
        <div className="co-table-row" key={i}>
          {row.map((cell, j) => (
            <span key={j}>{cell}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ClaimRow({
  tone = 'ok',
  label,
  text,
  source,
}: {
  tone?: Tone;
  label: string;
  text: string;
  source?: string;
}) {
  return (
    <article className="co-claim">
      <div>
        <Badge tone={tone}>{label}</Badge>
        {source ? <small>{source}</small> : null}
      </div>
      <strong>{text}</strong>
    </article>
  );
}
