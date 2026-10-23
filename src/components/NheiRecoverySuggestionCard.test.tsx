import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NheiRecoverySuggestionCard } from './NheiRecoverySuggestionCard';
import { arbitrateNheiRecoverySuggestions } from '../../nhei-recovery-arbitration';
import type { NheiRecoverySuggestion } from '../../nhei-recovery-bridge-types';

function syntheticSuggestion(overrides: Partial<NheiRecoverySuggestion> & Pick<NheiRecoverySuggestion, 'targetModule' | 'routeType'>): NheiRecoverySuggestion {
  return {
    suggestionId: `${overrides.targetModule}_test`,
    relevantCapabilityLabel: overrides.targetModule,
    reason: 'Test reason.',
    explanationForUser: 'Test explanation.',
    evidenceReferences: [],
    selfSystems: ['INTERNAL_SELF'],
    dimensions: ['EMOTIONAL'],
    interpretationKind: 'tentative',
    safetyRestrictions: ['not_diagnostic'],
    consentPrerequisite: 'routing_insights',
    capacitySuitability: 'suitable',
    matchesStatedGoal: false,
    matchingExistingCandidateId: null,
    alternativeModules: [],
    ...overrides,
  };
}

describe('NheiRecoverySuggestionCard', () => {
  it('renders the selected suggestion\'s reason and explanation as real text', () => {
    const arbitration = arbitrateNheiRecoverySuggestions({
      suggestions: [syntheticSuggestion({ targetModule: 'reset_studio', routeType: 'STABILISE', interpretationKind: 'confirmed' })],
    });
    render(<NheiRecoverySuggestionCard arbitration={arbitration} />);
    expect(screen.getByText('Test reason.')).toBeInTheDocument();
  });

  it('declining all ("Not now") moves the card into its declined state, via a real button, not a cosmetic control', async () => {
    const arbitration = arbitrateNheiRecoverySuggestions({
      suggestions: [syntheticSuggestion({ targetModule: 'reset_studio', routeType: 'STABILISE', interpretationKind: 'confirmed' })],
    });
    render(<NheiRecoverySuggestionCard arbitration={arbitration} />);
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.getByText(/not right now.*won't repeat this suggestion/i)).toBeInTheDocument();
  });

  it('an abstention (no suitable suggestion) renders an explicit reason, never an empty card', () => {
    const arbitration = arbitrateNheiRecoverySuggestions({ suggestions: [] });
    render(<NheiRecoverySuggestionCard arbitration={arbitration} />);
    expect(screen.getByText('No suggestion right now')).toBeInTheDocument();
    expect(screen.getByText(/nothing in what you.ve shared points to a specific suggestion/i)).toBeInTheDocument();
  });

  it('the accept ("Try ...") button is a real, keyboard-focusable control that fires onAccept', async () => {
    const onAccept = vi.fn();
    const arbitration = arbitrateNheiRecoverySuggestions({
      suggestions: [syntheticSuggestion({ targetModule: 'reset_studio', routeType: 'STABILISE', interpretationKind: 'confirmed' })],
    });
    render(<NheiRecoverySuggestionCard arbitration={arbitration} onAccept={onAccept} />);
    const acceptButton = screen.getByRole('button', { name: /try reset_studio/i });
    acceptButton.focus();
    expect(acceptButton).toHaveFocus();
    await userEvent.click(acceptButton);
    expect(onAccept).toHaveBeenCalled();
  });
});
