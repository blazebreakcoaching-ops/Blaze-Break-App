// PHASE 6A - structured evidence/reporting for the Nova chat intelligence
// evaluation framework (directive §7). Pure functions: building a report
// object and rendering it never touches the filesystem on their own -
// the two test files that actually run the framework (offline and
// live-eval) each call writeReportArtifacts explicitly, into
// test-results/ (already gitignored - see vitest.config.ts's own
// coverage config and .gitignore), so a run's synthetic transcripts and
// findings never reach a real commit.

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { NovaEvaluationRunReport, NovaScenarioEvaluationResult } from './nova-chat-scenario-types';

export function buildRunReport(
  mode: NovaEvaluationRunReport['mode'],
  scenarioResults: NovaScenarioEvaluationResult[],
  opts: {
    modelId?: string | null;
    featureFlagState: Record<string, boolean | string>;
    usage?: { promptTokens: number; outputTokens: number } | null;
    estimatedCostUsd?: number | null;
    note: string;
  },
): NovaEvaluationRunReport {
  const unresolvedRisks: string[] = [];
  for (const r of scenarioResults) {
    if (!r.allHardInvariantsPassed) {
      unresolvedRisks.push(`${r.scenarioId} (${r.category}): hard-invariant failure - see turnResults for detail.`);
    }
  }
  if (mode === 'offline') {
    unresolvedRisks.push('This run used a mocked model. It is evidence of correct application orchestration/safety-control behaviour only, never of real Gemini conversational quality - see directive\'s explicit prohibition on treating mocked results as such proof.');
  } else {
    // A completed Gemini call is evidence to REVIEW, not a reviewer decision.
    // Every scenario currently starts with reviewStatus='unreviewed'; the
    // route tests cannot perform independent clinical/safeguarding review.
    if (!opts.modelId || scenarioResults.length === 0) {
      unresolvedRisks.push('No real-model scenario results were recorded. This report cannot establish live-model quality or pilot readiness.');
    }
    if (scenarioResults.some((r) => r.qualitativeReview.reviewStatus === 'unreviewed')) {
      unresolvedRisks.push('Independent human qualitative/safeguarding review is outstanding. Automated hard-invariant passes do not approve a controlled pilot.');
    }
    if (scenarioResults.length > 0 && !scenarioResults.some((r) =>
      r.turnResults.some((t) => t.httpStatus === 200 && typeof t.responseText === 'string' && t.responseText.trim().length > 0)
    )) {
      unresolvedRisks.push('No usable real-model response text was captured; no conversational-quality conclusion can be drawn.');
    }
  }

  return {
    mode,
    modelId: opts.modelId ?? null,
    promptConfigRevision: `NOVA_SYSTEM_PROMPT+NOVA_SAFETY_INSTRUCTIONS as of this run (see ai-model-registry.ts for the model id/version in use)`,
    featureFlagState: opts.featureFlagState,
    generatedAt: new Date().toISOString(),
    scenarioResults,
    usage: opts.usage ?? null,
    estimatedCostUsd: opts.estimatedCostUsd ?? null,
    unresolvedRisks,
    note: opts.note,
  };
}

export function renderMarkdown(report: NovaEvaluationRunReport): string {
  const lines: string[] = [];
  const liveBlocked = report.mode === 'live_gemini' && report.modelId === null;
  const hasUsableModelReply = report.mode === 'live_gemini' && !liveBlocked &&
    report.scenarioResults.some((r) => r.turnResults.some((t) =>
      t.httpStatus === 200 && typeof t.responseText === 'string' && t.responseText.trim().length > 0));
  lines.push(`# Nova chat intelligence evaluation report`);
  lines.push('');
  lines.push(`- **Mode**: ${report.mode === 'offline'
    ? 'OFFLINE (mocked model - application/safety-control evidence only)'
    : liveBlocked
      ? 'NOT RUN (live evaluation blocked before a model call)'
      : hasUsableModelReply
        ? 'LIVE Gemini (usable real-model response captured; independent review pending)'
        : 'LIVE EVALUATION ATTEMPT (no usable model response captured)'}`);
  lines.push('- **Pilot approval**: NOT GRANTED. This evaluation report is evidence for independent review, not authorisation to enable NHEI or admit external pilot users.');
  lines.push(`- **Model**: ${report.modelId ?? (report.mode === 'offline' ? 'n/a (offline mode uses no real model)' : 'n/a (blocked before any model call)')}`);
  lines.push(`- **Prompt/config revision**: ${report.promptConfigRevision}`);
  lines.push(`- **Generated at**: ${report.generatedAt}`);
  lines.push(`- **Feature flags**: ${JSON.stringify(report.featureFlagState)}`);
  if (report.usage) lines.push(`- **Token usage**: ${report.usage.promptTokens} prompt / ${report.usage.outputTokens} output`);
  if (report.estimatedCostUsd !== null) lines.push(`- **Estimated cost (USD, rough)**: ${report.estimatedCostUsd}`);
  lines.push('');
  lines.push(`## Scenarios (${report.scenarioResults.length})`);
  lines.push('');
  for (const r of report.scenarioResults) {
    lines.push(`### ${r.scenarioId} - ${r.title} (${r.category})`);
    lines.push(`Hard invariants: ${r.allHardInvariantsPassed ? 'PASS' : 'FAIL'}`);
    lines.push(`Review status: ${r.qualitativeReview.reviewStatus}`);
    for (const t of r.turnResults) {
      lines.push(`- Turn ${t.turnIndex}: HTTP ${t.httpStatus}${t.error ? ` (error: ${t.error})` : ''}`);
      for (const h of t.hardInvariants) {
        if (!h.passed) lines.push(`  - FAIL [${h.id}]: ${h.detail}`);
      }
    }
    lines.push(`- Suggested follow-up: ${r.qualitativeReview.suggestedFollowUp}`);
    lines.push('');
  }
  if (report.unresolvedRisks.length > 0) {
    lines.push(`## Unresolved risks`);
    for (const risk of report.unresolvedRisks) lines.push(`- ${risk}`);
    lines.push('');
  }
  lines.push(`## Note`);
  lines.push(report.note);
  return lines.join('\n');
}

export function writeReportArtifacts(report: NovaEvaluationRunReport, baseName: string): { jsonPath: string; mdPath: string } {
  const dir = join(process.cwd(), 'test-results', 'nova-intelligence-eval');
  mkdirSync(dir, { recursive: true });
  const jsonPath = join(dir, `${baseName}.json`);
  const mdPath = join(dir, `${baseName}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(mdPath, renderMarkdown(report), 'utf-8');
  return { jsonPath, mdPath };
}
