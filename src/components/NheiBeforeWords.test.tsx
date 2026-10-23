import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NheiBeforeWords } from './NheiBeforeWords';

describe('NheiBeforeWords', () => {
  it('starts at intro and moves to free expression with a real, focusable textarea', async () => {
    render(<NheiBeforeWords />);
    await userEvent.click(screen.getByRole('button', { name: /start whenever you're ready/i }));
    const textarea = screen.getByLabelText(/free expression/i);
    expect(textarea.tagName).toBe('TEXTAREA');
    await userEvent.click(textarea);
    expect(textarea).toHaveFocus();
  });

  it('typing free text and continuing reaches the optional prompts step, where every prompt is individually skippable', async () => {
    render(<NheiBeforeWords />);
    await userEvent.click(screen.getByRole('button', { name: /start whenever you're ready/i }));
    await userEvent.type(screen.getByLabelText(/free expression/i), 'It has been a lot.');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText(/a few optional questions/i)).toBeInTheDocument();
    const skipButtons = screen.getAllByRole('button', { name: /^skip:/i });
    expect(skipButtons.length).toBeGreaterThan(0);
    await userEvent.click(skipButtons[0]);
    expect(screen.getByText(/skipped/i)).toBeInTheDocument();
  });

  it('the retain-as-reflection control is visibly present but genuinely disabled, not silently omitted', async () => {
    render(<NheiBeforeWords />);
    await userEvent.click(screen.getByRole('button', { name: /start whenever you're ready/i }));
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    const retainButton = screen.getByRole('button', { name: /save this as a reflection/i });
    expect(retainButton).toBeDisabled();
    expect(retainButton).toHaveAttribute('aria-disabled', 'true');
  });

  it('"done for now" reaches the final, non-retaining step', async () => {
    render(<NheiBeforeWords />);
    await userEvent.click(screen.getByRole('button', { name: /start whenever you're ready/i }));
    await userEvent.click(screen.getByRole('button', { name: /i'd rather not write anything right now/i }));
    expect(screen.getByText(/doesn't retain anything you wrote/i)).toBeInTheDocument();
  });

  it('Phase 5D directive §6: proceeding without retaining after writing something still offers a temporary, session-only context to Nova', async () => {
    render(<NheiBeforeWords />);
    await userEvent.click(screen.getByRole('button', { name: /start whenever you're ready/i }));
    await userEvent.type(screen.getByLabelText(/free expression/i), 'Work has been relentless.');
    await userEvent.click(screen.getByRole('button', { name: /i'd rather not write anything right now/i }));
    expect(screen.getByText(/available to nova for this conversation only/i)).toBeInTheDocument();
  });

  it('proceeding with nothing written at all shows there is nothing for Nova to use', async () => {
    render(<NheiBeforeWords />);
    await userEvent.click(screen.getByRole('button', { name: /start whenever you're ready/i }));
    await userEvent.click(screen.getByRole('button', { name: /i'd rather not write anything right now/i }));
    expect(screen.getByText(/nothing was shared/i)).toBeInTheDocument();
  });
});
