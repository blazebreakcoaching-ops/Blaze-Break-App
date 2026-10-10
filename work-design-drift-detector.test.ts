import { describe, it, expect } from 'vitest';
import { checkWorkDesignDrift, type LocalOperatingPrinciple } from './work-design-drift-detector';

const principle: LocalOperatingPrinciple = { signalKey: 'meeting_pressure', label: 'Meeting Pressure', promotedAt: '2026-01-01T00:00:00.000Z' };

describe('checkWorkDesignDrift', () => {
  it('returns null when the current band is low', () => {
    expect(checkWorkDesignDrift(principle, 'low')).toBeNull();
  });

  it('returns null when the current band is typical', () => {
    expect(checkWorkDesignDrift(principle, 'typical')).toBeNull();
  });

  it('returns null when the current band is unknown (insufficient data) - never treated as regression', () => {
    expect(checkWorkDesignDrift(principle, null)).toBeNull();
  });

  it('flags drift when the current band is elevated', () => {
    const finding = checkWorkDesignDrift(principle, 'elevated');
    expect(finding).not.toBeNull();
    expect(finding?.signalKey).toBe('meeting_pressure');
    expect(finding?.message).toContain('Meeting Pressure');
    expect(finding?.message).toContain('Elevated');
  });

  it('flags drift when the current band is sustained', () => {
    const finding = checkWorkDesignDrift(principle, 'sustained');
    expect(finding).not.toBeNull();
    expect(finding?.message).toContain('Sustained');
  });
});
