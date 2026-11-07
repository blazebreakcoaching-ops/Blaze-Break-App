// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { CURRENT_CHANGELOG_VERSION, canScheduleWhatsNew, isWhatsNewAutoOpenSafe } from './whats-new-auto-open';

describe("What's New should never cover an active task", () => {
  afterEach(() => {
    document.body.innerHTML = '';
    (document.activeElement as HTMLElement | null)?.blur?.();
  });

  it('schedules the announcement only on an uninterrupted, unacknowledged visit', () => {
    expect(canScheduleWhatsNew(true, false, false, undefined)).toBe(true);
    expect(canScheduleWhatsNew(false, false, false, undefined)).toBe(false);
    expect(canScheduleWhatsNew(true, false, false, CURRENT_CHANGELOG_VERSION)).toBe(false);
  });

  it('does not restart the popup after a welcome, check-in or guide was active', () => {
    expect(canScheduleWhatsNew(true, true, false, undefined)).toBe(false);
    expect(canScheduleWhatsNew(true, false, true, undefined)).toBe(false);
  });

  it('allows a quiet visible page without another modal', () => {
    expect(isWhatsNewAutoOpenSafe(document)).toBe(true);
  });

  it('does not overlay a consent or onboarding modal', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);
    expect(isWhatsNewAutoOpenSafe(document)).toBe(false);
  });

  it('does not take focus from someone composing a message', () => {
    const input = document.createElement('textarea');
    document.body.appendChild(input);
    input.focus();
    expect(isWhatsNewAutoOpenSafe(document)).toBe(false);
  });

  it('does not interrupt custom rich-text boxes', () => {
    const input = document.createElement('div');
    input.setAttribute('contenteditable', 'true');
    input.tabIndex = 0; // jsdom and keyboard users both need an explicit focus target.
    document.body.appendChild(input);
    input.focus();
    expect(isWhatsNewAutoOpenSafe(document)).toBe(false);
  });
});
