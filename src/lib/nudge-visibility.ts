/**
 * A shared browser can switch Firebase identities without unmounting
 * the entire React tree. Prevent previous-user reminder content from
 * being rendered under the newly signed-in account, even for one frame.
 */
export function isNudgeVisibleForAccount(
  currentUid: string | undefined,
  ownerUid: string | null,
  hasNudge: boolean,
  suspended: boolean,
  isDismissing: boolean,
): boolean {
  return Boolean(currentUid && ownerUid === currentUid && hasNudge && !suspended && !isDismissing);
}

/** Per-account local rate limits. Never allow a previous user's reminder
 * history to suppress or affect a newly signed-in person's nudges. */
export function nudgeHistoryKey(uid: string): string {
  return `blaze_nudge_history_v2:${encodeURIComponent(uid)}`;
}

/** A corrupt/blocked browser store must never crash reminder evaluation.
 * These records are used for local frequency limits, not personal content. */
export function parseNudgeHistory(raw: string | null): { shownAt: string }[] {
  if (!raw) return [];
  try {
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries)) return [];
    return entries.filter(
      (entry): entry is { shownAt: string } =>
        entry !== null && typeof entry === 'object' &&
        typeof (entry as { shownAt?: unknown }).shownAt === 'string' &&
        Number.isFinite(Date.parse((entry as { shownAt: string }).shownAt)),
    ).slice(-100);
  } catch {
    return [];
  }
}
