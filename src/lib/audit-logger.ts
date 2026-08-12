import { auth } from './firebase.ts';
import { secureApiFetch } from './secure-api.ts';

export interface AuditLogEntry {
  id: string;
  userId: string | 'anonymous' | 'system';
  action: string;
  target?: string;
  timestamp: string;
  status: 'authorised' | 'denied' | 'anonymised' | 'deleted' | 'verified';
  details?: string;
}

/**
 * Records sensitive user actions (privacy/consent changes, data deletion,
 * etc.) to the real, server-written 'audit_logs' Firestore collection - a
 * genuinely tamper-resistant trail, not something living only in the
 * browser that resets on a cleared cache or a new device.
 */
export const logAuditAction = async (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => {
  const log: AuditLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString()
  };

  // Local cache for instant UI display - the real record is the server
  // write below; this is just so the list doesn't flash empty on load.
  try {
    const existingStr = localStorage.getItem('blaze_audit_logs');
    const existing = existingStr ? JSON.parse(existingStr) : [];
    existing.unshift(log);
    localStorage.setItem('blaze_audit_logs', JSON.stringify(existing.slice(0, 500)));
  } catch (error) {
    // Non-fatal - the server write below is what actually matters.
  }

  if (auth.currentUser) {
    try {
      await secureApiFetch('/api/audit-log', {
        method: 'POST',
        data: { action: entry.action, target: entry.target, status: entry.status, details: entry.details },
      });
    } catch (error) {
      console.error('Failed to write audit log to server:', error);
    }
  }
};

/**
 * Fetches the real, server-recorded audit trail for the current user.
 * Falls back to the local cache only if the fetch itself fails, so the UI
 * never goes fully blank on a transient network error.
 */
export const getAuditLogs = async (): Promise<AuditLogEntry[]> => {
  if (auth.currentUser) {
    try {
      const res = await secureApiFetch('/api/audit-log');
      if (res.ok) {
        const data = await res.json();
        return (data.logs || []).map((l: any) => ({
          id: l.id,
          userId: l.userId,
          action: l.action,
          target: l.target,
          status: l.status,
          details: l.details,
          timestamp: l.createdAt?._seconds
            ? new Date(l.createdAt._seconds * 1000).toISOString()
            : (l.createdAt || new Date().toISOString()),
        }));
      }
    } catch (error) {
      console.error('Failed to fetch audit logs from server:', error);
    }
  }
  try {
    const existingStr = localStorage.getItem('blaze_audit_logs');
    return existingStr ? JSON.parse(existingStr) : [];
  } catch (error) {
    return [];
  }
};
