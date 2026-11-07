import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NovaCoachMarks } from './NovaCoachMarks';

const originalScroll = Element.prototype.scrollIntoView;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  document.querySelectorAll('[data-nova-guide-target]').forEach(node => node.remove());
  Element.prototype.scrollIntoView = originalScroll;
});

describe('Nova Guide coach marks', () => {
  it('guides through actual page controls one at a time, then closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<NovaCoachMarks page="home" onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: /start where you are/i })).toBeInTheDocument();
    expect(screen.getByText('Tip 1 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByRole('heading', { name: /talk it through/i })).toBeInTheDocument();
    expect(screen.getByText('Tip 2 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText('Tip 1 of 3')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('offers an honest fallback when a lazy target is not mounted', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<NovaCoachMarks page="plan" onClose={onClose} />);
    expect(screen.getByText(/isn't visible yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try it myself/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /got it/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('highlights an actual matching element and offers a voluntary Try it control', async () => {
    const target = document.createElement('button');
    target.setAttribute('data-nova-guide-target', 'nova-show-how');
    target.getBoundingClientRect = () => ({
      x: 15, y: 75, top: 75, left: 15, bottom: 120, right: 160,
      width: 145, height: 45, toJSON: () => ({}),
    } as DOMRect);
    document.body.append(target);
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<NovaCoachMarks page="nova" onClose={onClose} />);
    expect(await screen.findByTestId('nova-guide-highlight')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /try it myself/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
