/**
 * Firebase onAuthStateChanged can fire another event while the previous
 * callback is waiting for Firestore, custom claims or MFA status. Only the
 * most recent callback for the currently authenticated UID may update
 * React's account/role/MFA state.
 */
export function mayCommitAuthCallback(
  startedGeneration: number,
  newestGeneration: number,
  callbackUid: string | null,
  activeFirebaseUid: string | null,
  cancelled: boolean,
): boolean {
  return !cancelled && startedGeneration === newestGeneration &&
    callbackUid === activeFirebaseUid;
}
