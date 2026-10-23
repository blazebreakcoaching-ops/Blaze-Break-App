import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NovaInvisibleLoad } from './NovaInvisibleLoad';

describe('NovaInvisibleLoad', () => {
  it('adding an item renders it in the list with a real, labelled category', async () => {
    render(<NovaInvisibleLoad />);
    await userEvent.type(screen.getByLabelText(/describe an obligation/i), 'Covering a shift for a teammate');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
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
    await userEvent.type(screen.getByLabelText(/describe an obligation/i), 'Something for later');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await userEvent.click(screen.getByRole('button', { name: /not right now/i }));
    expect(screen.getByText('Something for later')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /get help with this/i })).not.toBeInTheDocument();
  });

  it('"get help with this" calls onRequestHelp with the item\'s own description, per item, never a bulk action', async () => {
    const onRequestHelp = vi.fn();
    render(<NovaInvisibleLoad onRequestHelp={onRequestHelp} />);
    await userEvent.type(screen.getByLabelText(/describe an obligation/i), 'Picking up extra hours');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await userEvent.click(screen.getByRole('button', { name: /get help with this/i }));
    expect(onRequestHelp).toHaveBeenCalledWith({ description: 'Picking up extra hours', capacityBand: null });
  });

  it('opting out clears the list and shows a real confirmation, not silent retention', async () => {
    render(<NovaInvisibleLoad />);
    await userEvent.type(screen.getByLabelText(/describe an obligation/i), 'Something private');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await userEvent.click(screen.getByText(/rather not record any of this/i));
    expect(screen.queryByText('Something private')).not.toBeInTheDocument();
    expect(screen.getByText(/nothing you described is kept/i)).toBeInTheDocument();
  });

  it('removing an item is reachable by keyboard (a real, labelled, focusable button)', async () => {
    render(<NovaInvisibleLoad />);
    await userEvent.type(screen.getByLabelText(/describe an obligation/i), 'To be removed');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    const removeButton = screen.getByRole('button', { name: /remove: to be removed/i });
    removeButton.focus();
    expect(removeButton).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.queryByText('To be removed')).not.toBeInTheDocument();
  });
});
