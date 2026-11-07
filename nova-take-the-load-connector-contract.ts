// Nova "Take the Load" — abstract connector interface (Phase 5B, directive §4).
//
// A connector is the ONLY thing allowed to touch an external system. This
// file defines the interface and nothing else — no implementation of any
// real connector exists in this codebase today. The closest real
// precedent is Boundary Autopilot (`server.ts`'s `/api/boundary-autopilot/
// slack/*` routes), which already sends real Slack messages/DND/status
// using the user's own OAuth token, server-side audit-logged. Take the
// Load does NOT reuse that connector or any other real one — this phase
// builds only the interface a future, separately-authorised connector
// would implement, plus a fake, explicitly test-only implementation for
// this file's own and the engine's test suites.
//
// No credential, OAuth flow, or network call exists anywhere in this file.

import type { NovaPracticalActionCategory, NovaConnectorOutcome } from './nova-take-the-load-types';

export interface NovaExternalConnectorRequest {
  category: NovaPracticalActionCategory;
  proposedChangeDescription: string;
  /**
   * Optional - the caller's own proposal id, for a connector that supports
   * provider-level duplicate prevention/identity verification (Phase 5E,
   * directive §4). Added as an optional field so every existing caller
   * that never set this keeps working unchanged; a connector that doesn't
   * use it (e.g. the generic fake-for-testing one) simply ignores it.
   */
  proposalId?: string;
}

/**
 * What a real connector implementation would have to provide. No such
 * implementation exists in this codebase - this is the contract only.
 */
export interface NovaExternalConnector {
  readonly connectorKind: string;
  /** Must not mutate anything external - a pure readiness check. */
  checkReady(request: NovaExternalConnectorRequest): Promise<{ ready: boolean; reason: string | null }>;
  /** The one place a real external write would ever happen. */
  execute(request: NovaExternalConnectorRequest): Promise<NovaConnectorOutcome>;
  /** Only ever called when the category's undoSupported flag is true. */
  undo(request: NovaExternalConnectorRequest): Promise<NovaConnectorOutcome>;
}

/**
 * TEST-ONLY. Never a real external write - every method just resolves
 * with the caller-supplied outcome. Not imported by nova-take-the-load-
 * engine.ts itself; a caller (production code or a test) must construct
 * and pass one explicitly, so a real call site can never "fall back" to
 * this by omission. See nova-take-the-load-no-real-connector-audit.test.ts
 * for the static guard proving this is never imported outside test files.
 */
export function createFakeConnectorForTesting(options?: {
  readyResult?: { ready: boolean; reason: string | null };
  executeResult?: NovaConnectorOutcome;
  undoResult?: NovaConnectorOutcome;
}): NovaExternalConnector {
  return {
    connectorKind: 'fake_test_only',
    checkReady: async () => options?.readyResult ?? { ready: true, reason: null },
    // Includes a fake externalId by default - a realistic successful
    // connector response identifies the thing it created, which
    // nova-calendar-protection-service.ts's undo path requires before it
    // will even attempt a reversal (Phase 5D, directive §4: "never
    // promise an undo unless the actual connector can provide it"). A
    // caller exercising a failure path supplies its own executeResult
    // and this default is never used.
    execute: async () => options?.executeResult ?? { ok: true, detail: 'simulated success (test-only fake connector)', externalId: 'fake_external_id_test_only' },
    undo: async () => options?.undoResult ?? { ok: true, detail: 'simulated undo (test-only fake connector)' },
  };
}
