// Nova Take the Load - Google Calendar adapter (Phase 5D, directive §5).
// Covers the pure request-construction functions and the stub
// connector's permanent inability to perform a real call.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildGoogleCalendarEventInsertRequest, buildGoogleCalendarEventDeleteRequest, createGoogleCalendarAdapterStub,
} from './nova-google-calendar-adapter';

describe('buildGoogleCalendarEventInsertRequest - pure request construction', () => {
  it('builds a real-shaped Google Calendar Events API insert request', () => {
    const req = buildGoogleCalendarEventInsertRequest('fake-token', {
      startIso: '2026-02-02T14:00:00.000Z', endIso: '2026-02-02T14:30:00.000Z', title: 'Protected recovery block',
    });
    expect(req.method).toBe('POST');
    expect(req.url).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    expect(req.headers.Authorization).toBe('Bearer fake-token');
    expect(req.body).toEqual({
      summary: 'Protected recovery block',
      start: { dateTime: '2026-02-02T14:00:00.000Z' },
      end: { dateTime: '2026-02-02T14:30:00.000Z' },
    });
  });

  it('embeds the proposal id as a private extended property when given, for later provider-level reconciliation', () => {
    const req = buildGoogleCalendarEventInsertRequest('fake-token', {
      startIso: '2026-02-02T14:00:00.000Z', endIso: '2026-02-02T14:30:00.000Z', title: 'x',
    }, 'cpp_abc123');
    expect(req.body?.extendedProperties).toEqual({ private: { novaProposalId: 'cpp_abc123' } });
  });

  it('omits extendedProperties entirely when no proposal id is given', () => {
    const req = buildGoogleCalendarEventInsertRequest('fake-token', {
      startIso: '2026-02-02T14:00:00.000Z', endIso: '2026-02-02T14:30:00.000Z', title: 'x',
    });
    expect(req.body?.extendedProperties).toBeUndefined();
  });
});

describe('buildGoogleCalendarEventDeleteRequest - pure request construction', () => {
  it('builds a real-shaped Google Calendar Events API delete-by-id request', () => {
    const req = buildGoogleCalendarEventDeleteRequest('fake-token', 'evt_123');
    expect(req.method).toBe('DELETE');
    expect(req.url).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events/evt_123');
    expect(req.headers.Authorization).toBe('Bearer fake-token');
  });

  it('URL-encodes the event id', () => {
    const req = buildGoogleCalendarEventDeleteRequest('fake-token', 'evt with spaces');
    expect(req.url).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events/evt%20with%20spaces');
  });
});

describe('createGoogleCalendarAdapterStub - structurally cannot perform a real call', () => {
  const request = { category: 'calendar_protection' as const, proposedChangeDescription: 'x' };

  it('checkReady always reports not ready', async () => {
    const stub = createGoogleCalendarAdapterStub('fake-token');
    const result = await stub.checkReady(request);
    expect(result.ready).toBe(false);
  });

  it('execute always fails, naming the real reason', async () => {
    const stub = createGoogleCalendarAdapterStub('fake-token');
    const result = await stub.execute(request);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/no server-side OAuth token storage/);
  });

  it('undo always fails the same way', async () => {
    const stub = createGoogleCalendarAdapterStub('fake-token');
    const result = await stub.undo(request);
    expect(result.ok).toBe(false);
  });

  it('behaves identically with no access token at all', async () => {
    const stub = createGoogleCalendarAdapterStub(null);
    const result = await stub.execute(request);
    expect(result.ok).toBe(false);
  });
});

describe('nova-google-calendar-adapter.ts never makes a real external call', () => {
  const ROOT = path.resolve(new URL('.', import.meta.url).pathname);
  const content = fs.readFileSync(path.join(ROOT, 'nova-google-calendar-adapter.ts'), 'utf8');

  it('has no fetch() call anywhere', () => {
    expect(content).not.toMatch(/\bfetch\s*\(/);
  });

  it('has no import of http/https', () => {
    expect(content).not.toMatch(/from\s+['"](node:)?https?['"]/);
  });

  it('is never imported by server.ts', () => {
    const serverPath = path.join(ROOT, 'server.ts');
    expect(fs.readFileSync(serverPath, 'utf8')).not.toMatch(/from\s+['"]\.\/nova-google-calendar-adapter['"]/);
  });

  it('is never imported by any .tsx file', () => {
    function walk(dir: string): string[] {
      let results: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results = results.concat(walk(full));
        else if (entry.name.endsWith('.tsx')) results.push(full);
      }
      return results;
    }
    for (const file of walk(path.join(ROOT, 'src'))) {
      expect(fs.readFileSync(file, 'utf8')).not.toMatch(/from\s+['"].*nova-google-calendar-adapter['"]/);
    }
  });
});
