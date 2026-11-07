import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('diagnostic learning requires persisted permission', () => {
  const server = readFileSync('server.ts', 'utf8');
  const begin = server.indexOf('// Client input is NOT proof of consent.');
  const end = server.indexOf('if (allowLearning) {', begin);
  const consentGate = begin >= 0 && end > begin ? server.slice(begin, end) : '';

  it('does not trust request-provided learning choices on failed reads', () => {
    expect(consentGate).toContain('let allowLearning = false');
    expect(consentGate).toContain('allowLearning = false;');
    expect(consentGate).not.toContain('let allowLearning = letNovaLearn');
  });
  it('requires an explicit stored true, not a missing or unchecked setting', () => {
    expect(consentGate).toContain('permSnap.exists');
    expect(consentGate).toContain('permSnap.data()?.allowNovaMemory === true');
    expect(consentGate).not.toContain('!== false');
  });
});
