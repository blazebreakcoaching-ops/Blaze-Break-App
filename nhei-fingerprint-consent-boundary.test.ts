import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hasExplicitNovaLearningConsent } from './src/lib/nova-learning-consent';

const source = readFileSync('src/components/DiagnoseSection.tsx', 'utf8');
const viewStart = source.indexOf('export const DiagnoseView =');
const viewEnd = source.indexOf('export const ', viewStart + 1);
const view = source.slice(viewStart, viewEnd < 0 ? undefined : viewEnd);

describe('Burnout Fingerprint opt-in and error boundaries', () => {
  it('never treats missing or migrated consent as explicit permission', () => {
    for (const value of [undefined, null, false, 1, 'true', {}, []]) {
      expect(hasExplicitNovaLearningConsent(value)).toBe(false);
    }
    expect(hasExplicitNovaLearningConsent(true)).toBe(true);
  });
  it('starts with learning off and verifies account ownership of any locally stored answer', () => {
    expect(view).toContain('let letNovaLearn = false;');
    expect(view).toContain("localStorage.getItem('blaze_profile_uid') === uid");
    expect(view).toContain('hasExplicitNovaLearningConsent(parsed?.letNovaLearn)');
    expect(view).toContain('letNovaLearn = false;');
  });
  it('preserves answer IDs and numeric option values in the original fingerprint scoring model', () => {
    expect(view).toContain('answers: finalAnswers, letNovaLearn');
    expect(view).toContain('handleAnswer(option.value)');
    expect(view).toContain("questions.filter((q) => QUICK_CHECK_IDS.includes(q.id))");
  });
  it('clears private answers and discards late assessment results after account changes', () => {
    expect(view).toContain("const { user } = useAuth()");
    expect(view).toContain('requestGeneration.current += 1');
    expect(view).toContain("}, [user?.uid])");
    expect(view).toContain("uid !== user?.uid");
    expect(view).toContain("auth.currentUser?.uid !== uid || requestGeneration.current !== generation");
    expect(view).toContain("setAnswers({}); setMode('choice'); setStep(0)");
  });
  it('does not render raw backend errors and gives the member a working retry', () => {
    expect(view).toContain("throw new Error('assessment_failed')");
    expect(view).toContain("setError(t('common.tryAgain'))");
    expect(view).toContain("setError(null); setLoading(false); setStep(0); setMode('choice')");
    expect(view).not.toContain('setError(err.message');
  });
});
