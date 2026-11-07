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
