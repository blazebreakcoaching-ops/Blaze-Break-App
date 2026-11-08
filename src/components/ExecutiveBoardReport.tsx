import React, { useState, useEffect } from 'react';
import { Download, TrendingUp, Clock, ShieldAlert, Activity, FileText, Layers, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { UserStats } from '../types';
import { secureApiFetch, SecureApiError } from '../lib/secure-api';
import { useFocusTrap } from '../lib/useFocusTrap';
import { buildExecutiveReportHtml } from '../lib/executive-report-document';

export const ExecutiveBoardReport = ({
  stats: userStats,
  onAwardPoints
}: {
  stats?: UserStats;
  onAwardPoints?: (amount: number, reason: string) => void;
}) => {
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Report options for the printable / Save-as-PDF summary
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [includeAICommentary, setIncludeAICommentary] = useState(true);
  const [includeMetricsGrid, setIncludeMetricsGrid] = useState(true);
  const [includeBurnRate, setIncludeBurnRate] = useState(true);
  const [includeCorporateSignature, setIncludeCorporateSignature] = useState(true);

  const configDialogRef = useFocusTrap(showConfigModal);

  useEffect(() => {
    if (!showConfigModal) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isExporting) setShowConfigModal(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showConfigModal, isExporting]);

  const [reportData, setReportData] = useState<{
    deepWorkHours: number;
    boundariesProtected: number;
    burnRatePercent: number | null;
    sleepDebtHours: number | null;
    aiAnalysis: string | null;
    hasEnoughData: boolean;
  } | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  // A failed or rate-limited load is NOT "no activity": never let it be
  // shown (or printed) as an empty report.
  const [reportLoadError, setReportLoadError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await secureApiFetch('/api/signals/executive-report');
        if (res.ok) {
          setReportData(await res.json());
        }
      } catch (e) {
        setReportLoadError(e instanceof SecureApiError ? e.message : 'Your report data could not be loaded right now.');
      }
      setReportLoading(false);
    };
    load();
  }, []);

  const handleOpenConfig = () => {
    setExportNotice(null);
    setShowConfigModal(true);
  };

  // Real PDF output with no extra dependency: the report is rendered in a
  // hidden, script-less sandboxed frame and the browser's own print dialog
  // is opened on it, where "Save as PDF" writes a genuine PDF file.
  const printReport = async () => {
    setIsExporting(true);
    setExportNotice(null);
    let liveData = reportData;
    if (!liveData) {
      try {
        const res = await secureApiFetch('/api/signals/executive-report');
        if (res.ok) {
          liveData = await res.json();
          setReportData(liveData);
          setReportLoadError(null);
        }
      } catch (e) {
        // Never print a report claiming "not enough activity" when the
        // data simply could not be fetched (outage or daily limit).
        const reason = e instanceof SecureApiError ? e.message : 'Your report data could not be loaded right now.';
        setReportLoadError(reason);
        setExportNotice(`${reason} No PDF was created, so it cannot misstate your data. Please try again later.`);
        setIsExporting(false);
        return;
      }
    }
    const html = buildExecutiveReportHtml({
      name: userStats?.profile?.fullName || user?.displayName || user?.email || 'Blaze Break member',
      role: userStats?.profile?.role || 'Not specified',
      organisation: userStats?.profile?.organization || 'Not specified',
      points: userStats?.points ?? 0,
      streak: userStats?.streak ?? 0,
      generatedAt: new Date(),
      data: liveData,
      includeAICommentary, includeMetricsGrid, includeBurnRate, includeCorporateSignature,
    });
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-modals allow-same-origin');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0;';
    frame.srcdoc = html;
    // Some browsers fire load more than once for a frame; never open two
    // print dialogs or award points twice for one export.
    let handled = false;
    frame.onload = () => {
      if (handled) return;
      handled = true;
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        setExportNotice('Your print window is open. Choose "Save as PDF" as the destination to keep a copy.');
        setShowConfigModal(false);
        if (onAwardPoints) onAwardPoints(10, 'Executive Board report exported (+10 pts)');
      } catch {
        setExportNotice('Your browser blocked the print window. Please allow printing for this site and try again.');
      } finally {
        setIsExporting(false);
        setTimeout(() => frame.remove(), 60_000);
      }
    };
    document.body.appendChild(frame);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-text-main tracking-tight">Executive Board Report</h2>
          <p className="text-sm text-text-muted mt-2 font-mono uppercase tracking-widest">Confidential / Personal Recovery Summary</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
          <button 
            onClick={handleOpenConfig}
            disabled={isExporting}
            className="btn-primary flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>{isExporting ? "Preparing report..." : "Save as PDF"}</span>
          </button>
        </div>
      </div>
      {exportNotice && (
        <p role="status" aria-live="polite" className="text-sm text-text-muted -mt-4">{exportNotice}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Nova's Executive Summary */}
        <div className="lg:col-span-2 card p-8 space-y-6 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <FileText className="w-48 h-48" />
          </div>
          <div className="relative z-10">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-ember-accent mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Nova AI Analysis
            </h3>
            <p className="text-lg leading-relaxed text-text-main font-serif">
              {reportLoading
                ? "Loading your recovery analysis..."
                : reportLoadError
                  ? `${reportLoadError} This is not a reflection of your activity.`
                  : reportData?.aiAnalysis
                  ? reportData.aiAnalysis
                  : "Not enough activity has been logged yet to generate a grounded analysis. Use the app's recovery tools this week - deep work sessions, boundary rehearsal, workload check-ins - and this will populate."}
            </p>
          </div>
          <div className="relative z-10 flex items-center gap-4 border-t border-border pt-6 mt-6">
            {/* Nova is an AI, so it gets an icon rather than a face. This
                previously rendered user?.photoURL - the reader's own photo -
                next to "Coach Nova", attributing the AI's analysis to them,
                and fell back to a stranger's photo from an external avatar
                service when they had none. */}
            <div className="w-10 h-10 rounded-full border border-border bg-primary/10 text-ember-accent flex items-center justify-center shrink-0" aria-hidden="true">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-text-main">Coach Nova</p>
              <p className="text-xs text-text-muted uppercase tracking-widest mt-0.5">Lead Recovery Architect</p>
            </div>
          </div>
        </div>

        {/* Global Stats */}
        <div className="space-y-6">
          <div className="card p-6 border-l-4 border-l-primary">
            <p className="text-xs text-text-muted uppercase tracking-widest font-bold mb-2">Workload Intensity</p>
            <div className="flex items-end gap-3">
              <span className="text-4xl font-black text-text-main tracking-tighter">
                {reportData?.burnRatePercent !== null && reportData?.burnRatePercent !== undefined ? `${reportData.burnRatePercent}%` : '—'}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-3">{reportData?.burnRatePercent !== null && reportData?.burnRatePercent !== undefined ? 'Active task energy drain vs. weekly capacity.' : 'No workload data logged yet.'}</p>
          </div>

          <div className="card p-6 border-l-4 border-l-success">
            <p className="text-xs text-text-muted uppercase tracking-widest font-bold mb-2">Boundaries Held</p>
            <div className="flex items-end gap-3">
              <span className="text-4xl font-black text-text-main tracking-tighter">{reportData?.boundariesProtected ?? 0}</span>
              <span className="text-success dark:text-[#4ade80] text-sm flex items-center font-bold mb-1">
                <ShieldAlert className="w-4 h-4 mr-1" /> Practiced
              </span>
            </div>
            <p className="text-xs text-text-muted mt-3">Boundary scripts rehearsed this week.</p>
          </div>
        </div>
      </div>

      {/* Week in Review Metrics Grid */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted mb-4 ml-2">Weekly Recovery Metrics</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Deep Work Protected', value: reportData ? `${reportData.deepWorkHours} hrs` : '—', icon: Clock },
            { label: 'Sleep Debt Carried', value: reportData?.sleepDebtHours !== null && reportData?.sleepDebtHours !== undefined ? `${reportData.sleepDebtHours} hrs` : 'Not logged', icon: Activity },
            { label: 'Boundaries Practised', value: String(reportData?.boundariesProtected ?? 0), icon: ShieldAlert },
            { label: 'Total Points', value: userStats?.points ? `${userStats.points} pts` : 'No data yet', icon: TrendingUp },
          ].map((metric, i) => (
            <div key={i} className="card p-5 group hover:border-primary/30 transition-all cursor-default">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-surface rounded-lg text-text-muted group-hover:text-primary transition-colors">
                  <metric.icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-text-main tracking-tight">{metric.value}</p>
              <p className="text-[10px] uppercase tracking-widest font-bold text-text-muted mt-2">{metric.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Config Customizer Popup Modal */}
      {showConfigModal && (
        <div 
          className="fixed inset-0 z-[120] flex items-center justify-center bg-card/85 backdrop-blur-md p-4 animate-in fade-in duration-300"
          onClick={() => {
            if (!isExporting) setShowConfigModal(false);
          }}
        >
          <div
            ref={configDialogRef as any}
            role="dialog"
            aria-modal="true"
            aria-labelledby="config-modal-title"
            tabIndex={-1}
            className="card bg-background border border-border shadow-lg p-8 max-w-lg w-full relative overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="relative z-10 space-y-6 text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/15 border border-primary/20 rounded-lg flex items-center justify-center text-ember-accent">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="config-modal-title" className="text-xl font-display font-bold text-text-main">Report options</h3>
                  <p className="text-xs text-text-muted">Choose what to include, then save it as a PDF from your print window.</p>
                </div>
              </div>

                <div className="space-y-6">
                  {/* Option toggles */}
                  <div className="space-y-4 bg-surface border border-white/[0.04] p-5 rounded-2xl">
                    <div className="flex justify-between items-center">
                      <div>
                        <p id="ai-commentary-label" className="text-sm font-bold text-text-main">Nova's Core Commentary Block</p>
                        <p className="text-[11px] text-text-muted">Include the latest qualitative bio-behavioural counselling feedback from Coach Nova</p>
                      </div>
                      <input 
                        type="checkbox"
                        checked={includeAICommentary}
                        onChange={(e) => setIncludeAICommentary(e.target.checked)}
                        aria-labelledby="ai-commentary-label"
                        className="h-4 w-4 rounded-md accent-primary"
                      />
                    </div>
                    
                    <div className="border-t border-white/[0.02] pt-4 flex justify-between items-center">
                      <div>
                        <p id="burn-rate-label" className="text-sm font-bold text-text-main">Workload Metrics</p>
                        <p className="text-[11px] text-text-muted">Include workload intensity and boundaries-practiced card</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={includeBurnRate}
                        onChange={(e) => setIncludeBurnRate(e.target.checked)}
                        aria-labelledby="burn-rate-label"
                        className="h-4 w-4 rounded-md accent-primary"
                      />
                    </div>

                    <div className="border-t border-white/[0.02] pt-4 flex justify-between items-center">
                      <div>
                        <p id="metrics-grid-label" className="text-sm font-bold text-text-main">Weekly Recovery Metrics</p>
                        <p className="text-[11px] text-text-muted">Generate data grid report with active Sleep Debt, Deep Work duration, and Total Points</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={includeMetricsGrid}
                        onChange={(e) => setIncludeMetricsGrid(e.target.checked)}
                        aria-labelledby="metrics-grid-label"
                        className="h-4 w-4 rounded-md accent-primary"
                      />
                    </div>

                    <div className="border-t border-white/[0.02] pt-4 flex justify-between items-center">
                      <div>
                        <p id="signature-label" className="text-sm font-bold text-text-main">Legal & Signature Safeguard block</p>
                        <p className="text-[11px] text-text-muted">Append certified counsellor signature slot and corporate compliance line</p>
                      </div>
                      <input 
                        type="checkbox"
                        checked={includeCorporateSignature}
                        onChange={(e) => setIncludeCorporateSignature(e.target.checked)}
                        aria-labelledby="signature-label"
                        className="h-4 w-4 rounded-md accent-primary"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={() => setShowConfigModal(false)}
                      className="flex-1 px-4 py-3 bg-surface border border-white/[0.05] rounded-xl font-bold hover:bg-surface hover:text-text-main transition text-xs cursor-pointer text-text-muted"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={printReport}
                      disabled={isExporting}
                      className="flex-1 px-4 py-3 bg-primary hover:bg-primary-dark text-primary-foreground border border-primary/20 rounded-xl font-bold transition text-xs cursor-pointer"
                    >
                      {isExporting ? 'Opening print window...' : 'Open print window'}
                    </button>
                  </div>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
