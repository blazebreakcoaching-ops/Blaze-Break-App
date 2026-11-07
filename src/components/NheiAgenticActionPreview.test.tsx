import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NheiAgenticActionPreview } from './NheiAgenticActionPreview';

describe('NheiAgenticActionPreview', () => {
  it('declining ("permission denial") stops the flow before any simulated execution', async () => {
    render(<NheiAgenticActionPreview />);
    await userEvent.click(screen.getByRole('button', { name: /show a worked example/i }));
    await userEvent.click(screen.getByRole('button', { name: /decline/i }));
    expect(screen.getByText(/you declined this.*nothing was changed/i)).toBeInTheDocument();
  });

  it('approving reaches a simulated "executing" state before resolving', async () => {
    render(<NheiAgenticActionPreview />);
    await userEvent.click(screen.getByRole('button', { name: /show a worked example/i }));
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(screen.getByText(/simulating the connector/i)).toBeInTheDocument();
  });

  it('approving resolves to confirmed, and undo is offered since this category genuinely supports it', async () => {
    render(<NheiAgenticActionPreview />);
    await userEvent.click(screen.getByRole('button', { name: /show a worked example/i }));
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => expect(screen.getByText(/confirmed by the \(fake\) connector/i)).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
  });

  it('external action failure: the simulate-failure toggle resolves to a visible, non-auto-retried failure state', async () => {
    render(<NheiAgenticActionPreview />);
    await userEvent.click(screen.getByRole('checkbox', { name: /simulate a connector failure/i }));
    await userEvent.click(screen.getByRole('button', { name: /show a worked example/i }));
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => expect(screen.getByText(/simulated failure.*never auto-retried/i)).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
  });

  it('the suggested -> awaiting_approval -> approved/declined state label is real and visible, not decorative', async () => {
    render(<NheiAgenticActionPreview />);
    await userEvent.click(screen.getByRole('button', { name: /show a worked example/i }));
    expect(screen.getByText(/state: awaiting_approval/i)).toBeInTheDocument();
  });
});
