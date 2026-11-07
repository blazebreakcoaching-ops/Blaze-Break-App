import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReturnToNovaLink } from './ReturnToNovaLink';

describe('ReturnToNovaLink', () => {
  it('renders a visible, accessible "Return to Nova chat" affordance', () => {
    render(<ReturnToNovaLink onNavigate={() => {}} />);
    expect(screen.getByRole('button', { name: /return to nova chat/i })).toBeInTheDocument();
  });

  it('calls onNavigate with the "nova" tab id when clicked', async () => {
    const onNavigate = vi.fn();
    render(<ReturnToNovaLink onNavigate={onNavigate} />);
    await userEvent.click(screen.getByRole('button', { name: /return to nova chat/i }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('nova');
  });
});
