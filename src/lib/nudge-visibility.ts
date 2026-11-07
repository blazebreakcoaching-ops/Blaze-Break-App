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
