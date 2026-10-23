import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NovaAgenticJourney } from './NovaAgenticJourney';

// NovaAgenticJourney is, by its own header, "a thin sequencer... no new
// business logic" - these tests exercise exactly that sequencing (which
// step follows which, and that Back/Start over actually move backward),
// not the real behaviour of the four heavy components it wraps (each
// already has its own test suite). Every heavy child is stubbed to a
// minimal marker plus the handful of controls this file's own sequencing
// logic depends on.

vi.mock('./NheiBeforeWords', () => ({
  NheiBeforeWords: ({ onDecided }: { onDecided: (c: any) => void }) => (
    <div data-testid="before-words">
      <button onClick={() => onDecided({ kind: 'temporary_before_words_context', freeExpressionText: 'x', promptResponses: [], corrections: [], hasUncertainty: false, persisted: false })}>Decide</button>
    </div>
  ),
}));
vi.mock('./NovaChat', () => ({ NovaChat: () => <div data-testid="nova-chat" /> }));
vi.mock('./NovaInvisibleLoad', () => ({
  NovaInvisibleLoad: ({ onProtectTime, onDeferTask }: { onProtectTime: (p: any) => void; onDeferTask: (t: string) => void }) => (
    <div data-testid="invisible-load">
      <button onClick={() => onProtectTime({ description: 'Protect this', capacityBand: null })}>Protect</button>
      <button onClick={() => onDeferTask('Defer this task')}>Defer</button>
    </div>
  ),
}));
vi.mock('./NovaTakeTheLoad', () => ({ NovaTakeTheLoad: ({ initialTitle }: { initialTitle: string }) => <div data-testid="calendar-protection">{initialTitle}</div> }));
vi.mock('./NovaTaskDeferral', () => ({ NovaTaskDeferral: ({ initialTaskDescription }: { initialTaskDescription: string }) => <div data-testid="task-deferral">{initialTaskDescription}</div> }));

describe('NovaAgenticJourney - sequencing', () => {
  it('the entry step offers both Before Words and direct chat, with no step forced', () => {
    render(<NovaAgenticJourney />);
    expect(screen.getByRole('button', { name: /say what's on your mind first/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /just talk to nova/i })).toBeInTheDocument();
  });

  it('choosing "Just talk to Nova" skips Before Words entirely', async () => {
    render(<NovaAgenticJourney />);
    await userEvent.click(screen.getByRole('button', { name: /just talk to nova/i }));
    expect(screen.queryByTestId('before-words')).not.toBeInTheDocument();
    expect(screen.getByTestId('nova-chat')).toBeInTheDocument();
  });

  it('choosing Before Words first still reaches chat afterward', async () => {
    render(<NovaAgenticJourney />);
    await userEvent.click(screen.getByRole('button', { name: /say what's on your mind first/i }));
    expect(screen.getByTestId('before-words')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /decide/i }));
    expect(screen.getByTestId('nova-chat')).toBeInTheDocument();
  });

  it('"Protect time for it" from Invisible Load routes to Calendar Protection, pre-filled', async () => {
    render(<NovaAgenticJourney />);
    await userEvent.click(screen.getByRole('button', { name: /just talk to nova/i }));
    await userEvent.click(screen.getByRole('button', { name: /continue to what's on your plate/i }));
    await userEvent.click(screen.getByRole('button', { name: /^protect$/i }));
    expect(screen.getByTestId('calendar-protection')).toHaveTextContent('Protect this');
  });

  it('"Defer or reprioritise" from Invisible Load routes to Task Deferral, pre-filled', async () => {
    render(<NovaAgenticJourney />);
    await userEvent.click(screen.getByRole('button', { name: /just talk to nova/i }));
    await userEvent.click(screen.getByRole('button', { name: /continue to what's on your plate/i }));
    await userEvent.click(screen.getByRole('button', { name: /^defer$/i }));
    expect(screen.getByTestId('task-deferral')).toHaveTextContent('Defer this task');
  });

  it('Back returns to the previous step rather than only to the start', async () => {
    render(<NovaAgenticJourney />);
    await userEvent.click(screen.getByRole('button', { name: /just talk to nova/i }));
    await userEvent.click(screen.getByRole('button', { name: /continue to what's on your plate/i }));
    expect(screen.getByTestId('invisible-load')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByTestId('nova-chat')).toBeInTheDocument();
  });

  it('Start over resets all the way back to the entry step', async () => {
    render(<NovaAgenticJourney />);
    await userEvent.click(screen.getByRole('button', { name: /just talk to nova/i }));
    await userEvent.click(screen.getByRole('button', { name: /continue to what's on your plate/i }));
    await userEvent.click(screen.getByRole('button', { name: /start over/i }));
    expect(screen.getByRole('button', { name: /just talk to nova/i })).toBeInTheDocument();
  });
});
