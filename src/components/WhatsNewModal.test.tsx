import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsNewModal } from './WhatsNewModal';

describe("What's New should not restart during a first visit", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('does not reopen an informational announcement after the welcome finishes', () => {
    const onSeen = vi.fn();
    const view = render(
      <WhatsNewModal loaded paused lastSeenVersion={undefined} onSeen={onSeen} />,
    );
    act(() => vi.advanceTimersByTime(3_500));
    expect(screen.queryByRole('dialog', { name: "What's New" })).not.toBeInTheDocument();

    // The same visitor closes the important welcome and returns to Today.
    // A new 3-second timer must NOT arm on this rerender.
    view.rerender(<WhatsNewModal loaded paused={false} lastSeenVersion={undefined} onSeen={onSeen} />);
    act(() => vi.advanceTimersByTime(3_500));
    expect(screen.queryByRole('dialog', { name: "What's New" })).not.toBeInTheDocument();
    expect(onSeen).not.toHaveBeenCalled();
  });

  it('does not reopen after the visitor starts interacting with the page', () => {
    const onSeen = vi.fn();
    const view = render(
      <WhatsNewModal loaded paused={false} lastSeenVersion={undefined} onSeen={onSeen} />,
    );
    fireEvent.pointerDown(document.body);
    act(() => vi.advanceTimersByTime(3_500));
    expect(screen.queryByRole('dialog', { name: "What's New" })).not.toBeInTheDocument();

    view.rerender(<WhatsNewModal loaded paused lastSeenVersion={undefined} onSeen={onSeen} />);
    view.rerender(<WhatsNewModal loaded paused={false} lastSeenVersion={undefined} onSeen={onSeen} />);
    act(() => vi.advanceTimersByTime(3_500));
    expect(screen.queryByRole('dialog', { name: "What's New" })).not.toBeInTheDocument();
    expect(onSeen).not.toHaveBeenCalled();
  });
});
