import { secureApiFetch } from './secure-api';

// Computes a real inbox-load signal from the user's own Gmail (same
// direct-browser-call pattern as calendar-signals.ts). Uses the INBOX
// label's metadata endpoint rather than listing individual messages - this
// is a single, cheap API call that returns real unread/total counts
// directly, without needing to fetch and inspect every message's headers
// the way a full after-hours breakdown (like Slack's) would require.
// No message content, subject lines, or sender info ever leaves Gmail's API
// response before being reduced to these two numbers.

export interface GmailSignal {
  unreadCount: number;
  totalInboxCount: number;
}

export const computeGmailSignal = async (accessToken: string): Promise<GmailSignal | null> => {
  if (!accessToken) return null;

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail API returned status ${res.status}`);
  }
  const data = await res.json();

  return {
    unreadCount: typeof data.messagesUnread === 'number' ? data.messagesUnread : 0,
    totalInboxCount: typeof data.messagesTotal === 'number' ? data.messagesTotal : 0,
  };
};

export const syncGmailSignal = async (accessToken: string | null): Promise<GmailSignal | null> => {
  if (!accessToken) return null;
  try {
    const signal = await computeGmailSignal(accessToken);
    if (!signal) return null;
    await secureApiFetch('/api/signals/gmail', {
      method: 'POST',
      data: signal,
    });
    return signal;
  } catch (e) {
    console.warn('[gmail-signals] sync skipped:', e);
    return null;
  }
};
