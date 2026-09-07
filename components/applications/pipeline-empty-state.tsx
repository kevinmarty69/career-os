'use client';

import styles from '@/components/applications/applications-page.module.css';
import { Icon } from '@/components/ui/primitives';

export function EmptyState({
  title,
  copy,
  icon,
  action,
  onAction,
}: {
  title: string;
  copy: string;
  icon: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className={styles.empty}>
      <span>
        <Icon>{icon}</Icon>
      </span>
      <div>
        <h3>{title}</h3>
        <p>{copy}</p>
      </div>
      {action && onAction ? (
        <button className="co-button quiet" onClick={onAction} type="button">
          {action}
        </button>
      ) : null}
    </div>
  );
}

export function LoadingRows({ label }: { label: string }) {
  return (
    <div
      aria-label={label}
      aria-live="polite"
      className={styles.loading}
      role="status"
    >
      <span />
      <span />
      <span />
    </div>
  );
}
