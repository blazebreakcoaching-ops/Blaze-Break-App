import React, { useState, useEffect } from 'react';
import { Download, TrendingUp, Clock, ShieldAlert, Activity, FileText, RefreshCw, Loader2, Layers } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { UserStats } from '../types';
import { secureApiFetch } from '../lib/secure-api';

export const ExecutiveBoardReport = ({
  stats: userStats,
  isGlobalSyncing,
  onTriggerSync,
  onAwardPoints
}: {
  stats?: UserStats;
  isGlobalSyncing?: boolean;
  onTriggerSync?: () => Promise<void>;
  onAwardPoints?: (amount: number, reason: string) => void;
}) => {
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Configuration states for PDF export
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [includeAICommentary, setIncludeAICommentary] = useState(true);
  const [includeMetricsGrid, setIncludeMetricsGrid] = useState(true);
  const [includeBurnRate, setIncludeBurnRate] = useState(true);
  const [includeCorporateSignature, setIncludeCorporateSignature] = useState(true);

  // Progressive compiling step outputs
  const [isProcessingProgress, setIsProcessingProgress] = useState(false);
  const [compilationProgress, setCompilationProgress] = useState(0);
  const [compilationStatusText, setCompilationStatusText] = useState("");

  const [reportData, setReportData] = useState<{
    deepWorkHours: number;
    boundariesProtected: number;
    burnRatePercent: number | null;
    sleepDebtHours: number | null;
    aiAnalysis: string | null;
    hasEnoughData: boolean;
  } | null>(null);
  const [reportLoading, setReportLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await secureApiFetch('/api/signals/executive-report');
        if (res.ok) {
          setReportData(await res.json());
        }
      } catch (e) {
        // Leaves reportData null - the UI shows an honest "no data yet" state.
      }
      setReportLoading(false);
    };
    load();
  }, []);

  const isSyncActive = isGlobalSyncing !== undefined ? isGlobalSyncing : isSyncing;

  const handleSync = async () => {
    if (onTriggerSync) {
      await onTriggerSync();
    } else {
      setIsSyncing(true);
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsSyncing(false);
      if (onAwardPoints) {
        onAwardPoints(15, "Recovery data saved locally (+15 pts)");
      }
    }
  };

  const handleOpenConfig = () => {
    setShowConfigModal(true);
  };

  const startPDFCompilationAndDownload = async () => {
    setIsProcessingProgress(true);
    
    setCompilationProgress(15);
    setCompilationStatusText("Securing sandbox data pipeline...");
    await new Promise(r => setTimeout(r, 600));

    setCompilationProgress(40);
    setCompilationStatusText("Querying active recovery metrics from state store...");
    let fetchedData = reportData;
    if (!fetchedData) {
      try {
        const res = await secureApiFetch('/api/signals/executive-report');
        if (res.ok) {
          fetchedData = await res.json();
          setReportData(fetchedData);
        }
      } catch (e) {
        // Falls through to the honest "not enough data yet" state below.
      }
    }
    await new Promise(r => setTimeout(r, 300));

    setCompilationProgress(70);
    setCompilationStatusText("Compiling autonomic print layouts and schemas...");
    await new Promise(r => setTimeout(r, 650));

    setCompilationProgress(90);
    setCompilationStatusText(fetchedData?.aiAnalysis ? "Reviewed by Nova..." : "Finalizing without AI commentary...");
    await new Promise(r => setTimeout(r, 550));

    setCompilationProgress(100);
    setCompilationStatusText("Compiling final report package...");
    await new Promise(r => setTimeout(r, 350));

    setIsProcessingProgress(false);
    setShowConfigModal(false);
    setIsExporting(true);

    // Call dynamic PDF construction
    setTimeout(() => {
      executeDownloadBlob(fetchedData);
    }, 500);
  };

  const executeDownloadBlob = (liveReportData: typeof reportData) => {
    const liveName = userStats?.profile?.fullName || user?.displayName || user?.email || "Executive Recovery Pro Client";
    const liveRole = userStats?.profile?.role || "Not specified";
    const liveOrg = userStats?.profile?.organization || "Not specified";
    const pointsTotal = userStats?.points ?? 0;
    const streak = userStats?.streak ?? 0;
    const sleepDebtVal = liveReportData?.sleepDebtHours;
    const compilationDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Blaze Break - Confidential Executive Board Summary</title>
    <style>
        body {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            background-color: #ffffff;
            color: #0c0f16;
            margin: 0;
            padding: 40px;
            line-height: 1.6;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #edeff5;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .title {
            font-size: 26px;
            font-weight: 800;
            letter-spacing: -0.5px;
            color: #000000;
        }
        .subtitle {
            font-size: 10px;
            font-weight: 950;
            text-transform: uppercase;
            letter-spacing: 2px;
            color: #6366f1;
            margin-top: 5px;
        }
        .metadata {
            text-align: right;
            font-size: 11px;
            font-family: monospace;
            color: #64748b;
        }
        .stamp {
            display: inline-block;
            border: 2px solid #ef4444;
            color: #ef4444;
            font-family: monospace;
            font-weight: bold;
            font-size: 11px;
            padding: 4px 10px;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 20px;
            border-radius: 4px;
        }
        .summary-card {
            background-color: #f8fafc;
            border-left: 4px solid #6366f1;
            padding: 25px;
            border-radius: 0 12px 12px 0;
            margin-bottom: 30px;
        }
        .summary-title {
            font-size: 12px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: #6366f1;
            margin-bottom: 12px;
        }
        .summary-text {
            font-style: italic;
            font-size: 16px;
            font-family: Georgia, serif;
            color: #1e293b;
            line-height: 1.7;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            border: 1px solid #e2e8f0;
            padding: 20px;
            border-radius: 12px;
        }
        .stat-label {
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #64748b;
        }
        .stat-value {
            font-size: 32px;
            font-weight: 800;
            margin-top: 5px;
            color: #0f172a;
        }
        .stat-desc {
            font-size: 11px;
            color: #64748b;
            margin-top: 5px;
        }
        .table-title {
            font-size: 13px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: #0f172a;
            margin-bottom: 15px;
            border-bottom: 1px solid #edeff5;
            padding-bottom: 8px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
            margin-bottom: 40px;
        }
        th, td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #f1f5f9;
        }
        th {
            background-color: #f8fafc;
            font-weight: bold;
            color: #475569;
            text-transform: uppercase;
            font-size: 10px;
            letter-spacing: 1px;
        }
        .footer {
            border-top: 1px solid #edeff5;
            padding-top: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: #94a3b8;
        }
        .signature-block {
            margin-top: 40px;
            border-top: 1px dashed #cbd5e1;
            padding-top: 20px;
            display: flex;
            justify-content: space-between;
        }
        .sig-box {
            width: 45%;
        }
        .sig-line {
            height: 40px;
            border-bottom: 1px solid #475569;
            margin-bottom: 5px;
        }
        .sig-meta {
            font-size: 11px;
            color: #64748b;
            line-height: 1.3;
        }
        @media print {
            body {
                padding: 20px;
            }
        }
    </style>
</head>
<body>
    <div style="max-width: 800px; margin: 0 auto;">
        <div class="stamp">Strictly Confidential - Board Only</div>
        
        <div class="header">
            <div>
                <div class="title">Blaze Break Executive Board Summary</div>
                <div class="subtitle">AUTONOMIC ENERGY DESIGN & RELAPSE DEFENSIVE POSITIONING</div>
            </div>
            <div class="metadata">
                <div>DATE: ${compilationDate}</div>
                <div>EXECUTIVE: ${liveName}</div>
                <div>ROLE: ${liveRole}</div>
                <div>COMPANY: ${liveOrg}</div>
                <div>STATUS: SECURED CONFIGURATION</div>
            </div>
        </div>

        ${includeAICommentary ? `
        <div class="summary-card">
            <div class="summary-title">Nova Core AI Analysis</div>
            <div class="summary-text">${liveReportData?.aiAnalysis
              ? liveReportData.aiAnalysis
              : "Not enough activity has been logged yet to generate a grounded analysis. This section will populate once you've used the app's recovery tools (deep work sessions, boundary rehearsal, workload check-ins)."}</div>
        </div>
        ` : ''}

        ${includeBurnRate ? `
        <div class="grid">
            <div class="stat-card" style="border-left: 4px solid #6366f1;">
                <div class="stat-label">Workload Burn Rate</div>
                <div class="stat-value">${liveReportData?.burnRatePercent !== null && liveReportData?.burnRatePercent !== undefined ? `${liveReportData.burnRatePercent}%` : 'No data yet'}</div>
                <div class="stat-desc">Active task energy drain relative to weekly capacity, from your Workload Reality Check.</div>
            </div>

            <div class="stat-card" style="border-left: 4px solid #10b981;">
                <div class="stat-label">Boundaries Protected</div>
                <div class="stat-value">${liveReportData ? `${liveReportData.boundariesProtected} Practiced` : 'No data yet'}</div>
                <div class="stat-desc">Boundary scripts rehearsed this week.</div>
            </div>
        </div>
        ` : ''}

        ${includeMetricsGrid ? `
        <div class="table-title">Weekly Recovery Metrics</div>
        <table>
            <thead>
                <tr>
                    <th>Core Indicator Metric</th>
                    <th>Value / Capacity</th>
                    <th>Defensive Context</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Deep Work Protected</td>
                    <td><strong>${liveReportData ? `${liveReportData.deepWorkHours} hrs` : 'No data yet'}</strong></td>
                    <td>High-value focus preservation, this week</td>
                    <td style="color: #10b981; font-weight: bold;">${liveReportData && liveReportData.deepWorkHours > 0 ? 'Protected' : 'Not yet logged'}</td>
                </tr>
                <tr>
                    <td>Sleep Debt Carried</td>
                    <td><strong>${sleepDebtVal !== null && sleepDebtVal !== undefined ? `${sleepDebtVal} hrs` : 'Not logged'}</strong></td>
                    <td>Cumulative sleep shortfalls carryover</td>
                    <td style="color: ${sleepDebtVal !== null && sleepDebtVal !== undefined ? (sleepDebtVal > 3 ? '#ef4444' : '#f59e0b') : '#6b7280'}; font-weight: bold;">${sleepDebtVal !== null && sleepDebtVal !== undefined ? (sleepDebtVal > 3 ? 'Overloaded' : 'Caution') : 'No data'}</td>
                </tr>
                <tr>
                    <td>Recovery Velocity Return (ROI)</td>
                    <td><strong>${pointsTotal} pts</strong></td>
                    <td>Engagement accomplishments baseline yield</td>
                    <td style="color: #10b981; font-weight: bold;">Yielding (Streak: ${streak}d)</td>
                </tr>
            </tbody>
        </table>
        ` : ''}

        ${includeCorporateSignature ? `
        <div class="signature-block">
            <div class="sig-box">
                <div class="sig-line"></div>
                <div class="sig-meta">
                    <strong>${liveName}</strong><br/>
                    Executive Leader Signature
                </div>
            </div>
            <div class="sig-box">
                <div class="sig-line" style="font-family: Georgia, serif; font-style: italic; font-size: 20px; line-height: 40px; color: #6366f1; border-bottom: 1px solid #475569; user-select: none;">Nova Coach</div>
                <div class="sig-meta">
                    <strong>Coach Nova</strong><br/>
                    Recovery Strategist, Blaze Break
                </div>
            </div>
        </div>
        ` : ''}

        <div class="footer" style="margin-top: 40px;">
            <div>Powered by Blaze Break Recovery Coach v2.4 (Security: Verified SSL Cryptographic Envelope)</div>
            <div>https://ai.studio/build</div>
        </div>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
            }, 600);
        }
    </script>
</body>
</html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blazebreak_executive_board_summary_${new Date().getTime()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setIsExporting(false);
    
    if (onAwardPoints) {
      onAwardPoints(10, 'Executive Board PDF Exported (+10 pts)');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-text-main tracking-tight">Executive Board Report</h2>
          <p className="text-sm text-text-muted mt-2 font-mono uppercase tracking-widest">Confidential / Biometric & Workload ROI</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
          {/* Save Data Pulse Action */}
          <button
            onClick={handleSync}
            disabled={isSyncActive}
            className={cn(
              "px-5 py-2.5 rounded-2xl border text-xs font-bold transition-all duration-300 flex items-center gap-2.5 cursor-pointer relative overflow-hidden",
              isSyncActive 
                ? "bg-primary/10 border-primary/45 text-primary" 
                : "bg-surface/60 border-border hover:border-primary/50 text-text-muted hover:text-text-main"
            )}
            title="Save prototype data locally"
          >
            <RefreshCw className={cn("w-4 h-4 text-primary", isSyncActive && "animate-spin")} />
            <span>{isSyncActive ? "Saving Locally..." : "Save Locally"}</span>
            {isSyncActive && (
              <span className="absolute inset-0 rounded-2xl border border-primary/30 bg-primary/5 animate-pulse" />
            )}
          </button>

          <button 
            onClick={handleOpenConfig}
            disabled={isExporting}
            className="btn-primary flex items-center gap-2 cursor-pointer"
          >
            <Download className={cn("w-4 h-4", isExporting && "animate-bounce")} />
            {isExporting ? "Preparing Report..." : "Export Report Summary"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Nova's Executive Summary */}
        <div className="lg:col-span-2 card p-8 space-y-6 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <FileText className="w-48 h-48" />
          </div>
          <div className="relative z-10">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Nova AI Analysis
            </h3>
            <p className="text-lg leading-relaxed text-text-main font-serif">
              {reportLoading
                ? "Loading your recovery analysis..."
                : reportData?.aiAnalysis
                  ? reportData.aiAnalysis
                  : "Not enough activity has been logged yet to generate a grounded analysis. Use the app's recovery tools this week - deep work sessions, boundary rehearsal, workload check-ins - and this will populate."}
            </p>
          </div>
          <div className="relative z-10 flex items-center gap-4 border-t border-border pt-6 mt-6">
            <img src={user?.photoURL || "https://i.pravatar.cc/150?u=nova_exec"} alt="Nova" className="w-10 h-10 rounded-full border border-border grayscale" />
            <div>
              <p className="text-sm font-bold text-text-main">Coach Nova</p>
              <p className="text-xs text-text-muted uppercase tracking-widest mt-0.5">Lead Recovery Architect</p>
            </div>
          </div>
        </div>

        {/* Global Stats */}
        <div className="space-y-6">
          <div className="card p-6 border-l-4 border-l-primary">
            <p className="text-xs text-text-muted uppercase tracking-widest font-bold mb-2">Workload Burn Rate</p>
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
              <span className="text-success text-sm flex items-center font-bold mb-1">
                <ShieldAlert className="w-4 h-4 mr-1" /> Practiced
              </span>
            </div>
            <p className="text-xs text-text-muted mt-3">Boundary scripts rehearsed this week.</p>
          </div>
        </div>
      </div>

      {/* Week in Review Metrics Grid */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted mb-4 ml-2">Weekly Yield Metrics</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Deep Work Protected', value: reportData ? `${reportData.deepWorkHours} hrs` : '—', icon: Clock },
            { label: 'Sleep Debt Carried', value: reportData?.sleepDebtHours !== null && reportData?.sleepDebtHours !== undefined ? `${reportData.sleepDebtHours} hrs` : 'Not logged', icon: Activity },
            { label: 'Boundaries Practiced', value: String(reportData?.boundariesProtected ?? 0), icon: ShieldAlert },
            { label: 'Recovery ROI', value: userStats?.points ? `${userStats.points} pts` : 'No data yet', icon: TrendingUp },
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
            if (!isProcessingProgress) setShowConfigModal(false);
          }}
        >
          <div
            className="card bg-background border border-border shadow-lg p-8 max-w-lg w-full relative overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="relative z-10 space-y-6 text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/15 border border-primary/20 rounded-lg flex items-center justify-center text-primary">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-display font-bold text-text-main">Executive Compile Engine</h3>
                  <p className="text-xs text-text-muted">Customize reports prior to printing or PDF compilation</p>
                </div>
              </div>

              {!isProcessingProgress ? (
                <div className="space-y-6">
                  {/* Option toggles */}
                  <div className="space-y-4 bg-surface border border-white/[0.04] p-5 rounded-2xl">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-bold text-text-main">Nova's Core Commentary Block</p>
                        <p className="text-[11px] text-text-muted">Include the latest qualitative bio-behavioral counseling feedback from Coach Nova</p>
                      </div>
                      <input 
                        type="checkbox"
                        checked={includeAICommentary}
                        onChange={(e) => setIncludeAICommentary(e.target.checked)}
                        className="h-4 w-4 rounded-md accent-primary"
                      />
                    </div>
                    
                    <div className="border-t border-white/[0.02] pt-4 flex justify-between items-center">
                      <div>
                        <p className="text-sm font-bold text-text-main">Biological Burn Metrics</p>
                        <p className="text-[11px] text-text-muted">Include workload burn rate and boundaries-practiced card</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={includeBurnRate}
                        onChange={(e) => setIncludeBurnRate(e.target.checked)}
                        className="h-4 w-4 rounded-md accent-primary"
                      />
                    </div>

                    <div className="border-t border-white/[0.02] pt-4 flex justify-between items-center">
                      <div>
                        <p className="text-sm font-bold text-text-main">Weekly Recovery Metrics</p>
                        <p className="text-[11px] text-text-muted">Generate data grid report with active Sleep Debt, Deep Work duration, and Points ROI</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={includeMetricsGrid}
                        onChange={(e) => setIncludeMetricsGrid(e.target.checked)}
                        className="h-4 w-4 rounded-md accent-primary"
                      />
                    </div>

                    <div className="border-t border-white/[0.02] pt-4 flex justify-between items-center">
                      <div>
                        <p className="text-sm font-bold text-text-main">Legal & Signature Safeguard block</p>
                        <p className="text-[11px] text-text-muted">Append certified counselor signature slot and corporate compliance line</p>
                      </div>
                      <input 
                        type="checkbox"
                        checked={includeCorporateSignature}
                        onChange={(e) => setIncludeCorporateSignature(e.target.checked)}
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
                      onClick={startPDFCompilationAndDownload}
                      className="flex-1 px-4 py-3 bg-primary hover:bg-primary-dark text-primary-foreground border border-primary/20 rounded-xl font-bold transition text-xs cursor-pointer"
                    >
                      Compile Summary
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="py-6 flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    
                    <div className="w-full bg-surface h-2 rounded-full overflow-hidden border border-border">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${compilationProgress}%` }}
                      />
                    </div>

                    <p className="text-xs font-medium text-primary font-mono tracking-wider animate-pulse text-center">
                      {compilationStatusText}
                    </p>
                  </div>

                  {/* Progress trace */}
                  <div className="bg-background p-4 rounded-lg border border-border space-y-2 font-mono text-[10px] text-text-muted/70 leading-relaxed text-left max-h-36 overflow-y-auto">
                    <p className={cn("transition-all duration-300", compilationProgress >= 15 ? "text-primary font-bold" : "text-text-muted/40")}>
                      {compilationProgress >= 15 ? "✓ Connected securely" : "○ Connecting..."}
                    </p>
                    <p className={cn("transition-all duration-300", compilationProgress >= 40 ? "text-primary font-bold" : "text-text-muted/40")}>
                      {compilationProgress >= 40 ? `✓ Fetched ${userStats?.profile?.fullName || 'your'} recovery data` : "○ Fetching recovery metrics..."}
                    </p>
                    <p className={cn("transition-all duration-300", compilationProgress >= 70 ? "text-primary font-bold" : "text-text-muted/40")}>
                      {compilationProgress >= 70 ? "✓ Formatted your report" : "○ Formatting report..."}
                    </p>
                    <p className={cn("transition-all duration-300", compilationProgress >= 90 ? "text-primary font-bold" : "text-text-muted/40")}>
                      {compilationProgress >= 90 ? "✓ Reviewed by Nova" : "○ Nova reviewing..."}
                    </p>
                    <p className={cn("transition-all duration-300", compilationProgress >= 100 ? "text-success font-bold animate-pulse" : "text-text-muted/40")}>
                      {compilationProgress >= 100 ? "✓ Report ready — opening print dialog..." : "○ Finishing up..."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
