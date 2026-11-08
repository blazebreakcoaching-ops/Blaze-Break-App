import { describe, expect, it } from 'vitest';
import fs from 'fs';

// The voice journal used to cycle invented "analysis stages" on a timer
// (e.g. "Decoding lexical biomarkers...", "Evaluating cognitive fatigue
// index...") that did not correspond to any real processing and were not
// announced to screen readers. Lock the honest replacement in place.
const source = fs.readFileSync('src/components/SixtySecondCheckIn.tsx', 'utf8');

describe('voice journal progress is honest and accessible', () => {
  it('contains no invented processing stages or timer-driven status', () => {
    expect(source).not.toMatch(/lexical biomarkers|cognitive fatigue index|emotional frequencies|raw signal feed|Nova Brain Syncing/);
    expect(source).not.toMatch(/statusInterval|setInterval\(\(\) => \{\s*if \(step/);
  });

  it('announces its one status line to screen readers', () => {
    expect(source).toMatch(/<p role="status" aria-live="polite"[^>]*>\{analysisStatus\}<\/p>/);
  });

  it('offers typing as an alternative when the microphone is unavailable', () => {
    expect(source).toMatch(/type to Nova instead/);
  });
});
