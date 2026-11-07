import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountDataLoadGate } from './AccountDataLoadGate';

describe('account-data load protection', () => {
  it('does not display account information while the owner is unresolved', () => {
    render(<AccountDataLoadGate error={false} onRetry={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your account');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
  it('shows a clear retry when the saved data cannot be verified', () => {
    const retry = vi.fn();
    render(<AccountDataLoadGate error onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('saved information has not been changed');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
