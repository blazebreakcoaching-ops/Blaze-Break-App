# AI Model Assurance

Batch 1 for the "AI Model Assurance" capability from the Operations
Intelligence Hub audit. The audit's own finding was "no eval harness, no
prompt-regression testing, no model-output quality scoring" - building a
real eval harness is substantial, separate work (it needs a corpus of
graded prompts/outputs and a scoring methodology, not something to invent
speculatively in one batch). This batch instead closes a smaller, real,
concretely-found gap: there was no single source of truth for which model
version each AI-backed route actually calls.

## What was found

13 route handlers each hardcoded the literal string `"gemini-3.5-flash"`
independently, plus 3 more model strings (one TTS, one Live-voice, one
Claude) each hardcoded once. Nothing connected these - a diff bumping one
occurrence gave no signal, positive or negative, about whether the other
12 were also updated. This is exactly the shape of risk "AI Model
Assurance" as a capability exists to catch: an unintentional model-version
mismatch between features, undetectable by code review of any single
route in isolation.

## What's shipped

- `ai-model-registry.ts`: one named constant per logical capability
  (`GEMINI_TEXT_MODEL`, `GEMINI_TTS_MODEL`, `GEMINI_LIVE_MODEL`,
  `CLAUDE_CHAT_MODEL`), not one constant forced on every route that
  happens to share a value today - a future change needing to move just
  one capability off its current model doesn't have to touch any other
  call site.
- All 16 previous hardcoded occurrences in `server.ts` now import from
  this registry. Bumping a model version is now a one-line change in one
  file, not a 13-site find-and-replace with no way to verify completeness
  by eye.
- `ai-model-registry.test.ts`: a guardrail, in the same spirit as
  `user-data-collections.test.ts`'s scanner, that fails the build if any
  `gemini-*`/`claude-*`-shaped string literal reappears directly in
  `server.ts` instead of importing the shared constant - so the next
  AI-backed route can't silently reintroduce the exact problem this batch
  just fixed.

## Deliberately not in this batch

- **No real eval harness.** Scoring model output quality, catching prompt
  regressions, or grading responses against a corpus is real, separate
  work this batch does not attempt.
- **No model-deprecation fallback behavior.** If Google retires
  `gemini-3.5-flash`, every route using `GEMINI_TEXT_MODEL` still fails
  the same way it does today (the provider's own error surfaces to the
  route's existing catch block) - this batch makes the version a single
  point of control, not a guarantee against the model being retired.
- **OpenAI is still unused.** Confirmed again during this investigation:
  the SDK is initialized but has zero call sites anywhere in the
  codebase, unchanged from the original audit's finding.
