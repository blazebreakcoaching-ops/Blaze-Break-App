import React, { useState } from 'react';
import { Shield, Settings, Key, AlertTriangle, Users, BookOpen, CreditCard } from 'lucide-react';
import { AuthRole, SubscriptionTier } from '../types.ts';
import { logAuditAction } from '../lib/audit-logger.ts';

const roles: AuthRole[] = [
  'individual', 'employee', 'recovery_ally', 'manager', 
  'organisation_admin', 'executive', 'platform_admin', 'security_admin'
];

const tiers: SubscriptionTier[] = [
  'free', 'recovery', 'pro', 'executive_digital', 'coaching_circle', 'private_coaching', 'organisation_sponsored'
];

interface MatrixRow {
  module: string;
  individual: string;
  manager: string;
  organisation_admin: string;
  platform_admin: string;
  security_admin: string;
}

const matrixData: MatrixRow[] = [
  { module: 'Private Nova Chat', individual: 'Own only', manager: 'Never', organisation_admin: 'Never', platform_admin: 'No routine', security_admin: 'Incident-only' },
  { module: 'Team Climate', individual: 'No', manager: 'Assigned team', organisation_admin: 'Own org', platform_admin: 'Support only', security_admin: 'Audit only' },
  { module: 'Guardian Settings', individual: 'Own only', manager: 'Never', organisation_admin: 'Never', platform_admin: 'Never by default', security_admin: 'Restricted' },
  { module: 'AI Prompt Versions', individual: 'No', manager: 'No', organisation_admin: 'No', platform_admin: 'Manage', security_admin: 'Audit' },
  { module: 'Security Logs', individual: 'No', manager: 'No', organisation_admin: 'No', platform_admin: 'Limited', security_admin: 'Manage' }
];

export const AccessControlMatrix = ({ 
  currentRole, 
  currentTier,
  onRoleChange,
  onTierChange
}: { 
  currentRole: AuthRole, 
  currentTier: SubscriptionTier,
  onRoleChange: (r: AuthRole) => void,
  onTierChange: (t: SubscriptionTier) => void
}) => {
  return (
    <div className="space-y-12 pb-32">
      <div className="card space-y-6 shadow-2xl bg-background border border-white/[0.05]">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center text-primary">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-main tracking-tight">Access & Entitlement Matrix</h2>
            <p className="text-xs text-text-muted mt-1">Platform administration and sandbox testing.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Role Check */}
          <div className="p-4 rounded-xl border border-white/[0.05] bg-white/[0.02] space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-success" />
              <h3 className="font-bold text-sm text-text-muted uppercase tracking-widest">1. Auth Role</h3>
            </div>
            <p className="text-xs text-text-muted leading-relaxed font-light">
              Controls what zones the user can see. Never unlocks another person's private journey.
            </p>
            <div className="flex flex-wrap gap-2">
              {roles.map(r => (
                <button
                  key={r}
                  onClick={() => {
                    logAuditAction({
                      userId: 'admin_dashboard',
                      action: `Role modified to ${r}`,
                      target: `User Profile Role`,
                      status: 'authorised',
                      details: `Administrator manually updated user role to ${r}.`
                    });
                    onRoleChange(r);
                  }}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-colors ${currentRole === r ? 'bg-success/20 border-success/40 text-success/40' : 'bg-transparent border-white/[0.05] text-text-muted hover:text-text-main hover:bg-white/[0.02]'}`}
                >
                  {r.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Subscription Check */}
          <div className="p-4 rounded-xl border border-white/[0.05] bg-white/[0.02] space-y-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-sm text-text-muted uppercase tracking-widest">2. Subscription Tier</h3>
            </div>
            <p className="text-xs text-text-muted leading-relaxed font-light">
              Controls what paid tools the user has. Does not bypass privacy or grant auth.
            </p>
            <div className="flex flex-wrap gap-2">
              {tiers.map(t => (
                <button
                  key={t}
                  onClick={() => {
                    logAuditAction({
                      userId: 'admin_dashboard',
                      action: `Subscription tier modified to ${t}`,
                      target: `User Profile Subscription`,
                      status: 'authorised',
                      details: `Administrator manually updated user subscription to ${t}.`
                    });
                    onTierChange(t);
                  }}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-colors ${currentTier === t ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-transparent border-white/[0.05] text-text-muted hover:text-text-main hover:bg-white/[0.02]'}`}
                >
                  {t.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4 mt-8">
          <h3 className="font-bold text-sm text-text-main">Security Governance Matrix</h3>
          <div className="overflow-x-auto rounded-xl border border-white/[0.05]">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-surface border-b border-white/[0.05] text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Data Zone</th>
                  <th className="px-4 py-3 font-medium text-success">Individual</th>
                  <th className="px-4 py-3 font-medium text-warning">Manager</th>
                  <th className="px-4 py-3 font-medium text-warning">Org Admin</th>
                  <th className="px-4 py-3 font-medium text-destructive">Platform</th>
                  <th className="px-4 py-3 font-medium text-destructive">Security</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {matrixData.map((row, i) => (
                  <tr key={i} className="hover:bg-white/[0.01]">
                    <td className="px-4 py-3 font-bold text-text-muted">{row.module}</td>
                    <td className="px-4 py-3 text-text-muted">{row.individual}</td>
                    <td className="px-4 py-3 text-text-muted">{row.manager}</td>
                    <td className="px-4 py-3 text-text-muted">{row.organisation_admin}</td>
                    <td className="px-4 py-3 text-text-muted">{row.platform_admin}</td>
                    <td className="px-4 py-3 text-text-muted">{row.security_admin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
