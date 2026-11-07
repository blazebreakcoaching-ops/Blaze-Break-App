import { auth } from './firebase.ts';
import { secureApiFetch } from './secure-api.ts';
import { auditStorageKey, parseAuditFallback } from './audit-storage';

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

  // Cache only for the Firebase identity that submitted this action.
  // The old global key could leak a previous anonymous user's audit trail.
  const uid = auth.currentUser?.uid;
  if (uid) {
    try {
      const key = auditStorageKey(uid);
      const existing = parseAuditFallback(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify([log, ...existing].slice(0, 100)));
    } catch {
      // The authoritative audit event is written server-side below.
    }
  }

  if (uid && auth.currentUser?.uid === uid) {
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
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
      const res = await secureApiFetch('/api/audit-log');
      if (auth.currentUser?.uid !== uid) return [];
      if (res.ok) {
        const data = await res.json();
        if (auth.currentUser?.uid !== uid) return [];
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
  } catch {
    // Audit fallback is scoped to this account, never the whole browser.
  }
  if (auth.currentUser?.uid !== uid) return [];
  try {
    return parseAuditFallback(localStorage.getItem(auditStorageKey(uid))) as AuditLogEntry[];
  } catch {
    return [];
  }
};
