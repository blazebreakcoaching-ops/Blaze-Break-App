import React from 'react';
import { History, Clock, Server, EyeOff } from 'lucide-react';

export const RetentionSchedule = () => {
  const schedules = [
    { category: 'Private Nova Chat History', retention: '30 Days', action: 'Auto-Purge', icon: Clock, color: 'text-destructive' },
    { category: 'Mood Logs & Triggers', retention: '12 Months', action: 'Anonymise', icon: Server, color: 'text-primary' },
    { category: 'Account Metadata', retention: 'Duration of Account', action: 'Retain', icon: History, color: 'text-text-muted' },
    { category: 'Organization Aggregates', retention: '24 Months', action: 'Retain (Anonymized)', icon: EyeOff, color: 'text-success dark:text-[#4ade80]' }
  ];

  return (
    <div className="card space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-background border border-white/[0.05] rounded-xl flex items-center justify-center text-destructive shrink-0">
          <Clock className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-text-main text-lg">Retention Schedule</h3>
          <p className="text-xs text-text-muted mt-1">Automated data lifecycle and deletion policies.</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/[0.05]">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-surface border-b border-white/[0.05] text-text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Data Category</th>
              <th scope="col" className="px-4 py-3 font-medium">Retention Period</th>
              <th scope="col" className="px-4 py-3 font-medium">End of Life Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
            {schedules.map((item, i) => (
              <tr key={i} className="hover:bg-white/[0.01] transition-colors">
                <td className="px-4 py-4 text-text-muted text-sm font-medium flex items-center gap-2">
                  <item.icon className={`w-4 h-4 ${item.color}`} /> {item.category}
                </td>
                <td className="px-4 py-4 text-text-muted text-xs font-mono">{item.retention}</td>
                <td className="px-4 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded bg-background border border-white/[0.05] text-xs uppercase tracking-widest font-black text-text-muted">
                    {item.action}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="bg-destructive/5 border border-destructive/10 p-4 rounded-xl mt-4">
         <p className="text-xs text-[#b91c1c] dark:text-rose-300/80 leading-relaxed font-light">
           <strong>Notice:</strong> When data is purged, it is cryptographically shredded and cannot be recovered by Blaze Break admins or Nova.
         </p>
      </div>
    </div>
  );
};
