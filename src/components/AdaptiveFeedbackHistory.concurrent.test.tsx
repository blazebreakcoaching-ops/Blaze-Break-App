import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdaptiveFeedbackHistory } from './AdaptiveFeedbackHistory';
import { translate } from '../../i18n';

const mocks = vi.hoisted(() => ({
  currentUser: null as { uid: string } | null,
  api: vi.fn(),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: mocks.currentUser }) }));
vi.mock('../lib/firebase', () => ({
  auth: { get currentUser() { return mocks.currentUser; } },
}));
vi.mock('../lib/secure-api', () => ({ secureApiFetch: mocks.api }));
vi.mock('../lib/i18n-react', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string, vars?: Record<string, string | number>) => translate('en', key as any, vars),
  }),
}));

const payload = (items: { id: string; module: string; helpfulness: string; date: null }[], cursor: string | null) => ({
  json: async () => ({ items, nextCursor: cursor }),
}) as unknown as Response;
const firstItem = {
  id: 'feedback-1', module: 'guided_reset', helpfulness: 'better', date: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  mocks.currentUser = { uid: 'owner-one' };
  mocks.api.mockReset();
});

describe('Adaptive Feedback History in-flight page mutations', () => {
  it('does not resurrect forgotten feedback when an older page arrives later', async () => {
    const older = deferred<Response>();
    mocks.api.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === '/api/recovery/my-feedback') return Promise.resolve(payload([firstItem], 'next-page'));
      if (path.includes('?cursor=')) return older.promise;
      if (path.endsWith('/feedback-1') && options?.method === 'DELETE') {
        return Promise.resolve({ ok: true } as Response);
      }
      throw new Error('Unexpected API call ' + path);
    });
    render(<AdaptiveFeedbackHistory />);
    fireEvent.click(screen.getByRole('button', { name: 'Review my feedback' }));
    expect(await screen.findByText('Guided Reset')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show older ratings' }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Forget feedback for Guided Reset' }));
    await waitFor(() => expect(screen.queryByText('Guided Reset')).not.toBeInTheDocument());

    await act(async () => {
      older.resolve(payload([firstItem], null)); // response was issued BEFORE erasure
    });
    expect(screen.queryByText('Guided Reset')).not.toBeInTheDocument();
  });

});
