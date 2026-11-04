/**
 * Informational changelog announcements must not interrupt an action,
 * another dialog, or keyboard input. Used together with the first-visit
 * interaction cancellation in WhatsNewModal.
 */
export function isWhatsNewAutoOpenSafe(doc: Document): boolean {
  if (doc.visibilityState === 'hidden') return false;
  if (doc.querySelector('[role="dialog"][aria-modal="true"]')) return false;
  const active = doc.activeElement;
  if (active && active.matches(
    'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"]',
  )) return false;
  return true;
}
