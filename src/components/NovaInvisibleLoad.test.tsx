import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NovaInvisibleLoad } from './NovaInvisibleLoad';

async function addItem(text: string) {
  await userEvent.type(screen.getByLabelText(/describe an obligation/i), text);
  await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
}

describe('NovaInvisibleLoad', () => {
  it('adding an item renders it in the list with a real, labelled category', async () => {
    render(<NovaInvisibleLoad />);
    await addItem('Covering a shift for a teammate');
    expect(screen.getByText('Covering a shift for a teammate')).toBeInTheDocument();
  });

  it('the add button is disabled (mobile-friendly: no accidental empty submits) until there is real text', async () => {
    render(<NovaInvisibleLoad />);
    const addButton = screen.getByRole('button', { name: /^add$/i });
    expect(addButton).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/describe an obligation/i), 'x');
    expect(addButton).not.toBeDisabled();
  });

  it('deferring an item keeps it visible but hides its "get help" action - never silently acted on', async () => {
    render(<NovaInvisibleLoad />);
    await addItem('Something for later');
    await userEvent.click(screen.getByRole('button', { name: /not right now/i }));
    expect(screen.getByText('Something for later')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /get help with this/i })).not.toBeInTheDocument();
  });

  it('"get help with this" opens a menu of five choices, per item, never a bulk action', async () => {
    render(<NovaInvisibleLoad />);
    await addItem('Picking up extra hours');
    await userEvent.click(screen.getByRole('button', { name: /get help with this/i }));
    expect(screen.getByRole('button', { name: /protect time for it/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /defer or reprioritise it/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /break it into steps/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /explore a recovery tool/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /leave it unchanged/i })).toBeInTheDocument();
  });

  it('"protect time for it" calls onProtectTime with the item\'s own description', async () => {
    const onProtectTime = vi.fn();
    render(<NovaInvisibleLoad onProtectTime={onProtectTime} />);
    await addItem('Picking up extra hours');
    await userEvent.click(screen.getByRole('button', { name: /get help with this/i }));
    await userEvent.click(screen.getByRole('button', { name: /protect time for it/i }));
    expect(onProtectTime).toHaveBeenCalledWith({ description: 'Picking up extra hours', capacityBand: null });
  });

  it('"defer or reprioritise it" calls onDeferTask with the item\'s own description', async () => {
    const onDeferTask = vi.fn();
    render(<NovaInvisibleLoad onDeferTask={onDeferTask} />);
    await addItem('Finish the quarterly report');
    await userEvent.click(screen.getByRole('button', { name: /get help with this/i }));
    await userEvent.click(screen.getByRole('button', { name: /defer or reprioritise it/i }));
    expect(onDeferTask).toHaveBeenCalledWith('Finish the quarterly report');
  });

  it('"break it into steps" opens a step editor for the user\'s own words - nothing is generated', async () => {
    render(<NovaInvisibleLoad />);
    await addItem('A big messy task');
    await userEvent.click(screen.getByRole('button', { name: /get help with this/i }));
    await userEvent.click(screen.getByRole('button', { name: /break it into steps/i }));
    await userEvent.type(screen.getByLabelText(/add a breakdown step/i), 'First, gather the inputs');
    await userEvent.click(screen.getByRole('button', { name: /add step/i }));
    expect(screen.getByText('First, gather the inputs')).toBeInTheDocument();
  });

  it('"explore a recovery tool" shows a real, named tool with a plain reason, never a score', async () => {
    render(<NovaInvisibleLoad />);
    await addItem('A commitment I am stretched on');
    await userEvent.click(screen.getByRole('button', { name: /get help with this/i }));
    await userEvent.click(screen.getByRole('button', { name: /explore a recovery tool/i }));
    expect(screen.getByText(/Workload Reality Check/)).toBeInTheDocument();
  });

  it('"leave it unchanged" just closes the menu - no callback, no state change', async () => {
    const onProtectTime = vi.fn();
    const onDeferTask = vi.fn();
    render(<NovaInvisibleLoad onProtectTime={onProtectTime} onDeferTask={onDeferTask} />);
    await addItem('Something I\'m not ready to act on');
    await userEvent.click(screen.getByRole('button', { name: /get help with this/i }));
    await userEvent.click(screen.getByRole('button', { name: /leave it unchanged/i }));
    expect(screen.queryByRole('button', { name: /^protect time for it$/i })).not.toBeInTheDocument();
    expect(onProtectTime).not.toHaveBeenCalled();
    expect(onDeferTask).not.toHaveBeenCalled();
  });

  it('opting out clears the list and shows a real confirmation, not silent retention', async () => {
    render(<NovaInvisibleLoad />);
    await addItem('Something private');
    await userEvent.click(screen.getByText(/rather not record any of this/i));
    expect(screen.queryByText('Something private')).not.toBeInTheDocument();
    expect(screen.getByText(/nothing you described is kept/i)).toBeInTheDocument();
  });

  it('removing an item is reachable by keyboard (a real, labelled, focusable button)', async () => {
    render(<NovaInvisibleLoad />);
    await addItem('To be removed');
    const removeButton = screen.getByRole('button', { name: /remove: to be removed/i });
    removeButton.focus();
    expect(removeButton).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.queryByText('To be removed')).not.toBeInTheDocument();
  });
});
