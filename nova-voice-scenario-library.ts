// PHASE 6B (directive §5) - the synthetic scenario registry for the Nova
// Live voice evaluation harness. Pure data, exactly like
// nova-chat-scenario-library.ts's own design: the harness
// (nova-voice-evaluation-runner.test.ts) drives each scenario through
// the REAL, unmodified handleNovaLiveConnection (server.ts) against a
// mocked `ai.live.connect` - there is no live-Gemini-Live mode anywhere
// in this codebase (unlike text chat's controlled live-model mode),
// since a real bidirectional audio WebSocket to Google's own endpoint
// cannot be safely bounded the way a single bounded HTTP call can -
// every scenario here is offline/mocked-only, always, and this file's
// own `category` field exists so the harness can report, per directive
// §5's own "interruption handling, session termination and permission
// boundaries" requirement, which of those three this run actually
// covered.
export type NovaVoiceScenarioCategory = 'interruption_handling' | 'session_termination' | 'permission_boundary';

export interface NovaVoiceScenarioDefinition {
  id: string;
  category: NovaVoiceScenarioCategory;
  title: string;
  description: string;
}

export const NOVA_VOICE_SCENARIOS: NovaVoiceScenarioDefinition[] = [
  {
    id: 'V01_user_interrupts_nova_speaking',
    category: 'interruption_handling',
    title: 'User speaks over Nova mid-reply',
    description: "Gemini Live reports serverContent.interrupted while Nova is mid-turn; the relay must forward {interrupted:true} to the client so its UI can stop rendering Nova as still speaking.",
  },
  {
    id: 'V02_idle_timeout_ends_session',
    category: 'session_termination',
    title: 'A session with no activity for the idle window must end itself',
    description: 'No audio in either direction for longer than NOVA_LIVE_IDLE_TIMEOUT_MS - the session must close and bill only the real elapsed minutes up to that point, never run indefinitely.',
  },
  {
    id: 'V03_max_duration_ends_session',
    category: 'session_termination',
    title: 'A session hitting the hard duration ceiling must end itself regardless of activity',
    description: 'Even a fully active session must be cut off at NOVA_LIVE_MAX_SESSION_MS - a real per-second cost ceiling, not merely an idle guard.',
  },
  {
    id: 'V04_client_disconnect_ends_session_cleanly',
    category: 'session_termination',
    title: 'A client-initiated disconnect must end the session exactly once',
    description: "The client socket closing must end the upstream session and bill real elapsed minutes, and a second close event must be a no-op rather than double-billing or double-closing.",
  },
  {
    id: 'V05_guardian_offer_blocked_when_flag_off',
    category: 'permission_boundary',
    title: 'offer_guardian_support must never reach the voice client while GUARDIAN_SUPPORT_INVITATION_ENABLED is off',
    description: "The server-side flag gate (executeOfferGuardianSupport) must block this exactly as it does for text chat - voice must never be a second path that bypasses a gate text already enforces. Nova's spoken reply must also never be the only place a guardian action surfaces - the offer must come only through the visual card relay, and here, not at all while the flag is off.",
  },
  {
    id: 'V06_memory_write_cap_respected_in_voice',
    category: 'permission_boundary',
    title: 'The per-session voice memory-write cap must hold even under a burst of tool calls',
    description: 'MAX_VOICE_MEMORY_WRITES (5) must still be enforced when many remember_about_user calls arrive in rapid succession, the same race-safety property text chat\'s per-turn cap has.',
  },
];
