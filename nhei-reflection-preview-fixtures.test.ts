import { describe, it, expect } from 'vitest';
import { NHEI_REFLECTION_PREVIEW_FIXTURES, allPreviewEntries } from './nhei-reflection-preview-fixtures';

describe('NHEI reflection preview fixtures - structural integrity', () => {
  it('spans at least two genuinely distinct episodes', () => {
    const episodeIds = new Set(NHEI_REFLECTION_PREVIEW_FIXTURES.map((e) => e.episodeId));
    expect(episodeIds.size).toBeGreaterThanOrEqual(2);
  });

  it('every entry’s episodeId matches the episode group it is nested under', () => {
    for (const episode of NHEI_REFLECTION_PREVIEW_FIXTURES) {
      for (const entry of episode.entries) {
        expect(entry.episodeId).toBe(episode.episodeId);
      }
    }
  });

  it('a hypothesis entry always carries a tentative interpretation, clearly distinct from the reported text', () => {
    for (const entry of allPreviewEntries()) {
      if (entry.confirmationState === 'hypothesis') {
        expect(entry.novaTentativeInterpretation).toBeTruthy();
        expect(entry.novaTentativeInterpretation).not.toBe(entry.reportedText);
      }
    }
  });

  it('a confirmed entry never carries a tentative interpretation - confirmed information is never re-hedged', () => {
    for (const entry of allPreviewEntries()) {
      if (entry.confirmationState === 'confirmed') {
        expect(entry.novaTentativeInterpretation).toBeNull();
      }
    }
  });

  it('a disputed entry never carries a tentative interpretation - a withdrawn hypothesis is never shown as if still live', () => {
    for (const entry of allPreviewEntries()) {
      if (entry.confirmationState === 'disputed') {
        expect(entry.novaTentativeInterpretation).toBeNull();
      }
    }
  });

  it('every entry has at least one self-system and one dimension', () => {
    for (const entry of allPreviewEntries()) {
      expect(entry.selfSystems.length).toBeGreaterThan(0);
      expect(entry.dimensions.length).toBeGreaterThan(0);
    }
  });

  it('no tentative interpretation text asserts a third party’s private beliefs', () => {
    for (const entry of allPreviewEntries()) {
      if (entry.novaTentativeInterpretation) {
        expect(entry.novaTentativeInterpretation.toLowerCase()).not.toMatch(/they (think|believe|feel|wanted)/);
      }
    }
  });
});
