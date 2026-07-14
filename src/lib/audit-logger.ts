import { UserProfileData } from '../types.ts';
import { auth } from './firebase.ts';

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
 * Middleware/logging service to record sensitive user and admin actions.
 * Writes to the 'audit_logs' Firestore collection.
 */
export const logAuditAction = async (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => {
  const log: AuditLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString()
  };
  
  try {
    // Local backup for UI speed
    const existingStr = localStorage.getItem('blaze_audit_logs');
    const existing = existingStr ? JSON.parse(existingStr) : [];
    existing.unshift(log);
    localStorage.setItem('blaze_audit_logs', JSON.stringify(existing.slice(0, 500)));
    
    // Firestore write for compliance disabled for Phase 1C Secure Account Test Mode
    if (auth.currentUser) {
      console.log('Server-controlled audit logging not yet active.');
    } else {
      console.log('Prototype local activity display only — not a verified security audit trail.', log.action);
    }
  } catch (error) {
    console.error('Failed to write to audit_logs:', error);
  }
};

export const getAuditLogs = (): AuditLogEntry[] => {
  try {
    const existingStr = localStorage.getItem('blaze_audit_logs');
    return existingStr ? JSON.parse(existingStr) : [];
  } catch (error) {
    return [];
  }
};
