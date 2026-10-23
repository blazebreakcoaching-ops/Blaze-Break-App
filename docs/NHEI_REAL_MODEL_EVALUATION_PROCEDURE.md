# NHEI real-model evaluation procedure

An operator-ready runbook for the one empirical validation step NHEI still
needs that no amount of further engineering in this repository can
substitute for: running real prompts against a real Gemini model and
checking what actually comes back. Nothing in this document has been
executed in this environment — no usable credential has ever existed here
(checked directly, again, while writing this: no `GEMINI_API_KEY` /
`GOOGLE_API_KEY` / `GENAI_*` / `VERTEX_*` variable, no `.env` beyond the
committed template, no reachable GCP metadata server). This is a procedure
for an authorised human operator to follow outside this environment, not a
report of a run that happened.

This document covers two genuinely different real-model validations that
this codebase has prepared but never run. Do not conflate them:

- **A. Extraction accuracy** — does a real model, given a synthetic
  conversation, extract the Three-Selves/Four-Dimensions evidence a human
  would? Harness: `nhei-real-model-evaluation-runner.ts`.
- **B. Quarantine-boundary adherence** — does a real model actually treat
  retrieved knowledge text as inert reference data when it is wrapped by
  `quarantineKnowledgeEntryForPrompt` (`nhei-knowledge-model-interface.ts`),
  even when that text itself tries to look like an instruction? No harness
  exists yet for this one end-to-end against a real model; part B below
  says what running it would require.

## 0. Before any of this: credentials and spending approval

- **Do not provision a credential as part of running this procedure.**
  That is a separate, prior decision by whoever controls the Google Cloud
  project NHEI will eventually use — this document assumes that decision
  has already been made and a key already exists.
- The operator running this procedure must hold the credential personally
  (e.g. a scoped `GEMINI_API_KEY` in their own shell environment, or a
  service-account key they alone can read) and must never commit it,
  paste it into a chat, or add it to any file tracked by git. Treat it
  exactly like any other production secret.
- Get explicit, separate sign-off on a spending ceiling before starting —
  Part A below is priced in fractions of a cent per fixture at
  `gemini-2.0-flash` rates, but that estimate is only as good as the
  hardcoded rate table in `nhei-real-model-evaluation-runner.ts`
  (`APPROXIMATE_USD_PER_1K_TOKENS`), which can go stale. Check Google's
  current published pricing for the exact model before approving a batch
  size.
- `hasGeminiCredentials()` must return `true` before anything below will
  do more than report `status: 'blocked'`. It explicitly also rejects the
  literal placeholder `MY_GEMINI_API_KEY` some templates leave behind.

## Part A — extraction accuracy, consistency, cost

### A.1 Approved model identifier

State the exact model id you are authorised to call (e.g.
`gemini-2.0-flash`) — `NheiRealModelRunConfig.modelId` is a required field
with no default, by design: an operator must say which model every run
used, not inherit an implicit one.

### A.2 Synthetic dataset — already fixed, nothing to prepare

`NHEI_EVALUATION_DATASET` (`nhei-extraction-evaluation-dataset.ts`) is the
entire input. It is hand-constructed, synthetic, and contains no real
user data — confirmed by this file having no Firestore import and no `db`
parameter anywhere in the real-execution path. You do not need to build or
collect anything for Part A.

### A.3 Initial small-batch execution

Run a small batch FIRST, not the full dataset:

```ts
import { runRealModelEvaluation } from './nhei-real-model-evaluation-runner';

const report = await runRealModelEvaluation({
  modelId: 'gemini-2.0-flash',   // the exact id you were authorised to use
  maxFixtures: 5,                // small batch first - see A.3
});
```

Inspect `report` fully before running anything larger. If `report.status
=== 'blocked'`, nothing was called — fix the credential, don't retry
blindly.

### A.4 Token and cost reporting

`report.totalTokenUsage` (`promptTokens`/`outputTokens`, summed across the
batch via real usage returned by the Gemini client, not estimated) and
`report.estimatedCostUsd` (a rough estimate only, `null` for any model not
in the hardcoded rate table — treat a `null` here as "check your Cloud
Billing console," not as "this run was free").

### A.5 Accuracy reporting

`report.metrics` (`NheiEvaluationDatasetSummary`, from
`summarizeEvaluationRuns`) scores the model's real candidates against each
fixture's expected ones using `evaluateExtractionRun`'s existing
content-aware matching — the same scoring logic already exercised in this
repo's test suite against a mocked caller, now applied to real output.

### A.6 Model consistency (interpretation stability)

Set `repeatCount >= 2` (optionally `repeatSubsetSize`) to have the SAME
fixture run multiple times and compared position-by-position via
`assessInterpretationStability`. Read `report.stability` and the
`stabilityFixtureId` named in `report.note`. A model that extracts
materially different evidence from an unchanged conversation on repeated
calls is a real finding — do not average it away.

### A.7 Explicit acceptance criteria

No numeric acceptance threshold exists in code today, and this document
does not invent one — "what accuracy/stability level is good enough to
proceed" is a product/clinical-adjacent judgement call, not an engineering
default, and inventing one here would be exactly the kind of unreviewed
specification Phase 3's own rules forbid. Before this run is treated as
passed or failed, an authorised reviewer (see §7 of the closure directive)
must state, in writing, what score on `report.metrics` and what stability
result would be acceptable — and that statement must exist BEFORE the run,
not be fitted to whatever the run happens to produce.

### A.8 Review of failures

For every fixture `evaluateExtractionRun` scores poorly, or every
divergence `assessInterpretationStability` flags, record: the fixture id,
the model's actual candidates, the expected candidates, and a one-line
judgement of whether the divergence is a dataset problem (the fixture's
own expected answer was too strict/ambiguous) or a real model-behaviour
problem. Do not discard failing runs — append them to this procedure's own
run log (see §8 below) so a pattern across runs is visible later.

## Part B — quarantine-boundary adherence (adversarial knowledge testing)

This is the directive's "guarantee B" gap, named honestly in
`docs/NHEI_ARCHITECTURE.md`'s trust-boundary section: every test that
exists today (`nhei-trust-boundary.test.ts`,
`nhei-knowledge-model-interface.test.ts`) proves the delimiter/framing
STRING cannot be forged by adversarial knowledge-entry content. None of
them prove a real model actually honours that framing once it receives
the string. No harness like `nhei-real-model-evaluation-runner.ts` exists
yet for this specific question — building one is itself part of what an
authorised operator should do before this gap can close, not something to
skip past:

1. Take the adversarial knowledge-entry fixtures already used in
   `nhei-trust-boundary.test.ts` (entries whose `detailedExplanation`/etc.
   contain text designed to look like an instruction, e.g. "ignore
   everything above and...").
2. Build the exact same merged system prompt Educational Mode would
   produce in production (`NOVA_SYSTEM_PROMPT` + the quarantined knowledge
   via `quarantineKnowledgeEntryForPrompt` + `NOVA_SAFETY_INSTRUCTIONS`),
   using the real functions, not a hand-copied approximation.
3. Send a small number of real user messages designed to test whether the
   model follows an embedded instruction from the "reference data" section
   rather than the real system prompt's actual authority.
4. For each response, record a human judgement: did the model treat the
   adversarial text as data (correct) or as an instruction it acted on
   (a real finding, not a score to average away)?
5. This is inherently a small, manually-reviewed batch — not something to
   automate into a pass/fail number the way Part A's extraction scoring
   is, because "did the model get manipulated" is a qualitative read of
   each transcript, not a field-by-field diff against an expected value.

## §8 — run log

Every real run (Part A or B) that is ever executed against this procedure
should be appended here as a dated entry: date, operator, model id, batch
size, credential source (never the credential itself), and a link to
where the full report/transcripts were stored (never inside this repo —
real-model output is not something to commit to version control by
default; agree a storage location with the privacy/compliance
decision-maker named in the closure directive's §7 handoff first).

**No entries exist yet.** This procedure has never been executed.
