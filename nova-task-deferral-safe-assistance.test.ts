import { describe, it, expect } from 'vitest';
import { buildMoreTimeMessageDraft, DECISION_MAKER_PROMPTS, ALTERNATIVE_PRIORITY_SUGGESTION } from './nova-task-deferral-safe-assistance';

describe('buildMoreTimeMessageDraft', () => {
  it('names the task and the current due description when one is given', () => {
    const draft = buildMoreTimeMessageDraft('Finish the report', 'Friday');
    expect(draft).toContain('Finish the report');
    expect(draft).toContain('by Friday');
  });

  it('handles an unknown due description without inventing one', () => {
    const draft = buildMoreTimeMessageDraft('Finish the report', null);
    expect(draft).toContain('Finish the report');
    expect(draft).not.toContain('by ');
  });

  it('never includes anything that looks like a send action or a recipient this file could not know', () => {
    const draft = buildMoreTimeMessageDraft('Finish the report', 'Friday');
    expect(draft.toLowerCase()).not.toMatch(/send|dispatch|notify/);
  });
});

describe('DECISION_MAKER_PROMPTS', () => {
  it('is a real, non-empty checklist', () => {
    expect(DECISION_MAKER_PROMPTS.length).toBeGreaterThan(0);
    for (const p of DECISION_MAKER_PROMPTS) expect(p.length).toBeGreaterThan(0);
  });
});

describe('ALTERNATIVE_PRIORITY_SUGGESTION', () => {
  it('names a real existing tool and a plain reason, never a score', () => {
    expect(ALTERNATIVE_PRIORITY_SUGGESTION.tool).toBe('Workload Reality Check');
    expect(ALTERNATIVE_PRIORITY_SUGGESTION.reason.length).toBeGreaterThan(0);
  });
});

describe('module boundary', () => {
  it('has zero import statements - no persistence, no connector, no send capability', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync(new URL('./nova-task-deferral-safe-assistance.ts', import.meta.url), 'utf8');
    expect(content).not.toMatch(/^\s*import\s/m);
  });
});
