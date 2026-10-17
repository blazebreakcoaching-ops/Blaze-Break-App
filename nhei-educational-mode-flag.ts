// NHEI PHASE 3C-2B CHECKPOINT 2 - SECTION 2: EDUCATIONAL MODE SERVER-SIDE
// FEATURE GOVERNANCE
//
// Reuses this codebase's existing kill-switch pattern exactly
// (nudgeSchedulerIsEnabled in guardian-alert.ts: "defaults to OFF...
// precisely because [this feature] has no standing approval to be on by
// default - an operator must explicitly opt in by setting
// [ENV_VAR]=true") rather than the CLIENT-facing FEATURE_FLAG_IDS list
// (feature-flag-ids.ts) that src/lib/feature-flags.ts reads. That list is
// deliberately NOT used here: this flag must never be client-visible or
// client-settable - "no client-provided field may bypass this gate" is
// this checkpoint's own instruction, and a flag a client can even READ
// is a flag a sufficiently motivated client could try to spoof context
// around. This is a pure, server-only, env-var-gated switch, checked
// fresh on every request, with no caching that could serve a stale
// "enabled" decision after an operator flips it off.
//
// Registered in the Evolution Engine / Feature Registry
// (nhei-feature-registry-entry.ts's `featureFlag` field now names this
// flag) for governance visibility - so turning it on or off is tracked
// the same way every other governed feature's flag is, even though the
// actual runtime check lives here, in code, not in Firestore - exactly
// the same split the registry's own schema comment draws between
// "lifecycle" (governance state) and "enforcement" (what the code
// actually does).
//
// Pure and I/O-free, same shape as nudgeSchedulerIsEnabled, so it is
// fully unit-testable without a server boot or an env mutation that
// could leak into other tests.

export const NHEI_EDUCATIONAL_MODE_ENV_VAR = 'NHEI_EDUCATIONAL_MODE_ENABLED';

// Default OFF - requires the operator to explicitly set the env var to
// exactly 'true'. Anything else (unset, empty, '1', 'yes', 'TRUE', a
// typo) stays OFF; this is deliberately NOT the "default-on unless
// exactly 'false'" polarity SMS_ENABLED/smsGloballyEnabled uses, because
// this feature - like the Tier-3 nudge scheduler - has no standing
// governance approval to be on by default. Per this checkpoint's
// instruction, this flag must not be flipped true in this checkpoint;
// this function existing and being correct is independent of whether
// anyone has yet set the env var.
export const nheiEducationalModeIsEnabled = (envValue: string | undefined): boolean => envValue === 'true';

// Convenience wrapper reading the real process.env - the one call site a
// route should use; every other call site (tests) calls
// nheiEducationalModeIsEnabled directly with an explicit value so no test
// ever depends on, or mutates, real process.env.
export const nheiEducationalModeIsEnabledNow = (): boolean =>
  nheiEducationalModeIsEnabled(process.env[NHEI_EDUCATIONAL_MODE_ENV_VAR]);
