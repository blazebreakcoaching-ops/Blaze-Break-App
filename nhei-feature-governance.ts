// NHEI PHASE 3C CHECKPOINT 3 SECTION 2 - OPERATIONAL FEATURE GOVERNANCE
//
// AUDIT FINDING (what this file exists to fix): Checkpoint 2's delivery
// report described flipping NHEI_EDUCATIONAL_MODE_ENABLED off as something
// that "stops immediately... redeploy the environment configuration only."
// That claim was never verified against this app's actual deployment
// architecture. Per docs/DEPLOY.md, this app runs as a single Cloud Run
// service, with environment variables set on the Cloud Run SERVICE
// resource (via `gcloud run services update --update-env-vars` or the
// GitHub Actions deploy workflow), not read from any file a running
// container can be told to reload. On Cloud Run, changing a service's
// env vars is NOT a live in-process update - it provisions a NEW
// REVISION and migrates traffic to it. That is still fast (no rebuild,
// no code change, no CI test suite to wait on - typically well under a
// minute) and still correctly described as "no new application release"
// in the narrow sense Checkpoint 2 meant (no git commit, no build
// pipeline), but it is NOT an immediate, zero-latency, in-memory toggle,
// and claiming otherwise without checking is exactly the kind of
// unverified operational claim this checkpoint's own instruction 2 warns
// against. This file's header comment IS that verification, and the
// correction is stated here rather than silently fixed in the next
// report.
//
// THE FIX: a second, independently-propagating gate that does NOT
// require a new Cloud Run revision at all - reusing this codebase's own
// existing pattern for exactly this problem, evolution-freeze.ts's
// `app_config/evolution_freeze` document, which server.ts already reads
// fresh (no cache) on every request that needs it, and which already
// propagates safely across every running instance the moment the write
// commits, because there is no per-instance cache to go stale. This
// file defines the equivalent document for NHEI
// (`app_config/nhei_feature_state`) and the pure, fail-closed
// interpretation logic for it - same shape of guarantee as
// `isEvolutionFrozen`.
//
// GOVERNANCE MODEL: two independent gates, combined with AND, not OR.
// Educational Mode is truly enabled only when BOTH
// nheiEducationalModeIsEnabledNow() (the env var, Checkpoint 2) AND this
// document's `educationalModeEnabled` field are true. This is
// deliberate, not redundant:
//   * The env var remains the ONLY way to turn the feature on in the
//     first place - this document can never flip a cold-started instance
//     from off to on by itself, because isNheiModeEnabledInGovernanceDoc
//     defaults to false exactly like the env var does, and more
//     importantly because the actual call site (server.ts) only ever
//     reads this document at all once the env var has already passed -
//     see "no permission to activate a feature solely because its code
//     is deployed," which this short-circuit also satisfies for cost: a
//     disabled env var means this document is never even read.
//   * This document IS a genuinely fast way to turn the feature back OFF
//     once the env var is on - a single Firestore write, no Cloud Run
//     revision, visible to every instance on its very next request.
//     That is the real, verified "immediate kill switch" this checkpoint
//     asked for - narrower in scope than Checkpoint 2's own claim, but
//     actually true.
//   * Personal Reflection and Longitudinal Mode each get their OWN field
//     here, independently interpreted - "independent control of
//     Educational, Personal Reflection and Longitudinal Mode" - even
//     though, per Checkpoint 2 section 9 and this checkpoint's own
//     instruction, neither mode is wired into any live route yet. These
//     fields exist now so the governance document's shape does not need
//     a breaking change later, and so this file's own tests can already
//     prove the three modes cannot affect each other.
//
// FAIL-CLOSED: a missing document, a malformed field, or - critically - a
// thrown Firestore read (a transient outage, a permissions error, a
// timeout) all resolve to `false` for every mode. This file never
// distinguishes "explicitly disabled" from "state unknown"; both are
// simply not-enabled, by construction, which is also why the governance
// document's read happens inside a try/catch at its own call site (not
// left to a caller that might not wrap it).

import type { FirestoreLike } from './nhei-persistence-service';

export const NHEI_FEATURE_GOVERNANCE_COLLECTION = 'app_config';
export const NHEI_FEATURE_GOVERNANCE_DOC_ID = 'nhei_feature_state';

export type NheiGovernedMode = 'educational' | 'personal_reflection' | 'longitudinal';

export interface NheiFeatureGovernanceState {
  educationalModeEnabled: boolean;
  personalReflectionModeEnabled: boolean;
  longitudinalModeEnabled: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
  reason: string | null;
}

export const DEFAULT_NHEI_FEATURE_GOVERNANCE_STATE: NheiFeatureGovernanceState = {
  educationalModeEnabled: false,
  personalReflectionModeEnabled: false,
  longitudinalModeEnabled: false,
  updatedBy: null,
  updatedAt: null,
  reason: null,
};

const FIELD_FOR_MODE: Record<NheiGovernedMode, keyof NheiFeatureGovernanceState> = {
  educational: 'educationalModeEnabled',
  personal_reflection: 'personalReflectionModeEnabled',
  longitudinal: 'longitudinalModeEnabled',
};

// Pure interpretation of a possibly-missing/malformed stored doc, the
// same shape of guarantee as evolution-freeze.ts's isEvolutionFrozen.
// Each mode is read independently - a malformed or missing field for
// one mode never affects another, and nothing here infers one mode's
// state from another's.
export function isNheiModeEnabledInGovernanceDoc(
  doc: Partial<NheiFeatureGovernanceState> | null | undefined,
  mode: NheiGovernedMode,
): boolean {
  const field = FIELD_FOR_MODE[mode];
  return doc?.[field] === true;
}

export interface NheiGovernanceToggleValidationResult {
  valid: boolean;
  error?: string;
}

const MAX_REASON = 2000;

// Mirrors validateFreezeToggleInput's own shape and limits - an admin
// write to this document should be validated the same way an admin
// write to evolution_freeze already is, not by a new ad hoc rule.
export function validateNheiGovernanceToggleInput(input: unknown): NheiGovernanceToggleValidationResult {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'A governance toggle object is required.' };
  }
  const c = input as Record<string, unknown>;
  for (const field of ['educationalModeEnabled', 'personalReflectionModeEnabled', 'longitudinalModeEnabled'] as const) {
    if (c[field] !== undefined && typeof c[field] !== 'boolean') {
      return { valid: false, error: `"${field}" must be a boolean when provided.` };
    }
  }
  if (c.reason !== undefined && c.reason !== null && (typeof c.reason !== 'string' || c.reason.length > MAX_REASON)) {
    return { valid: false, error: `"reason" must be a string or null (max ${MAX_REASON} characters).` };
  }
  return { valid: true };
}

// The one function a route should call. Reads app_config/nhei_feature_state
// fresh (no cache - cross-instance propagation is exactly as safe as
// evolution_freeze's, because there is nothing to go stale) and fails
// closed on any read error, exactly as on a missing/malformed document.
// Never throws to its caller.
export async function isNheiModeEnabledInGovernance(db: FirestoreLike, mode: NheiGovernedMode): Promise<boolean> {
  try {
    const snap = await db.collection(NHEI_FEATURE_GOVERNANCE_COLLECTION).doc(NHEI_FEATURE_GOVERNANCE_DOC_ID).get();
    const data = snap.exists ? (snap.data() as Partial<NheiFeatureGovernanceState> | undefined) : undefined;
    return isNheiModeEnabledInGovernanceDoc(data, mode);
  } catch {
    return false;
  }
}
