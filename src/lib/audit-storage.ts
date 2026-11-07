/** Never share a device's local audit fallback between Firebase users. */
export const auditStorageKey = (uid: string): string =>
  `blaze_audit_logs_v2:${encodeURIComponent(uid)}`;

export interface StoredAuditEntry {
  id: string;
  userId: string;
  action: string;
  status: 'authorised' | 'denied' | 'anonymised' | 'deleted' | 'verified';
  timestamp: string;
  target?: string;
  details?: string;
}

/** Browser storage is a convenience only; the server audit log is authoritative. */
export function parseAuditFallback(raw: string | null): StoredAuditEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StoredAuditEntry => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const record = item as Record<string, unknown>;
      return typeof record.id === 'string' &&
        typeof record.action === 'string' &&
        typeof record.userId === 'string' &&
        typeof record.timestamp === 'string' &&
        ['authorised', 'denied', 'anonymised', 'deleted', 'verified'].includes(
          record.status as string,
        );
    }).slice(0, 100);
  } catch {
    return [];
  }
}
