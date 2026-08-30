import React, { useState } from 'react';
import { Calendar, AlertTriangle, ShieldCheck, Clock, CheckCircle2, ChevronRight, Zap } from 'lucide-react';
import { useAuth } from '../lib/auth';

export const CalendarDefenseView = () => {
  const { accessToken, signInWithCalendar } = useAuth();
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  const handleScan = () => {
    if (!accessToken) {
      signInWithCalendar();
      return;
    }
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setHasScanned(true);
    }, 2500);
  };

  const redZones = [
    { day: "Tuesday", time: "1:00 PM - 5:00 PM", type: "Back-to-Back Block", clash: 4, action: "Decline Lowest Priority" },
    { day: "Thursday", time: "8:00 AM - 12:00 PM", type: "Cognitive Overload", clash: 3, action: "Buffer 15 mins" }
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-text-main tracking-tight">Calendar Workload Defense</h2>
          <p className="text-sm text-text-muted mt-2 font-mono uppercase tracking-widest">Workspace Insight / Overload Warning</p>
        </div>
      </div>

      {!hasScanned ? (
        <div className="card border-border bg-surface p-6 sm:p-8 md:p-12 text-center flex flex-col items-center justify-center space-y-6">
          <div className="relative">
            <div className="w-20 h-20 bg-card rounded-full border border-primary/20 flex items-center justify-center relative z-10">
              <Calendar className="w-8 h-8 text-primary" />
            </div>
          </div>
          <div className="max-w-md space-y-3">
            <h3 className="text-xl font-bold text-text-main tracking-tight">Catch Calendar Overload Early</h3>
            <p className="text-sm text-text-muted leading-relaxed">
              This demo shows what a Red Zone scan looks like using sample data (4+ hours of sequential meetings, biological deficits, and pre-drafted scripts to reclaim your time). Live scanning of your actual Google Workspace calendar isn't built yet.
            </p>
          </div>
          <button 
            onClick={handleScan}
            disabled={isScanning}
            className="btn-primary flex items-center gap-2 mt-4"
          >
            <span role="status" aria-live="polite" className="inline-flex items-center gap-2">
              {isScanning ? (
                <><Zap className="w-4 h-4 animate-pulse" /> Scanning Workspace...</>
              ) : accessToken ? (
                <><Zap className="w-4 h-4" /> Run Red Zone Scan</>
              ) : (
                <><ShieldCheck className="w-4 h-4" /> Connect Workspace & Scan</>
              )}
            </span>
          </button>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="px-4 py-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl flex items-center gap-3 text-sm font-bold tracking-wide">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            Sample scan: illustrative Red Zones shown below. Live analysis of your actual calendar isn't built yet.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {redZones.map((zone, i) => (
              <div key={i} className="card p-6 border border-destructive/30 relative overflow-hidden group">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h4 className="text-lg font-bold text-text-main">{zone.day}</h4>
                    <p className="text-xs font-mono text-text-muted mt-1">{zone.time}</p>
                  </div>
                  <span className="px-3 py-1 bg-destructive/10 text-destructive text-[10px] font-black uppercase tracking-widest rounded">
                    {zone.type}
                  </span>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-sm text-text-main">
                    <Clock className="w-4 h-4 text-text-muted" /> {zone.clash} consecutive hour lock
                  </div>
                  <div className="p-4 bg-surface rounded-xl border border-border">
                    <p className="text-xs uppercase font-bold tracking-widest text-[#9a3412] dark:text-primary mb-2">Recommended Action</p>
                    <p className="text-sm font-medium text-text-main">{zone.action}</p>
                  </div>
                  <button
                    disabled
                    aria-disabled="true"
                    title="Script generation isn't built yet"
                    className="w-full py-3 bg-card border border-border text-text-muted/50 text-xs font-bold uppercase tracking-widest rounded-xl flex flex-row items-center justify-center gap-2 cursor-not-allowed"
                  >
                    Generate Push-Back Script <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="card p-6 border-success/20 bg-success/5 mt-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-success/20 rounded-full flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-success dark:text-[#4ade80]" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-text-main mb-1">Friday Protected</h4>
                <p className="text-xs text-text-muted leading-relaxed">
                  Your "Deep Work" blocks on Friday are currently unbroken. If a non-essential meeting is booked over one, Nova can draft a decline for you to review and send — nothing is declined without your say-so.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
