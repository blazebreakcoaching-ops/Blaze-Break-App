import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  secureApiFetch: vi.fn(),
  logAuditAction: vi.fn(),
  auth: { currentUser: { uid: 'test-uid' } as { uid: string } | null },
}));
vi.mock('../lib/secure-api', () => ({ secureApiFetch: mocks.secureApiFetch }));
vi.mock('../lib/audit-logger', () => ({ logAuditAction: mocks.logAuditAction }));
vi.mock('../lib/firebase', () => ({ auth: mocks.auth }));

import { FeedbackForm } from './FeedbackForm';

beforeEach(() => {
  mocks.auth.currentUser = { uid: 'test-uid' };
  mocks.secureApiFetch.mockReset().mockResolvedValue({ ok: true });
  mocks.logAuditAction.mockReset().mockResolvedValue(undefined);
});

const writeFeedback = (message: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: /message|your story/i }), { target: { value: message } });

describe('beta feedback reliability and public-use consent', () => {
  it('does not mark an accepted testimonial as failed if the secondary audit is offline', async () => {
    mocks.logAuditAction.mockRejectedValueOnce(new Error('audit unavailable'));
    render(<FeedbackForm />);
    fireEvent.click(screen.getByRole('button', { name: /testimonial/i }));
    writeFeedback('The first screen was useful.');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('status')).toHaveTextContent('has been sent');
    expect(mocks.secureApiFetch).toHaveBeenCalledTimes(1);
    expect(mocks.secureApiFetch).toHaveBeenCalledWith('/api/feedback/submit', expect.objectContaining({
      data: expect.objectContaining({ category: 'testimonial', publicUseConsent: true }),
    }));
    await waitFor(() => expect(mocks.logAuditAction).toHaveBeenCalledTimes(1));
  });

  it('does not record an authorisation when testimonial public-use consent is unchecked', async () => {
    render(<FeedbackForm />);
    fireEvent.click(screen.getByRole('button', { name: /testimonial/i }));
    writeFeedback('Private product feedback only.');
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('status')).toHaveTextContent('has been sent');
    expect(mocks.secureApiFetch).toHaveBeenCalledWith('/api/feedback/submit', expect.objectContaining({
      data: expect.objectContaining({ publicUseConsent: false }),
    }));
    expect(mocks.logAuditAction).not.toHaveBeenCalled();
  });

  it('keeps the original report when the actual server submission fails', async () => {
    mocks.secureApiFetch.mockRejectedValueOnce(new Error('network'));
    render(<FeedbackForm />);
    writeFeedback('The check-in screen stopped loading.');
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't send");
    expect(screen.getByRole('textbox', { name: /message/i })).toHaveValue('The check-in screen stopped loading.');
  });

  it('advises testers not to include passwords or private coaching conversations', () => {
    render(<FeedbackForm />);
    expect(screen.getByText(/don't include passwords/i)).toBeInTheDocument();
  });
});
