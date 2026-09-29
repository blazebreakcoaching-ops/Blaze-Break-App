// Guards the one property that actually matters for this file: it must
// stay a faithful, scorable copy of DiagnoseSection.tsx's question bank.
// server.ts scores by question id, so a typo'd or missing id here would
// silently break scoring for mobile users without ever throwing.
import { QUESTIONS, QUICK_CHECK_IDS } from './diagnose-questions';

describe('diagnose-questions', () => {
  it('has 14 questions, each with a unique id and exactly 4 options', () => {
    expect(QUESTIONS).toHaveLength(14);
    const ids = QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of QUESTIONS) {
      expect(q.options).toHaveLength(4);
      expect(q.options.map((o) => o.value).sort()).toEqual([1, 2, 3, 4]);
    }
  });

  it('every QUICK_CHECK_IDS entry corresponds to a real question', () => {
    const ids = new Set(QUESTIONS.map((q) => q.id));
    for (const id of QUICK_CHECK_IDS) {
      expect(ids.has(id)).toBe(true);
    }
    expect(QUICK_CHECK_IDS).toHaveLength(7);
  });
});
