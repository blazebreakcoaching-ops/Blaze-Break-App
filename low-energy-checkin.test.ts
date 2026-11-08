import { describe, it, expect } from 'vitest';
import { isLowEnergyResponse, LOW_ENERGY_OPTIONS } from './low-energy-checkin';

describe('low-energy check-in vocabulary', () => {
  it('has four unique, plainly labelled choices', () => {
    expect(LOW_ENERGY_OPTIONS).toHaveLength(4);
    expect(new Set(LOW_ENERGY_OPTIONS.map(option => option.id)).size).toBe(4);
    expect(LOW_ENERGY_OPTIONS.every(option => option.label && option.description)).toBe(true);
  });
  it('accepts only supported qualitative responses', () => {
    LOW_ENERGY_OPTIONS.forEach(option => expect(isLowEnergyResponse(option.id)).toBe(true));
    for (const value of [null, 0, 'exhausted', '', {}, '10']) {
      expect(isLowEnergyResponse(value)).toBe(false);
    }
  });
  it('does not provide or infer numeric wellbeing scores', () => {
    for (const option of LOW_ENERGY_OPTIONS) {
      expect(Object.keys(option)).toEqual(['id', 'label', 'description']);
    }
  });
});
