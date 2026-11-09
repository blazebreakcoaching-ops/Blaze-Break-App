import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  secureApiFetch: vi.fn(),
  user: { uid: 'member-one', displayName: 'Fallback Name', email: 'x@example.com' } as
    { uid: string; displayName: string; email: string } | null,
}));
vi.mock('../lib/firebase', () => ({
  auth: { get currentUser() { return mocks.user; } },
}));
vi.mock('../lib/secure-api', async () => {
  const actual = await vi.importActual<any>('../lib/secure-api');
  return { ...actual, secureApiFetch: mocks.secureApiFetch };
});
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: mocks.user }) }));

import { ExecutiveBoardReport } from './ExecutiveBoardReport';
import { SecureApiError } from '../lib/secure-api';

// Inserts a controllable contentWindow BEFORE the frame is attached, so the
// load handler (which jsdom fires itself) sees the stub, not jsdom's own.
function captureFrames(contentWindow: Record<string, unknown>) {
  const frames: HTMLIFrameElement[] = [];
  const realAppend = document.body.appendChild.bind(document.body);
  const spy = vi.spyOn(document.body, 'appendChild').mockImplementation(((node: Node) => {
    if (node instanceof HTMLIFrameElement) {
      frames.push(node);
      Object.defineProperty(node, 'contentWindow', { value: contentWindow, configurable: true });
      const result = realAppend(node);
      // Fire load explicitly (and possibly a second time after jsdom's own)
      // to prove the handler is idempotent.
      node.onload?.(new Event('load'));
      return result;
    }
    return realAppend(node);
  }) as any);
  return { frames, restore: () => spy.mockRestore() };
}

const reportPayload = {
  deepWorkHours: 5, boundariesProtected: 2, burnRatePercent: 64, sleepDebtHours: 1,
  aiAnalysis: '<img src=x onerror=alert(1)> steady week', hasEnoughData: true,
};

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  mocks.user = { uid: 'member-one', displayName: 'Fallback Name', email: 'x@example.com' };
  mocks.secureApiFetch.mockReset().mockResolvedValue({ ok: true, json: async () => reportPayload });
});

describe('Executive Board Report export', () => {
  it('opens the print dialog on a sandboxed, script-free, escaped document and never downloads HTML', async () => {
    const createObjectURL = vi.fn();
    (URL as any).createObjectURL = createObjectURL;
    const award = vi.fn();
    const print = vi.fn();
    const { frames: appended, restore } = captureFrames({ print, focus: vi.fn() });

    render(<ExecutiveBoardReport stats={{ points: 10, streak: 2, profile: { fullName: 'Alex <b>Morgan</b>' } } as any} onAwardPoints={award} />);
    await waitFor(() => expect(mocks.secureApiFetch).toHaveBeenCalled());

    // No fabricated "Save Locally" action exists any more.
    expect(screen.queryByRole('button', { name: /save locally/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Save as PDF' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open print window' }));

    await waitFor(() => expect(appended).toHaveLength(1));
    const frame = appended[0];
    const sandbox = frame.getAttribute('sandbox') || '';
    expect(sandbox).not.toContain('allow-scripts');
    expect(frame.srcdoc).not.toMatch(/<script/i);
    expect(frame.srcdoc).not.toContain('<img');
    expect(frame.srcdoc).toContain('Alex &lt;b&gt;Morgan&lt;/b&gt;');

    expect(print).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/choose "Save as PDF"/i)).toBeTruthy();
    expect(award).toHaveBeenCalledWith(10, 'Executive Board report exported (+10 pts)');
    expect(createObjectURL).not.toHaveBeenCalled();
    restore();
  });

  it('tells the user honestly when the browser blocks printing, and awards no points', async () => {
    const award = vi.fn();
    const { frames: appended, restore } = captureFrames({ focus: vi.fn(), print: () => { throw new Error('blocked'); } });

    render(<ExecutiveBoardReport stats={{ points: 0, streak: 0, profile: {} } as any} onAwardPoints={award} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save as PDF' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open print window' }));
    await waitFor(() => expect(appended).toHaveLength(1));

    expect(await screen.findByText(/blocked the print window/i)).toBeTruthy();
    expect(award).not.toHaveBeenCalled();
    restore();
  });

  it('does not display an old report after same-UID reauthentication', async () => {
    let finishOld!: (value: { ok: boolean; json: () => Promise<typeof reportPayload> }) => void;
    const oldResult = new Promise<{ ok: boolean; json: () => Promise<typeof reportPayload> }>(
      resolve => { finishOld = resolve; },
    );
    mocks.secureApiFetch.mockReset().mockImplementationOnce(() => oldResult)
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        ...reportPayload, aiAnalysis: 'Current session report only',
      }) });
    const { rerender } = render(<ExecutiveBoardReport />);
    await waitFor(() => expect(mocks.secureApiFetch).toHaveBeenCalledTimes(1));
    mocks.user = { uid: 'member-one', displayName: 'New Session', email: 'x@example.com' };
    rerender(<ExecutiveBoardReport />);
    expect(await screen.findByText('Current session report only')).toBeTruthy();
    finishOld({ ok: true, json: async () => ({
      ...reportPayload, aiAnalysis: 'Private previous session report',
    }) });
    await waitFor(() => expect(screen.queryByText('Private previous session report')).toBeNull());
  });

  it('shows a rate limit as a rate limit, never as "not enough activity"', async () => {
    mocks.secureApiFetch.mockReset().mockRejectedValue(new SecureApiError("You've reached today's fair-use limit for this. It resets tomorrow.", 429));
    render(<ExecutiveBoardReport stats={{ points: 0, streak: 0, profile: {} } as any} />);
    expect(await screen.findByText(/fair-use limit.*not a reflection of your activity/i)).toBeTruthy();
    expect(screen.queryByText(/Not enough activity has been logged/i)).toBeNull();
  });

  it('refuses to create a PDF when report data cannot be loaded', async () => {
    mocks.secureApiFetch.mockReset().mockRejectedValue(new SecureApiError('Something went wrong on our end.', 500));
    const award = vi.fn();
    const { frames, restore } = captureFrames({ print: vi.fn(), focus: vi.fn() });
    render(<ExecutiveBoardReport stats={{ points: 0, streak: 0, profile: {} } as any} onAwardPoints={award} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save as PDF' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open print window' }));
    expect(await screen.findByText(/No PDF was created/i)).toBeTruthy();
    expect(frames).toHaveLength(0);
    expect(award).not.toHaveBeenCalled();
    restore();
  });
});
