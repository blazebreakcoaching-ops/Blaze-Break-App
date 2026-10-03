import { describe, it, expect } from 'vitest';
import {
  SHIELD_STATE_ORDER, SHIELD_STATUS_LABELS, SHIELD_STATUS_MESSAGES, SHIELD_STATUS_SUBTEXT,
  computeManualLoadScore, ManualLoadInput, computeIntegrationLoadScore, scoreToShieldState,
  NOVA_OVERLOAD_SHIELD_HEADER_QUOTE, CHECK_TODAYS_LOAD_LABEL, GUARDIAN_DISPATCH_LINE,
  buildEnergyBudgetNote, buildCapacitySignalLine, containsNovaOverloadShieldBannedPhrase,
  NOVA_OVERLOAD_SHIELD_BANNED_PHRASES,
} from './nova-overload-shield-engine';

const baseManualInput: ManualLoadInput = {
  meetings: 2, hours: 6, messagePressure: 'low', sleepQuality: 'good', energyLevel: 'high', recoveryGaps: 'yes',
};

describe('Nova Overload Shield: human status language, never red/amber/green risk labels', () => {
  it('has a label, message, and subtext for all three states', () => {
    SHIELD_STATE_ORDER.forEach((state) => {
      expect(SHIELD_STATUS_LABELS[state]).toBeTruthy();
      expect(SHIELD_STATUS_MESSAGES[state]).toBeTruthy();
      expect(SHIELD_STATUS_SUBTEXT[state]).toBeTruthy();
    });
  });

  it('uses the spec example phrases, not Green/Amber/Red', () => {
    expect(SHIELD_STATUS_LABELS.stable).toBe('Today looks manageable');
    expect(SHIELD_STATUS_LABELS.drifting).toBe('Getting tight');
    expect(SHIELD_STATUS_LABELS.overload).toBe('Over capacity');
    Object.values(SHIELD_STATUS_LABELS).forEach((label) => {
      expect(label).not.toMatch(/green|amber|red/i);
    });
  });
});

describe('Manual load score: matches the pre-existing per-factor thresholds', () => {
  it('scores a light day as zero', () => {
    expect(computeManualLoadScore(baseManualInput)).toBe(0);
  });

  it('accumulates points per factor', () => {
    const heavy: ManualLoadInput = {
      meetings: 6, hours: 11, messagePressure: 'high', sleepQuality: 'poor', energyLevel: 'low', recoveryGaps: 'no',
    };
    expect(computeManualLoadScore(heavy)).toBe(12);
  });

  it('awards partial points at the middle thresholds', () => {
    const mid: ManualLoadInput = {
      meetings: 4, hours: 9, messagePressure: 'medium', sleepQuality: 'fair', energyLevel: 'medium', recoveryGaps: 'yes',
    };
    expect(computeManualLoadScore(mid)).toBe(5);
  });
});

describe('Integration load score: only counts connected integrations', () => {
  it('ignores disconnected integrations entirely', () => {
    const score = computeIntegrationLoadScore([
      { status: 'connected', scoreContribution: 2 },
      { status: 'disconnected', scoreContribution: 2 },
    ]);
    expect(score).toBe(2);
  });
});

describe('Score to state thresholds', () => {
  it('matches the existing 4/7 boundaries', () => {
    expect(scoreToShieldState(0)).toBe('stable');
    expect(scoreToShieldState(3)).toBe('stable');
    expect(scoreToShieldState(4)).toBe('drifting');
    expect(scoreToShieldState(6)).toBe('drifting');
    expect(scoreToShieldState(7)).toBe('overload');
  });
});

describe('No guaranteed-prevention or fabricated-signal claims', () => {
  it('the header quote never claims to prevent the crash', () => {
    expect(containsNovaOverloadShieldBannedPhrase(NOVA_OVERLOAD_SHIELD_HEADER_QUOTE)).toBe(false);
  });

  it('the Guardian Dispatch line never claims biometric data or a systemic crash', () => {
    expect(containsNovaOverloadShieldBannedPhrase(GUARDIAN_DISPATCH_LINE)).toBe(false);
  });

  it('flags the retired credit-system phrase as banned', () => {
    expect(NOVA_OVERLOAD_SHIELD_BANNED_PHRASES).toContain('deducting credits');
    expect(containsNovaOverloadShieldBannedPhrase('is currently deducting credits from your budget')).toBe(true);
  });

  it('"Check Today\'s Load" replaces the old "Calculate Risk" label', () => {
    expect(CHECK_TODAYS_LOAD_LABEL).toBe("Check Today's Load");
  });
});

describe('Energy Budget note: reflects the real Energy Delta model, not the retired credit system', () => {
  it('names connected integrations honestly without a fabricated credit claim', () => {
    const note = buildEnergyBudgetNote(2);
    expect(note).toMatch(/Energy Delta/);
    expect(containsNovaOverloadShieldBannedPhrase(note)).toBe(false);
  });

  it('is honest when nothing is connected yet', () => {
    expect(buildEnergyBudgetNote(0)).toMatch(/Connect an integration/);
  });

  it('pluralises correctly', () => {
    expect(buildEnergyBudgetNote(1)).toContain('1 connected integration ');
    expect(buildEnergyBudgetNote(3)).toContain('3 connected integrations ');
  });
});

describe('Capacity signal line: honest third signal, never fabricated when unchecked', () => {
  it('is honest when capacity has not been checked', () => {
    expect(buildCapacitySignalLine(null, null)).toBe('Capacity not checked today');
  });

  it('reflects a comfortable buffer', () => {
    expect(buildCapacitySignalLine(80, 20)).toMatch(/comfortable room/);
  });

  it('reflects being over capacity', () => {
    expect(buildCapacitySignalLine(30, 70)).toMatch(/already over capacity/);
  });
});
