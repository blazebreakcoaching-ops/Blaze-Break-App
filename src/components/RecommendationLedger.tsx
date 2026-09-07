import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { RecommendationLedgerEntry } from '../lib/nova-intelligence.ts';
import { secureApiFetch } from '../lib/secure-api';

export const RecommendationLedger = () => {
  const [entries, setEntries] = useState<RecommendationLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await secureApiFetch('/api/user/recommendation-ledger');
        if (res.ok) {
          const data = await res.json();
          setEntries(data.entries || []);
        }
      } catch (e) {
        // Leaves the honest empty state in place rather than pretending entries loaded.
      }
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="card space-y-6 mt-12 bg-background shadow-lg border border-border">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 bg-success/10 border border-success/20 rounded-xl flex items-center justify-center text-success dark:text-[#4ade80]">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div>
           <h2 className="text-xl font-bold text-text-main tracking-tight">Nova Recommendation Ledger</h2>
           <p className="text-xs text-text-muted mt-1">Audit log of AI recommendations, rule verifications, and groundings.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-text-muted italic text-center py-12">No recommendations logged yet. This fills in as Nova generates and verifies recommendations for you.</p>
      ) : (
      <div className="overflow-x-auto rounded-xl border border-white/[0.05]">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-surface border-b border-white/[0.05] text-text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Timestamp</th>
              <th scope="col" className="px-4 py-3 font-medium">Type</th>
              <th scope="col" className="px-4 py-3 font-medium">Decision</th>
              <th scope="col" className="px-4 py-3 font-medium">Content / Draft</th>
              <th scope="col" className="px-4 py-3 font-medium">Sources Evaluated</th>
              <th scope="col" className="px-4 py-3 font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-white/[0.01] transition-colors">
                <td className="px-4 py-3 text-text-muted text-xs">{new Date(entry.timestamp).toLocaleTimeString()}</td>
                <td className="px-4 py-3 text-text-muted text-xs uppercase tracking-wider">{entry.type.replace('_', ' ')}</td>
                <td className="px-4 py-3">
                   {entry.status === 'verified' ? (
                     <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-success dark:text-[#4ade80] bg-success/10 px-2 py-1 rounded w-fit"><CheckCircle2 className="w-3 h-3"/> Verified</span>
                   ) : (
                     <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-destructive dark:text-[#f87171] bg-destructive/10 px-2 py-1 rounded w-fit"><AlertTriangle className="w-3 h-3"/> Rejected</span>
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
                      <span className="text-destructive dark:text-[#f87171]">{entry.explanation}</span>
                   ) : entry.userHelpful ? (
                      <span className="text-success dark:text-[#4ade80] cursor-default" title="User marked this as helpful">♥ Helpful</span>
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
      )}
    </div>
  );
};

