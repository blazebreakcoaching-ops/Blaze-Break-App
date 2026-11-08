import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NovaGuide } from './NovaGuide';

beforeEach(() => {
  window.localStorage.clear();
});

describe('Nova Guide illustrated walkthrough', () => {
  it('is optional and walks forward and back one step at a time', async () => {
    const user = userEvent.setup();
    render(<NovaGuide isOpen startPage="welcome" accountId="guest-a" onClose={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: /one small step at a time/i })).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByRole('heading', { name: /your calm starting place/i })).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 6')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
  });

  it('explains the current page and navigates only when the user chooses it', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    render(<NovaGuide isOpen startPage="nova" accountId="user-1" onClose={onClose} onNavigate={onNavigate} />);
    expect(screen.getByRole('heading', { name: /talk it through with nova/i })).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /talk with nova/i }));
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith('nova');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('remembers the same step when Escape closes the optional guide', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const view = render(<NovaGuide isOpen startPage="welcome" accountId="escape-user" onClose={onClose} onNavigate={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem('blaze-nova-guide-progress-v1:escape-user')).toBe('1');

    view.rerender(<NovaGuide isOpen={false} startPage="welcome" accountId="escape-user" onClose={vi.fn()} onNavigate={vi.fn()} />);
    view.rerender(<NovaGuide isOpen startPage="welcome" accountId="escape-user" onClose={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText('Step 2 of 6')).toBeInTheDocument();
  });

  it('skips without navigating, and remembers a resumable step for this account', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    render(<NovaGuide isOpen startPage="welcome" accountId="someone" onClose={onClose} onNavigate={onNavigate} />);
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /skip for now/i }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('blaze-nova-guide-progress-v1:someone')).toBe('1');
  });
});
