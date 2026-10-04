// Quiet hours for Ally Nudge Schedules (Master Support Circle spec).
//
// processNudgeSchedules (server.ts) already only ever fires a schedule at
// the exact local time the owner picked - there was no separate "don't
// send unattended messages at night" behaviour missing there. The real
// gap was upstream of that: nothing warned the owner, while picking that
// time, that they'd landed on one that sends late at night or very early
// morning - an easy mistake (a wrong AM/PM digit, or just not thinking
// about it for a recurring message that fires unattended, forever, with
// no per-send review).
//
// This is a confirmation gate, not a scheduling change - it only ever
// asks "are you sure", the same way the pre-existing contactAcknowledged
// checkbox already does for a different risk. It's deliberately generic
// (the owner's own chosen local time), not a per-contact-timezone system:
// SupportContact has no timezone field, and inventing one here to guess
// at a contact's own quiet hours would be a far bigger, speculative
// feature with no real data behind it.

const QUIET_HOURS_START_MINUTES = 21 * 60; // 9:00 PM
const QUIET_HOURS_END_MINUTES = 7 * 60; // 7:00 AM

// true for [21:00, 24:00) and [00:00, 07:00) - wraps across midnight.
export const isQuietHoursTime = (time: string): boolean => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return false;
  const minutes = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  return minutes >= QUIET_HOURS_START_MINUTES || minutes < QUIET_HOURS_END_MINUTES;
};

// A schedule may only be saved with a quiet-hours time if the owner has
// explicitly acknowledged it - same "honest human checkpoint" reasoning
// as contactAcknowledged. Undefined/missing time (e.g. a partial update
// that doesn't touch time) never blocks anything.
export const quietHoursCheckPasses = (
  time: string | undefined,
  quietHoursAcknowledged: boolean | undefined
): boolean => time === undefined || !isQuietHoursTime(time) || quietHoursAcknowledged === true;
