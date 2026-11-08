/**
 * Small, deliberately qualitative low-energy check-in vocabulary shared
 * between web and native. Do not map responses to numeric wellbeing scores:
 * they are not equivalent to the four measured check-in sliders.
 */
export const LOW_ENERGY_OPTIONS = [
  { id: 'okay', label: "I'm doing okay", description: 'I have some energy today' },
  { id: 'managing', label: "I'm managing", description: 'Taking things as they come' },
  { id: 'low', label: "I'm running low", description: 'I need to take it easier' },
  { id: 'unsure', label: "I'm not sure", description: 'It is hard to tell right now' },
] as const;

export type LowEnergyResponse = (typeof LOW_ENERGY_OPTIONS)[number]['id'];

export function isLowEnergyResponse(value: unknown): value is LowEnergyResponse {
  return typeof value === 'string' && LOW_ENERGY_OPTIONS.some(option => option.id === value);
}
