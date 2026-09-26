// Guards the shape NervousSystemReset.tsx's screen relies on: every
// breathing technique needs an instruction string to display, every
// grounding technique needs a non-empty, unique-keyed step list (the
// screen's completion logic checks completedSteps.length against
// instructions.length, so a technique with zero steps could never
// actually be completed).
import { BREATHING_MODES, GROUNDING_MODES } from './reset-techniques';

describe('reset-techniques', () => {
  it('has 7 breathing techniques with unique keys and non-empty copy', () => {
    expect(BREATHING_MODES).toHaveLength(7);
    const keys = BREATHING_MODES.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const mode of BREATHING_MODES) {
      expect(mode.name.length).toBeGreaterThan(0);
      expect(mode.description.length).toBeGreaterThan(0);
      expect(mode.instruction.length).toBeGreaterThan(0);
    }
  });

  it('has 7 grounding techniques with unique keys and exactly 5 steps each', () => {
    expect(GROUNDING_MODES).toHaveLength(7);
    const keys = GROUNDING_MODES.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const mode of GROUNDING_MODES) {
      expect(mode.instructions).toHaveLength(5);
      for (const step of mode.instructions) {
        expect(step.length).toBeGreaterThan(0);
      }
    }
  });
});
