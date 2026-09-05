'use client';

import { useEffect, useRef } from 'react';

const focusableSelector =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function useDialogFocus<T extends HTMLElement>(
  onClose: () => void,
  closeDisabled = false,
) {
  const dialog = useRef<T>(null);
  const close = useRef(onClose);
  const disabled = useRef(closeDisabled);

  useEffect(() => {
    close.current = onClose;
    disabled.current = closeDisabled;
  }, [closeDisabled, onClose]);

  useEffect(() => {
    const node = dialog.current;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    const focusable = () =>
      node ? [...node.querySelectorAll<HTMLElement>(focusableSelector)] : [];
    (
      node?.querySelector<HTMLElement>('[data-dialog-initial-focus]') ??
      focusable()[0]
    )?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !disabled.current) {
        event.preventDefault();
        close.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !node?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !node?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      requestAnimationFrame(() => previous?.focus());
    };
  }, []);

  return dialog;
}
