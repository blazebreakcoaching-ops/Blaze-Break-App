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
    return parsed.filter((item): item is StoredAuditEntry =>
      item && typeof item === 'object' &&
      typeof item.id === 'string' &&
      typeof item.action === 'string' &&
      typeof item.userId === 'string' &&
      ['authorised', 'denied', 'anonymised', 'deleted', 'verified'].includes(
        (item as Record<string, unknown>).status as string,
      ) &&
      typeof item.timestamp === 'string',
    ).slice(0, 100);
  } catch {
    return [];
  }
}
