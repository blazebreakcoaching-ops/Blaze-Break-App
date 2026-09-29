import { describe, it, expect } from 'vitest';
import {
  MOVEMENT_SNACKS, MOVEMENT_ORDER, MOVEMENT_CATEGORY_ORDER, MOVEMENTS_BY_CATEGORY,
  MOVEMENT_CONTEXT_ORDER, MOVEMENT_FEEDBACK_OPTIONS, seatedFriendlyMovementIds,
} from './movement-snacks-content';

// Section 6/7's safety-language and copy-cleanup rules are product
// guarantees, not just style preferences - locking them in as tests means a
// future content edit can't silently reintroduce fitness-bro or
// pseudo-medical language.
const BANNED_PATTERNS: RegExp[] = [
  /realign your physical structure/i,
  /circadian rhythm anchor/i,
  /\bforce\b(?!\s+this)/i, // "force" is fine only in "no need to force this"-style safety notes
  /ballistic/i,
  /\bpunishment\b/i,
  /no pain no gain/i,
  /push through/i,
  /\bstreak\b/i,
  /\bcalorie/i,
  /\brep(s)?\b/i,
  /\bworkout\b/i,
];

describe('MOVEMENT_SNACKS content', () => {
  it('every listed movement id is a real, active entry with the required fields', () => {
    for (const id of MOVEMENT_ORDER) {
      const m = MOVEMENT_SNACKS[id];
      expect(m, `missing entry for ${id}`).toBeTruthy();
      expect(m!.active).toBe(true);
      expect(m!.title.length).toBeGreaterThan(0);
      expect(m!.shortDescription.length).toBeGreaterThan(0);
      expect(m!.steps.length).toBeGreaterThan(0);
      expect(m!.durationSeconds).toBeGreaterThan(0);
      expect(m!.supportedPositions.length).toBeGreaterThan(0);
      expect(m!.voiceEnabled).toBe(true);
    }
  });

  it('every category in the taxonomy is real', () => {
    for (const id of MOVEMENT_ORDER) {
      expect(MOVEMENT_CATEGORY_ORDER).toContain(MOVEMENT_SNACKS[id]!.category);
    }
  });

  it('every context a movement claims is a real context id', () => {
    for (const id of MOVEMENT_ORDER) {
      for (const ctx of MOVEMENT_SNACKS[id]!.contexts) {
        expect(MOVEMENT_CONTEXT_ORDER).toContain(ctx);
      }
    }
  });

  it('MOVEMENTS_BY_CATEGORY exactly partitions MOVEMENT_ORDER with no gaps or overlaps', () => {
    const flattened = MOVEMENT_CATEGORY_ORDER.flatMap((c) => MOVEMENTS_BY_CATEGORY[c]);
    expect([...flattened].sort()).toEqual([...MOVEMENT_ORDER].sort());
  });

  it('every context from the entry-screen picker (section 1) has at least one matching movement', () => {
    for (const ctx of MOVEMENT_CONTEXT_ORDER) {
      if (ctx === 'quick') continue; // quick has no direct context tag by design - duration-based fallback instead
      const matches = MOVEMENT_ORDER.filter((id) => MOVEMENT_SNACKS[id]!.contexts.includes(ctx));
      expect(matches.length, `no movement answers context "${ctx}"`).toBeGreaterThan(0);
    }
  });

  it('at least one active movement is quick (30s-2min) for "Just give me something quick"', () => {
    const quick = MOVEMENT_ORDER.filter((id) => MOVEMENT_SNACKS[id]!.durationSeconds <= 120);
    expect(quick.length).toBeGreaterThan(0);
  });

  it('the "I need to stay where I am" filter returns only seated-friendly movements, and it is non-empty', () => {
    const seated = seatedFriendlyMovementIds();
    expect(seated.length).toBeGreaterThan(0);
    for (const id of seated) {
      expect(MOVEMENT_SNACKS[id]!.supportedPositions).toContain('seated');
    }
  });

  it('flags a seated option exists for every context (section 21/22 accessibility)', () => {
    for (const ctx of MOVEMENT_CONTEXT_ORDER) {
      const matches = MOVEMENT_ORDER.filter((id) => MOVEMENT_SNACKS[id]!.contexts.includes(ctx));
      if (matches.length === 0) continue;
      const hasSeated = matches.some((id) => MOVEMENT_SNACKS[id]!.supportedPositions.includes('seated'));
      // Not a hard requirement for every context (e.g. a walk is standing by
      // nature) - but track it so a future audit can see the gap rather than
      // silently assuming coverage.
      if (!hasSeated) {
        expect(['meeting_lingering', 'switch_off_work', 'need_air_daylight', 'restless_stuck']).toContain(ctx);
      }
    }
  });

  it('never uses fitness-bro, gym-programming, or pseudo-medical language anywhere in the copy', () => {
    for (const id of MOVEMENT_ORDER) {
      const m = MOVEMENT_SNACKS[id]!;
      const allText = [
        m.title, m.shortDescription, m.closingPrompt, m.safetyNotes || '',
        ...m.steps.flatMap((s) => [s.instruction, s.supportingText || '']),
      ].join(' ');
      for (const pattern of BANNED_PATTERNS) {
        expect(allText, `"${id}" matched banned pattern ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('every step is a short instruction, never a large block of text (section 3)', () => {
    for (const id of MOVEMENT_ORDER) {
      for (const step of MOVEMENT_SNACKS[id]!.steps) {
        expect(step.instruction.length, `${id} step "${step.instruction}" too long`).toBeLessThan(80);
        if (step.supportingText) expect(step.supportingText.length).toBeLessThan(140);
      }
    }
  });

  it('After-Work Decompression and Shake Off the Meeting exist as flagship movements', () => {
    expect(MOVEMENT_SNACKS.after_work).toBeTruthy();
    expect(MOVEMENT_SNACKS.shake_meeting).toBeTruthy();
  });

  it('has exactly the 5 movement-feedback options from section 5, ending with the discomfort option', () => {
    expect(MOVEMENT_FEEDBACK_OPTIONS).toHaveLength(5);
    expect(MOVEMENT_FEEDBACK_OPTIONS[MOVEMENT_FEEDBACK_OPTIONS.length - 1]!.id).toBe('more_uncomfortable');
  });

  it('alternativeMovementIds never references a missing or self movement', () => {
    for (const id of MOVEMENT_ORDER) {
      for (const altId of MOVEMENT_SNACKS[id]!.alternativeMovementIds || []) {
        expect(altId).not.toBe(id);
        expect(MOVEMENT_SNACKS[altId], `${id} references missing alternative ${altId}`).toBeTruthy();
      }
    }
  });
});
