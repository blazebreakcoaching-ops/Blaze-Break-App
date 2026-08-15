import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Focus management for modals/dialogs, per the WAI-ARIA dialog pattern:
 * - Moves focus into the dialog when it opens (first focusable element,
 *   falling back to the dialog container itself).
 * - Traps Tab/Shift+Tab within the dialog while it's open, so keyboard
 *   focus never silently escapes into the page behind it.
 * - Returns focus to whatever triggered the dialog when it closes.
 *
 * Usage: attach the returned ref to the dialog's outer container and give
 * that container `tabIndex={-1}` so it's a valid focus target even if it
 * has no focusable children yet when it first opens.
 */
export function useFocusTrap(isOpen: boolean) {
  const containerRef = useRef<HTMLElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    if (!container) return;

    const getFocusable = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => el.offsetParent !== null); // visible only

    // Defer one tick so AnimatePresence/exit-animation content has mounted.
    const focusTimer = window.setTimeout(() => {
      const focusable = getFocusable();
      (focusable[0] || container).focus();
    }, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [isOpen]);

  return containerRef;
}
