import React from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { RecommendationLedgerEntry } from '../lib/nova-intelligence.ts';

const MOCK_LEDGER: RecommendationLedgerEntry[] = [
  {
    id: '1',
    userId: 'anonymous-001',
    timestamp: new Date().toISOString(),
    type: 'recovery_reminder',
    content: 'Based on your recent check-ins, your energy has been lower on meeting-heavy days. A protected break tomorrow may be worth trying.',
    sourcesUsed: ['energy_check_in_x4', 'schedule_metadata'],
    ruleVersion: '1.2.0',
    sensitivityLevel: 'medium',
    status: 'verified',
    explanation: 'Verified: Supported by 2 user signals.',
    userHelpful: true
  },
  {
    id: '2',
    userId: 'anonymous-001',
    timestamp: new Date().toISOString(),
    type: 'course_reinforcement',
    content: 'Today\'s lesson links to your current SHIP focus: Boundaries. Ready for one small action?',
    sourcesUsed: ['ship_stage_integrate', 'course_progress'],
    ruleVersion: '1.2.0',
    sensitivityLevel: 'low',
    status: 'verified',
    explanation: 'Verified: Supported by 2 user signals.',
    userDismissed: true
  },
  {
    id: '3',
    userId: 'anonymous-001',
    timestamp: new Date().toISOString(),
    type: 'overload_warning',
    content: 'Your burnout risk is red and your anxiety pattern has worsened.',
    sourcesUsed: ['mood_pulse'],
    ruleVersion: '1.1.0',
    sensitivityLevel: 'high',
    status: 'rejected',
    explanation: 'Rejected: Recommendation breached non-medical coaching boundary.'
  }
];

export const RecommendationLedger = () => {
  return (
    <div className="card space-y-6 mt-12 bg-background shadow-lg border border-border">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 bg-success/10 border border-success/20 rounded-xl flex items-center justify-center text-success">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div>
           <h2 className="text-xl font-bold text-text-main tracking-tight">Nova Recommendation Ledger</h2>
           <p className="text-xs text-text-muted mt-1">Audit log of AI recommendations, rule verifications, and groundings.</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/[0.05]">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-surface border-b border-white/[0.05] text-text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Timestamp</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Decision</th>
              <th className="px-4 py-3 font-medium">Content / Draft</th>
              <th className="px-4 py-3 font-medium">Sources Evaluated</th>
              <th className="px-4 py-3 font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
            {MOCK_LEDGER.map((entry) => (
              <tr key={entry.id} className="hover:bg-white/[0.01] transition-colors">
                <td className="px-4 py-3 text-text-muted text-xs">{new Date(entry.timestamp).toLocaleTimeString()}</td>
                <td className="px-4 py-3 text-text-muted text-xs uppercase tracking-wider">{entry.type.replace('_', ' ')}</td>
                <td className="px-4 py-3">
                   {entry.status === 'verified' ? (
                     <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-success bg-success/10 px-2 py-1 rounded w-fit"><CheckCircle2 className="w-3 h-3"/> Verified</span>
                   ) : (
                     <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-destructive bg-destructive/10 px-2 py-1 rounded w-fit"><AlertTriangle className="w-3 h-3"/> Rejected</span>
                   )}
                </td>
                <td className="px-4 py-3 text-text-muted max-w-sm truncate" title={entry.content}>{entry.content}</td>
                <td className="px-4 py-3">
                   <div className="flex gap-1">
                      {entry.sourcesUsed.map((s, i) => (
                        <span key={i} className="text-[11px] bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-text-muted">{s}</span>
                      ))}
                   </div>
                </td>
                <td className="px-4 py-3 text-xs text-text-muted">
                   {entry.status === 'rejected' ? (
                      <span className="text-destructive/80">{entry.explanation}</span>
                   ) : entry.userHelpful ? (
                      <span className="text-success/80 cursor-default" title="User marked this as helpful">♥ Helpful</span>
                   ) : entry.userDismissed ? (
                      <span className="text-text-muted cursor-default" title="User dismissed this notification">Dismissed</span>
                   ) : (
                      <span className="text-text-muted cursor-default" title="Awaiting user feedback">Pending</span>
                   )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
