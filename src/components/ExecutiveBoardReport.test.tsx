import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  secureApiFetch: vi.fn(),
}));
vi.mock('../lib/secure-api', () => ({ secureApiFetch: mocks.secureApiFetch }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { displayName: 'Fallback Name', email: 'x@example.com' } }) }));

import { ExecutiveBoardReport } from './ExecutiveBoardReport';

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
});
