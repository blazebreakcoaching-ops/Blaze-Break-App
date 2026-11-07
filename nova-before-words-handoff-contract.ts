// Before Words -> Nova intake handoff (Phase 5B, directive §5).
//
// Audit before writing this: `nhei-before-words-contract.ts` (Phase 5)
// already has two real, equally-valid endings -
// `decideProceedWithoutRetaining` and `decideRetainAsReflectionEvidence`
// - but `src/components/NheiBeforeWords.tsx` only ever calls the first
// one; nothing in this codebase calls the second. That is the correct,
// honest state today, not a bug to silently "complete" here: no real
// `reflection_storage` write exists yet (same gap as NHEI consent
// generally - see docs/NHEI_RELEASE_BLOCKERS.md item 7), so a UI that
// offered "retain" as a real-looking button would be exactly the
// "simulated option mistaken for working persistence" the directive
// warns against. This file prepares the DATA SHAPE a future, approved
// retain path would hand off to Nova's conversational/recovery systems
// - it does not wire anything live, write anything, or call any model.
//
// This function only ever produces a summary when the caller's state
// already carries `decision === 'retain_as_reflection_evidence'` - which,
// per the paragraph above, is currently unreachable from the live UI.
// If `proceed_without_retaining`, this returns null: a discarded
// Before Words session must never be reconstructed into a "summary" by
// this or any other function - that would be a hidden retention, exactly
// what "proceed without retaining" is supposed to prevent.
//
// No diagnosis, trait, or interpretation is added here - every field is a
// direct, structural carry-over of what the user already said or marked
// uncertain in nhei-before-words-contract.ts. `hasUncertainty` is a plain
// boolean roll-up of the user's OWN uncertainty flags, never a confidence
// score this module invents.

import type { NheiBeforeWordsState, NheiBeforeWordsPromptResponse } from './nhei-before-words-contract';

export interface NovaIntakeSummary {
  freeExpressionText: string;
  promptResponses: NheiBeforeWordsPromptResponse[];
  corrections: string[];
  /** True iff the user marked any of their own answers uncertain. Never this module's own judgement. */
  hasUncertainty: boolean;
}

export function buildNovaIntakeSummaryFromBeforeWords(state: NheiBeforeWordsState): NovaIntakeSummary | null {
  if (state.decision !== 'retain_as_reflection_evidence') return null;
  return {
    freeExpressionText: state.freeExpressionText,
    promptResponses: state.promptResponses,
    corrections: state.corrections,
    hasUncertainty: state.promptResponses.some((r) => r.uncertain),
  };
}
