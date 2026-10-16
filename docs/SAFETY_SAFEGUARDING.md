# Safety & Safeguarding

Batch 1 for the "Safety & Safeguarding" capability from the Operations
Intelligence Hub audit. This capability touches a non-negotiable
constraint already documented in `docs/SECURITY_ARCHITECTURE.md`: no risk
scoring, no inferred mental-state signal, Guardian escalation
user-authorised only. Given that, this batch deliberately does not build
a new crisis-escalation workflow or a human-review queue for flagged
conversations - either would risk violating that constraint if built
without real product/legal review. Instead, this batch closes a real,
already self-documented gap using an existing, already-approved safety
mechanism, extending it rather than inventing new policy.

## What was found

A comment block already in `server.ts` (above `NOVA_ONE_SHOT_SAFETY_FLOOR`)
documented its own history: of six one-shot AI generators, voice-journal
and resentment-analysis had been given a safety floor "per explicit
product sign-off," while diagnose-narrative, one-less-thing, and
executive-report were left as "open, lower-priority gaps (short task
label or scores/aggregates only, not open-ended disclosure)."

Checking each one's actual input against that characterisation, rather
than trusting it:

- **`one-less-thing`'s `task` field is genuinely free text, up to 300
  characters** (`OneLessThingRequestSchema`) - "the thing weighing on
  them" is exactly the kind of prompt someone could use to disclose real
  distress through. This was a real, active gap, not a theoretical one -
  "short task label" undersold how much room 300 characters gives.
- `diagnose-narrative`'s only inputs are four fixed archetype labels and
  numeric 1-4 scores - no free-text channel exists.
- `executive-report`'s only inputs are the user's own numeric signals
  (deep work hours, boundary-script count, burn rate, sleep debt) - same
  "no free-text channel" reasoning.

## What's shipped

- `NOVA_ONE_SHOT_SAFETY_FLOOR` split into a `_BASE` (every one-shot
  generator) and the full JSON-flavored export (`_BASE` plus the one line
  that only makes sense for a fixed-shape JSON response) - a plain-prose
  generator getting the JSON-specific "return only the JSON object" line
  would have been a non-sequitur instruction.
- `one-less-thing` now gets the full `NOVA_ONE_SHOT_SAFETY_FLOOR` (its
  output is the same `responseSchema`-enforced JSON shape as
  voice-journal/resentment-analysis) - the one real gap this batch closes.
- `diagnose-narrative` and `executive-report` now get
  `NOVA_ONE_SHOT_SAFETY_FLOOR_BASE` (plain-paragraph output) for
  defence-in-depth and consistency with the other four generators, not
  because an active gap was found in either.
- Route-level tests added to all three routes' existing test files,
  mirroring `voice-journal.route.test.ts`'s established pattern: asserting
  the crisis-line pointer and the "never fabricate a risk score" line are
  always present in the exact prompt text sent to the (mocked) model.
- The self-audit comment block in `server.ts` updated from "NOW MOSTLY
  REMEDIATED" to "NOW FULLY REMEDIATED," with the per-generator reasoning
  recorded inline.

## Deliberately not in this batch

- **No crisis-escalation workflow.** Detecting a crisis and routing it to
  a human reviewer is a real product/legal decision (who reviews it, what
  they're shown, retention, liability) this batch does not make
  unilaterally.
- **No human-review queue for flagged conversations.** Same reasoning -
  and "flagging" a conversation at all risks becoming the kind of
  inferred-risk signal the non-negotiable constraint rules out, unless
  designed very deliberately.
- **No new risk-scoring or classification mechanism.** The floor added
  here explicitly forbids the model from producing one
  ("Never fabricate... a risk score, risk level, or severity
  classification of any kind") - consistent with the existing constraint,
  not a step toward building one.
