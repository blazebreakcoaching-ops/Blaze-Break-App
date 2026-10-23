// Nova Task Deferral — abstract connector interface (Phase 5F Agentic
// Expansion, directive §2).
//
// PERMANENTLY MOCKED, BY DESIGN — unlike Calendar Protection
// (nova-calendar-protection-service.ts), whose connector is a real,
// tested Google Calendar implementation held back only by a hardcoded
// kill switch, this category has no real provider implementation in this
// codebase at all, and the directive that commissioned it is explicit:
// "Use mocked external task connectors only. Do not modify real Asana,
// Monday, Jira or other provider tasks." That is a standing product
// decision, not a gap to close later in this file. A future phase that
// wants a real Asana/Monday/Jira write connector needs its own separate,
// explicitly authorised review (the same bar Calendar Protection's real
// connector went through in Phase 5E) — this file only defines the
// interface such a connector would implement, plus a fake, explicitly
// test-only implementation.
//
// No credential, OAuth flow, or network call exists anywhere in this file.
// The existing Asana/Monday/Jira integration tokens elsewhere in this
// codebase (integration_tokens collection, read-only signal routes) are
// never imported here.

export interface NovaTaskDeferralConnectorRequest {
  readonly proposalId: string;
  readonly taskDescription: string;
  readonly proposedNewDueDescription: string | null;
  readonly proposedNewPriority: 'lower' | 'unchanged' | 'higher' | null;
}

export interface NovaTaskDeferralConnectorOutcome {
  ok: boolean;
  detail: string;
}

/**
 * What a real provider connector would have to provide. No such
 * implementation exists in this codebase — this is the contract only.
 * Deliberately has no `undo` method: the generic Take the Load engine's
 * own CATEGORY map records `undoSupported: false` for `task_deferral`
 * ("a task-list reorder is not assumed reversible"), so this interface
 * never offers a capability the category was never granted.
 */
export interface NovaTaskDeferralConnector {
  readonly connectorKind: string;
  execute(request: NovaTaskDeferralConnectorRequest): Promise<NovaTaskDeferralConnectorOutcome>;
}

/**
 * TEST-ONLY / MOCK-ONLY. This is not a stand-in for a real connector that
 * doesn't exist yet — it is the ONLY connector this category will ever
 * call in this phase, in production and in tests alike, per the
 * directive's own instruction. See
 * nova-task-deferral-no-real-connector-audit.test.ts for the static guard
 * proving no file in this codebase imports `googleapis`, `asana`, a Jira
 * or Monday.com SDK, or raw `fetch`/`http`/`https` alongside this
 * category's files.
 */
export function createMockTaskDeferralConnector(options?: {
  executeResult?: NovaTaskDeferralConnectorOutcome;
}): NovaTaskDeferralConnector {
  return {
    connectorKind: 'mock_task_connector_only',
    execute: async () => options?.executeResult ?? { ok: true, detail: 'simulated task update (mock connector only — no real provider was contacted)' },
  };
}
