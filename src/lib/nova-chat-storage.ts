import { auth } from './firebase';

// Phase 5N (directive §1/§2) - every Nova-identity-adjacent localStorage
// key must be namespaced by the CURRENT Firebase identity (real or
// anonymous), never a bare global key shared by whoever happens to be
// signed in. Before this, switching identities on the same device/
// browser without a full page reload - anonymous -> real, real account A
// -> real account B, or real account A -> a fresh anonymous visitor -
// left whichever identity's data was already in localStorage (and, worse,
// already loaded into React state) fully readable by the next identity:
// a genuine cross-account privacy leak, not merely a stale-cache issue.
// Phase 5M's own fix (allowing these keys through src/main.tsx's "Secure
// Account mode" guard for a real account) was necessary and correct on
// its own terms - it stopped a real account's OWN conversation being
// silently discarded - but without this scoping, it also made a leak
// between two DIFFERENT real accounts possible on a shared browser,
// where it previously could not happen at all (the old guard blocked the
// keys outright for every real account). This file is the fix: every
// caller computes the actual storage key through here instead of using
// the bare base name directly.
//
// '__pending__' is a sentinel for the brief window before Firebase Auth
// has resolved ANY identity yet (never a real Firebase uid - those are
// alphanumeric, never contain this literal string), so a read/write in
// that window can never collide with a real identity's own data, and a
// later load under the real identity (see the "identity changed" reload
// pattern in NovaChat.tsx/NovaFeedbackModal.tsx) always supersedes it.
const PENDING_IDENTITY = '__pending__';

export function currentNovaIdentity(): string {
  return auth.currentUser?.uid ?? PENDING_IDENTITY;
}

export function novaStorageKey(baseKey: string): string {
  return `${baseKey}::${currentNovaIdentity()}`;
}

// The literal prefix every scoped Nova storage key starts with, for a
// given base key - used by src/main.tsx's "Secure Account mode" guard to
// recognise the scoped form (base + '::' + uid) as the same logical key
// it already allowlists by its bare base name, without needing to know
// any specific uid.
export function novaStorageKeyPrefix(baseKey: string): string {
  return `${baseKey}::`;
}
