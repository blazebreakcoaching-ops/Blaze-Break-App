import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NovaPracticalAssistanceOffer } from './NovaPracticalAssistanceOffer';

// This card never starts, proposes or changes anything itself - it only
// ever calls back to its host (NovaChat.tsx / NovaVoiceCall.tsx), which
// decides what "Open" actually does. These tests only prove the card's own
// contract: it shows the reason it was given, and both its buttons fire
// exactly once per click with no other side effect.
describe('NovaPracticalAssistanceOffer', () => {
  it('shows the given reason', () => {
    render(<NovaPracticalAssistanceOffer reason="You mentioned three deadlines this week." onOpen={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText('You mentioned three deadlines this week.')).toBeInTheDocument();
  });

  it('calls onOpen when the primary action is chosen', async () => {
    const onOpen = vi.fn();
    render(<NovaPracticalAssistanceOffer reason="reason" onOpen={onOpen} onDismiss={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /review what's on my plate/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss from the "Not right now" link without calling onOpen', async () => {
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    render(<NovaPracticalAssistanceOffer reason="reason" onOpen={onOpen} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: /not right now/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('calls onDismiss from the close (X) button too', async () => {
    const onDismiss = vi.fn();
    render(<NovaPracticalAssistanceOffer reason="reason" onOpen={vi.fn()} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: /dismiss this suggestion/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
