// Pure logic for Nova voice-call continuity - kept free of I/O so it's
// unit-testable, same pattern as nova-tools.ts / guardian-alert.ts.
//
// The whole point is to let Nova greet a returning person as someone she
// knows ("good to hear your voice again") instead of a cold restart, WITHOUT
// storing or fabricating what was actually said. We keep only metadata about
// past calls - when, how long, how many turns - never transcript content.
// That's a deliberate privacy line: the app's history features elsewhere
// store metadata only (see docs/GUARDIAN_SUPPORT_SPEC.md), and voice, being
// the most intimate surface, gets the same treatment.

export interface VoiceSessionRecord {
  endedAt: string; // ISO 8601
  durationMs: number;
  turnCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function mostRecent(history: VoiceSessionRecord[]): VoiceSessionRecord | null {
  let best: VoiceSessionRecord | null = null;
  for (const s of history) {
    if (!s || typeof s.endedAt !== 'string') continue;
    if (!best || Date.parse(s.endedAt) > Date.parse(best.endedAt)) best = s;
  }
  return best;
}

// Human, non-fabricated phrasing for how long ago the last call was.
export function describeGap(lastEndedAt: string, now: number): string {
  const elapsed = now - Date.parse(lastEndedAt);
  if (Number.isNaN(elapsed) || elapsed < 0) return 'recently';
  if (elapsed < DAY_MS) return 'earlier today';
  const days = Math.floor(elapsed / DAY_MS);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'about a week ago';
  if (days < 31) return `about ${Math.round(days / 7)} weeks ago`;
  return 'a while ago';
}

// Builds the continuity preamble prepended to the call's system priming.
// Returns '' for a first-ever call so nothing is invented. Deliberately
// instructs Nova NOT to claim to recall specifics she doesn't have.
export function buildContinuityPreamble(history: VoiceSessionRecord[], now: number): string {
  const last = mostRecent(history);
  if (!last) return '';
  const count = history.filter((s) => s && typeof s.endedAt === 'string').length;
  const gap = describeGap(last.endedAt, now);
  const times =
    count === 1 ? 'once before' : count === 2 ? 'a couple of times before' : `${count} times before`;
  return (
    `CONTINUITY: You have spoken with this person by voice ${times}; your last call was ${gap}. ` +
    `Greet them warmly, like someone you already know - a brief, genuine "good to hear from you again" is enough. ` +
    `You do NOT have a record of what was said in past calls, so never pretend to remember specific details or claim they told you something. ` +
    `If it matters, ask.`
  );
}

// For a consented, gentle in-app nudge to check in by voice again - never an
// unsolicited outbound contact, just a reminder surfaced inside the app.
// Returns false unless the person opted in AND enough time has passed.
export function shouldSuggestCheckin(
  history: VoiceSessionRecord[],
  now: number,
  cadenceDays: number,
  consented: boolean,
): boolean {
  if (!consented) return false;
  if (cadenceDays <= 0) return false;
  const last = mostRecent(history);
  if (!last) return false; // never nudge someone who's never called
  const elapsed = now - Date.parse(last.endedAt);
  if (Number.isNaN(elapsed)) return false;
  return elapsed >= cadenceDays * DAY_MS;
}
