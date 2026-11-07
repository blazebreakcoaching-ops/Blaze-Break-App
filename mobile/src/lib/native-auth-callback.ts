/** Keep all asynchronous native authentication results bound to one UID. */
export function mayCommitNativeAuthCallback(
  requestGeneration: number,
  latestGeneration: number,
  requestedUid: string | null,
  liveUid: string | null,
  active: boolean,
): boolean {
  return active && requestGeneration === latestGeneration &&
    requestedUid === liveUid;
}
