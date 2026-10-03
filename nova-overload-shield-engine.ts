// Nova Overload Shield: pure scoring + copy.
//
// Repositioned per the Capacity Firewall spec from a red/amber/green "risk"
// framing to calm, human status language, and away from any claim that Nova
// can guarantee crash prevention - it can only help pressure become visible
// earlier than it otherwise would.

import { describeBufferAfterAccepting, CAPACITY_NOT_CHECKED_LABEL, BufferTightness } from './capacity-firewall-engine';

export type ShieldState = 'stable' | 'drifting' | 'overload';

export const SHIELD_STATE_ORDER: ShieldState[] = ['stable', 'drifting', 'overload'];

export const SHIELD_STATUS_LABELS: Record<ShieldState, string> = {
  stable: 'Today looks manageable',
  drifting: 'Getting tight',
  overload: 'Over capacity',
};

export const SHIELD_STATUS_MESSAGES: Record<ShieldState, string> = {
  stable: 'Your schedule has enough breathing room today.',
  drifting: 'Meeting load is high and recovery gaps are low. Protect one break.',
  overload: "You're heading into overload. Let's reduce one thing now.",
};

export const SHIELD_STATUS_SUBTEXT: Record<ShieldState, string> = {
  stable: 'Capacity is aligned with energy levels. No action needed right now.',
  drifting: 'Signals point to escalating pressure and less recovery space than usual.',
  overload: 'Meeting volume, message pressure, and a lack of recovery gaps have added up.',
};

export interface ManualLoadInput {
  meetings: number;
  hours: number;
  messagePressure: string;
  sleepQuality: string;
  energyLevel: string;
  recoveryGaps: string;
}

export const computeManualLoadScore = (data: ManualLoadInput): number => {
  let score = 0;
  if (data.meetings > 5) score += 2;
  else if (data.meetings > 3) score += 1;

  if (data.hours > 10) score += 2;
  else if (data.hours > 8) score += 1;

  if (data.messagePressure === 'high') score += 2;
  else if (data.messagePressure === 'medium') score += 1;

  if (data.sleepQuality === 'poor') score += 2;
  else if (data.sleepQuality === 'fair') score += 1;

  if (data.energyLevel === 'low') score += 2;
  else if (data.energyLevel === 'medium') score += 1;

  if (data.recoveryGaps === 'no') score += 2;

  return score;
};

export interface ScoredIntegration {
  status: 'connected' | 'disconnected';
  scoreContribution: number;
}

export const computeIntegrationLoadScore = (integrations: ScoredIntegration[]): number =>
  integrations.reduce((sum, int) => sum + (int.status === 'connected' ? int.scoreContribution : 0), 0);

const OVERLOAD_THRESHOLD = 7;
const DRIFTING_THRESHOLD = 4;

export const scoreToShieldState = (score: number): ShieldState => {
  if (score >= OVERLOAD_THRESHOLD) return 'overload';
  if (score >= DRIFTING_THRESHOLD) return 'drifting';
  return 'stable';
};

export const NOVA_OVERLOAD_SHIELD_HEADER_QUOTE =
  "Most tools wait until you're overwhelmed. Nova watches for pressure early, so you can act before it builds up.";

export const NOVA_OVERLOAD_SHIELD_TAGLINE = 'Spot the Pressure Early';

export const CHECK_TODAYS_LOAD_LABEL = "Check Today's Load";
export const REFRESH_SIGNALS_LABEL = 'Refresh Signals';

export const GUARDIAN_DISPATCH_LINE =
  'Your self-reported load and connected signals show sustained high pressure. Do you want me to notify a trusted Guardian?';

export const buildEnergyBudgetNote = (connectedIntegrationCount: number): string =>
  connectedIntegrationCount > 0
    ? `Signals from ${connectedIntegrationCount} connected integration${connectedIntegrationCount === 1 ? '' : 's'} are factored into your Energy Delta.`
    : 'Connect an integration to feed real signals into your Energy Delta.';

// A third, always-on signal alongside manual self-report and live
// integrations: the real capacity/load numbers already captured by Energy
// Delta, shown honestly rather than silently blended into the score above.
export const CAPACITY_SIGNAL_LINES: Record<BufferTightness, string> = {
  comfortable: 'Your Energy Delta check-in shows comfortable room today.',
  tight: 'Your Energy Delta check-in shows a tight buffer today.',
  very_tight: 'Your Energy Delta check-in shows very little buffer today.',
  over_capacity: 'Your Energy Delta check-in shows you are already over capacity.',
  unknown: CAPACITY_NOT_CHECKED_LABEL,
};

export const buildCapacitySignalLine = (capacityScore: number | null, plannedLoad: number | null): string => {
  if (capacityScore === null || plannedLoad === null) return CAPACITY_NOT_CHECKED_LABEL;
  return CAPACITY_SIGNAL_LINES[describeBufferAfterAccepting(capacityScore, plannedLoad)];
};

export const NOVA_OVERLOAD_SHIELD_BANNED_PHRASES = [
  'prevent the crash',
  'biometric',
  'systemic crash',
  'deducting credits',
];

export const containsNovaOverloadShieldBannedPhrase = (text: string): boolean =>
  NOVA_OVERLOAD_SHIELD_BANNED_PHRASES.some((p) => text.toLowerCase().includes(p));
