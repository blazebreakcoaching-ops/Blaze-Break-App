// Connector Layer - Evolution Engine PR3.
//
// Replaces EvolutionEngine.tsx's old "Safe Connector Layer" tab (three
// hardcoded example cards with invented sample output - "User has 7
// meetings today," etc., none of it real) with a real, unified view over
// the two genuine connector systems that already exist in this codebase:
//
//   1. Platform-level third-party dependencies (Twilio, Brevo, Gemini,
//      Vertex, Claude, Web Push) - already surfaced as "configured"
//      booleans by Command Centre's System Health tab
//      (GET /api/admin/system-health). This file does not recompute that
//      state; server.ts passes the same booleans in.
//   2. Organisation-level connectors (org-connectors.ts) - a real, tested,
//      per-org Slack/Jira/Asana/Calendly/Monday/local registry with its
//      own CRUD routes (POST/GET/enable/disable/revoke/reindex under
//      /api/org/:orgId/connectors). Notably, nothing in src/ currently
//      calls any of those routes - this is real, working backend
//      infrastructure with no dedicated management UI yet. This Evolution
//      Engine view is read-only platform-wide oversight across every
//      org's connectors, not a replacement for that (still unbuilt)
//      per-org management screen.
//
// Pure/I-O-free, same pattern as feature-registry-v2.ts and
// protected-core.ts - server.ts maps real data into this shape; nothing
// here invents a status, a capability, or a fallback that isn't backed by
// an actual, cited code path.

export type ConnectorScope = 'platform' | 'organisation';

export interface UnifiedConnectorView {
  connectorId: string;
  scope: ConnectorScope;
  orgId: string | null;
  provider: string;
  // Deliberately a free-text status per connector rather than one shared
  // enum - a platform dependency's real states ("configured" / "not
  // configured") and an org connector's real states (org-connectors.ts's
  // CONNECTOR_STATUSES/ConnectorAuthStatus) are genuinely different
  // vocabularies; collapsing them into one enum would either lose
  // information or invent a mapping nothing actually verifies.
  status: string;
  authenticationState: string;
  capabilities: string[];
  dataZones: string[];
  mutationAllowed: boolean;
  fallback: string;
  lastSuccessfulSync: string | null;
  owner: string | null;
}

// Real, cited facts about each platform-level dependency - every
// `fallback` string names the actual code path it describes. Capacity for
// error here is in `configured` alone (passed in from the real System
// Health check); everything else is a static fact about how that
// dependency behaves today, verified against server.ts at the time this
// was written.
interface PlatformDependencyFact {
  provider: string;
  capabilities: string[];
  dataZones: string[];
  mutationAllowed: boolean;
  fallback: string;
}

const PLATFORM_DEPENDENCY_FACTS: Record<string, PlatformDependencyFact> = {
  twilio: {
    provider: 'Twilio (SMS)',
    capabilities: ['Send SMS/WhatsApp (Guardian Alert, Ally Nudge)'],
    dataZones: ['external_delivery_data'],
    mutationAllowed: true,
    fallback: 'If unconfigured or the send fails, POST /api/guardian/alert returns 502 with GUARDIAN_STATE_COPY.failed - the user is told plainly and no retry queue exists (server.ts, the guardian alert route).',
  },
  brevo: {
    provider: 'Brevo (Email)',
    capabilities: ['Send transactional email (invites, security notices, verification)'],
    dataZones: ['external_delivery_data'],
    mutationAllowed: true,
    fallback: 'postToBrevoEmail() returns false on failure/missing key rather than throwing; callers (e.g. the ally-invite route) surface an explicit emailSent:false to the client so the user can act manually. The underlying record (e.g. the invite itself) is still created either way - there is no automatic retry queue for the email.',
  },
  gemini: {
    provider: 'Gemini (Nova default AI provider)',
    capabilities: ['Nova chat completion', 'Burnout diagnostic narrative', 'Voice transcription'],
    dataZones: ['private_recovery_vault'],
    mutationAllowed: false,
    fallback: "If GEMINI_API_KEY is missing and NOVA_CHAT_PROVIDER doesn't route to Claude/Vertex instead, Nova chat returns 401 ('Gemini API key not configured').",
  },
  vertex: {
    provider: 'Vertex AI',
    capabilities: ['Nova chat completion (optional alternate provider)'],
    dataZones: ['private_recovery_vault'],
    mutationAllowed: false,
    fallback: "Only used when NOVA_CHAT_PROVIDER=vertex; if the client failed to initialize or that env var isn't set, Nova chat runs on Gemini instead - never a hard failure on its own.",
  },
  claude: {
    provider: 'Anthropic Claude',
    capabilities: ['Nova chat completion (optional alternate provider)'],
    dataZones: ['private_recovery_vault'],
    mutationAllowed: false,
    fallback: "Only used when NOVA_CHAT_PROVIDER=claude; if ANTHROPIC_API_KEY is unset, Nova chat runs on Gemini instead - never a hard failure on its own.",
  },
  push: {
    provider: 'Web Push',
    capabilities: ['Browser push notification delivery'],
    dataZones: ['external_delivery_data'],
    mutationAllowed: true,
    fallback: 'If VAPID keys are not configured, push notifications are disabled outright - no alternate delivery channel is coded for them.',
  },
};

export const PLATFORM_DEPENDENCY_IDS = Object.keys(PLATFORM_DEPENDENCY_FACTS);

// `configured` is the one real, live-checked fact server.ts supplies per
// dependency (env-var presence, from the same source System Health
// uses) - deliberately not claimed as "Healthy," since no live
// connectivity probe exists for any of these; "configured" is the honest
// ceiling of what's actually verified.
export const buildPlatformConnectorViews = (configured: Record<string, boolean>): UnifiedConnectorView[] =>
  PLATFORM_DEPENDENCY_IDS.map((id) => {
    const fact = PLATFORM_DEPENDENCY_FACTS[id];
    const isConfigured = !!configured[id];
    return {
      connectorId: id,
      scope: 'platform' as const,
      orgId: null,
      provider: fact.provider,
      status: isConfigured ? 'configured' : 'not_configured',
      authenticationState: isConfigured ? 'credentials_present' : 'not_connected',
      capabilities: fact.capabilities,
      dataZones: fact.dataZones,
      mutationAllowed: fact.mutationAllowed,
      fallback: fact.fallback,
      lastSuccessfulSync: null,
      owner: null,
    };
  });

// Real org-connector document shape, as written by
// POST /api/org/:orgId/connectors (server.ts) - see org-connectors.ts.
export interface OrgConnectorDoc {
  type: string;
  displayName: string;
  status: string;
  authStatus: string;
  isLocal: boolean;
  configuredBy?: string | null;
  lastSync?: string | null;
}

export const buildOrgConnectorView = (connectorId: string, orgId: string, doc: OrgConnectorDoc): UnifiedConnectorView => ({
  connectorId,
  scope: 'organisation',
  orgId,
  provider: doc.displayName,
  status: doc.status,
  authenticationState: doc.authStatus,
  // org-connectors.ts has no real OAuth handshake wired up yet for any
  // non-local type (see initialAuthStatus's own comment) - so there is no
  // real capability to name beyond "registered" until that exists.
  // `local` is the one type that's honestly functional today: a document-
  // upload source with nothing external to authenticate.
  capabilities: doc.isLocal ? ['Local document upload (no external auth)'] : ['Registered - no live OAuth handshake exists yet at the org level'],
  dataZones: ['organisation_aggregates'],
  // No org-level connector can mutate anything external yet - none has a
  // real integration behind it (see capabilities above). Flipping this
  // requires that real integration work, not a flag on this view.
  mutationAllowed: false,
  fallback: doc.isLocal
    ? 'Not applicable - a local connector has no external dependency to fail.'
    : 'Not applicable yet - this connector type has no real external integration behind it, so there is nothing to fail over from.',
  lastSuccessfulSync: doc.lastSync || null,
  owner: doc.configuredBy || null,
});
