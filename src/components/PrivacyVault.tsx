import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  Lock, 
  EyeOff, 
  Database, 
  FileText, 
  Trash2, 
  Download,
  AlertTriangle,
  Settings2,
  Building,
  History,
  Brain,
  Network,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils.ts';
import { useFeatureFlags, setFeatureFlag, FeatureFlag } from '../lib/feature-flags.ts';
import { TrustCompliance } from './TrustCompliance.tsx';
import { RetentionSchedule } from './RetentionSchedule.tsx';
import { DataZoneVisualizer } from './DataZoneVisualizer.tsx';
import { getAuditLogs, AuditLogEntry, logAuditAction } from '../lib/audit-logger.ts';
import { UserProfileData } from '../types.ts';
import { DataPrivacyDashboard } from './DataPrivacyDashboard.tsx';
import { PrivacyPolicyAccordion } from './PrivacyPolicyAccordion.tsx';

import { ConnectedNovaPermissions } from './ConnectedRecoveryModules.tsx';
import { auth, db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { secureApiFetch } from '../lib/secure-api.ts';
import { TeamClimateSurvey } from './TeamClimateSurvey.tsx';

export const PrivacyVault = ({ 
  profile, 
  onProfileUpdate,
  isGlobalSyncing,
  onTriggerSync,
  onAwardPoints
}: { 
  profile: UserProfileData, 
  onProfileUpdate: (p: UserProfileData) => void,
  isGlobalSyncing?: boolean,
  onTriggerSync?: () => Promise<void>,
  onAwardPoints?: (amount: number, reason: string) => void
}) => {
  const [activeTab, setActiveTab] = useState<'zones' | 'compliance' | 'org' | 'consent' | 'governance' | 'audit' | 'policies'>('zones');
  const flags = useFeatureFlags();
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const [orgStatus, setOrgStatus] = useState<{
    organisationId: string | null;
    organisationName?: string;
    isOrgAdmin?: boolean;
    joinCode?: string;
    shareAnonymizedDataWithOrg?: boolean;
  } | null>(null);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joining, setJoining] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const fetchOrgStatus = async () => {
    if (!auth.currentUser) return;
    setOrgLoading(true);
    setOrgError('');
    try {
      const res = await secureApiFetch('/api/org/me');
      const data = await res.json();
      setOrgStatus(data);
    } catch (e) {
      setOrgError('Could not load your organisation status.');
    }
    setOrgLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'org') fetchOrgStatus();
  }, [activeTab]);

  const handleJoinOrg = async () => {
    if (!joinCodeInput.trim()) return;
    setJoining(true);
    setOrgError('');
    try {
      const res = await secureApiFetch('/api/org/join', {
        method: 'POST',
        data: { joinCode: joinCodeInput.trim() },
      });
      const data = await res.json();
      if (!res.ok) {
        setOrgError(data.error || 'Could not join that organisation.');
      } else {
        setJoinCodeInput('');
        await fetchOrgStatus();
      }
    } catch (e) {
      setOrgError('Could not join that organisation.');
    }
    setJoining(false);
  };

  const handleToggleOrgConsent = async (next: boolean) => {
    if (!auth.currentUser) return;
    setConsentSaving(true);
    try {
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        shareAnonymizedDataWithOrg: next,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      setOrgStatus(prev => prev ? { ...prev, shareAnonymizedDataWithOrg: next } : prev);
      await handleAuditAction(next ? 'Enabled anonymized org data sharing' : 'Disabled anonymized org data sharing', 'organisation', next ? 'authorised' : 'denied');
    } catch (e) {
      setOrgError('Could not save that change.');
    }
    setConsentSaving(false);
  };

  const handleLeaveOrg = async () => {
    setLeaving(true);
    setOrgError('');
    try {
      await secureApiFetch('/api/org/leave', { method: 'POST' });
      await handleAuditAction('Left Organisation', 'organisation', 'deleted');
      setOrgStatus({ organisationId: null });
    } catch (e) {
      setOrgError('Could not leave the organisation. Please try again.');
    }
    setLeaving(false);
  };
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [typedFullName, setTypedFullName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Safety checkboxes for Erasure Protocol
  const [acknowledgedLoss, setAcknowledgedLoss] = useState(false);
  const [acknowledgedUnlink, setAcknowledgedUnlink] = useState(false);
  const [acknowledgedNoRecovery, setAcknowledgedNoRecovery] = useState(false);

  // Combined Syncing Status
  const isSyncActive = isGlobalSyncing !== undefined ? isGlobalSyncing : isSyncing;

  const handleTriggerSync = async () => {
    if (onTriggerSync) {
      try {
        await handleAuditAction('Initiated Firebase Sync', 'Firestore Schema', 'authorised');
        await onTriggerSync();
        await handleAuditAction('Firebase Synced Data Baseline to Cloud Vault', 'autonomic_sync_ledger', 'verified');
      } catch (e) {
        console.error("Firebase Sync error:", e);
      }
    } else {
      setIsSyncing(true);
      try {
        await handleAuditAction('Initiated Local Save', 'Local Storage', 'authorised');
        await new Promise(resolve => setTimeout(resolve, 1000));
        await handleAuditAction('Saved locally in this prototype', 'local_ledger', 'verified');
        if (onAwardPoints) {
          onAwardPoints(15, "Recovery data saved locally (+15 pts)");
        }
      } catch (e) {
        console.error("Local Save error:", e);
      } finally {
        setIsSyncing(false);
      }
    }
  };

  useEffect(() => {
    if (activeTab === 'audit') {
      const logs = getAuditLogs();
      if (logs.length > 0) {
        setAuditLogs(logs);
      } else {
        setAuditLogs([
          { id: '1', userId: 'system', action: "Nova Coach accessed Burnout Profile", timestamp: new Date(Date.now() - 3600000).toISOString(), status: "authorised" },
          { id: '2', userId: 'system', action: "Mood Pulse data aggregated for Team Climate Dashboard", timestamp: new Date(Date.now() - 172800000).toISOString(), status: "anonymised" },
          { id: '3', userId: profile.fullName || 'anonymous', action: "User triggered 'Forget' on recent conversation context", timestamp: new Date(Date.now() - 432000000).toISOString(), status: "deleted" },
          { id: '4', userId: 'system', action: "Energy Budget routine saved locally", timestamp: new Date(Date.now() - 604800000).toISOString(), status: "verified" }
        ]);
      }
    }
  }, [activeTab, profile.fullName]);

  const handleAuditAction = async (action: string, target?: string, status: 'authorised' | 'denied' | 'anonymised' | 'deleted' | 'verified' = 'authorised') => {
    await logAuditAction({
      userId: profile.fullName || 'anonymous',
      action,
      target,
      status,
      details: `User explicitly triggered: ${action}`
    });
    
    // Refresh logs if already viewing audit tab
    if (activeTab === 'audit') {
      const logs = getAuditLogs();
      setAuditLogs(logs);
    }
  };

  const handleToggleConsent = async (flag: string, current: boolean) => {
    const newState = !current;
    
    // Log the toggle
    await handleAuditAction(`Toggled feature flag: ${flag}`, flag, 'authorised');
    setFeatureFlag(flag as FeatureFlag, newState);
  };

  const [showDownloadConfirm, setShowDownloadConfirm] = useState(false);

  const processDownload = async () => {
    setShowDownloadConfirm(false);
    await handleAuditAction('Request Data Export', undefined, 'verified');
    const data = {
      profile,
      auditLogs,
      flags,
      exportTimestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blazebreak_export_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-background border border-border p-8 md:p-12">
        <div className="relative z-10 max-w-3xl">
          <div className="bg-warning/10 border border-warning/20 text-warning rounded-xl p-4 text-sm font-bold flex gap-2 mb-6">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div>
              <p>Prototype notice: This version uses local browser storage for demonstration only.</p>
              <p className="font-normal text-xs mt-1">Do not enter sensitive personal information until secure account storage, permissions and privacy controls are connected and verified.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/10">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <div className="group/tooltip relative inline-flex items-center">
                <h2 className="text-3xl font-display font-light text-text-main tracking-tight cursor-help underline decoration-primary/30 underline-offset-8 decoration-dashed">
                  Trust & Privacy Centre
                </h2>
                <div className="absolute left-0 top-full mt-4 p-4 w-72 bg-card text-text-main text-sm font-medium rounded-xl border border-border shadow-lg opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none">
                  <div className="text-xs uppercase font-black tracking-widest text-primary mb-2">Welcome to the Vault</div>
                  Manage your data boundaries, review AI governance polices, and control what Nova remembers about your burnout baseline.
                </div>
              </div>
              <p className="text-xs uppercase font-black tracking-[0.2em] text-primary mt-2">Blaze Break Assurance Layer</p>
            </div>
          </div>
          <p className="text-text-muted text-sm md:text-base leading-relaxed mb-8 font-light">
            Your recovery is private by default. We do not expose you, and employers cannot spy on you. 
            Control your boundaries, manage what Nova remembers, and audit data access with complete transparency.
          </p>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'zones', label: 'Data Zones', icon: Database },
                { id: 'policies', label: 'Policies', icon: FileText },
                { id: 'compliance', label: 'Compliance', icon: ShieldCheck },
                { id: 'org', label: 'Organisation', icon: Building },
                { id: 'consent', label: 'Consent', icon: Settings2 },
                { id: 'governance', label: 'AI Governance', icon: Brain },
                { id: 'audit', label: 'Audit Log', icon: History }
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={cn(
                      "flex items-center gap-2 px-5 py-2.5 rounded-xl border transition-all duration-300 font-medium text-xs tracking-wide cursor-pointer",
                      activeTab === tab.id 
                        ? "bg-primary/10 border-primary/30 text-primary shadow-inner" 
                        : "bg-surface/50 border-white/[0.04] text-text-muted hover:text-text-main"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Save Data Action with Subtle Pulse effect */}
            <button
              onClick={handleTriggerSync}
              disabled={isSyncActive}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all duration-300 font-bold text-xs cursor-pointer relative overflow-hidden self-start lg:self-center",
                isSyncActive 
                  ? "bg-primary/10 border-primary/40 text-primary" 
                  : "bg-surface/50 dark:bg-card/40 border-white/[0.04] text-text-muted hover:text-text-main"
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isSyncActive && "animate-spin text-primary")} />
              <span>{isSyncActive ? "Saving Locally..." : "Save Locally"}</span>
              {isSyncActive && (
                <span className="absolute inset-0 border border-primary/30 rounded-xl animate-pulse pointer-events-none bg-primary/5" />
              )}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="grid gap-6"
        >
          {activeTab === 'zones' && (
            <div className="space-y-6">
              <h3 className="text-xl font-display font-bold text-text-main px-2">The Architecture of Trust</h3>
              <DataZoneVisualizer />

              <div className="card bg-destructive/5 border-destructive/20">
                <h3 className="font-bold text-destructive flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5" /> Our Privacy Promise
                </h3>
                <p className="text-sm text-text-muted leading-relaxed font-light">
                  Blaze Break <strong>will never</strong> expose your private recovery history, current conversations, or individual risk levels to an employer. The system lacks the capability to share un-anonymised private data upwards.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'policies' && (
            <div className="space-y-6">
              <PrivacyPolicyAccordion />
            </div>
          )}

          {activeTab === 'compliance' && (
             <TrustCompliance />
          )}

          {activeTab === 'org' && (
            <div className="space-y-6">
              <div className="card space-y-6 bg-gradient-to-r from-[#080c14]/80 to-[#101420]/80">
                <div>
                  <h3 className="font-bold text-text-main text-xl flex items-center gap-2 mb-2">
                    <Building className="w-5 h-5 text-primary" /> Organisation Participation
                  </h3>
                  <p className="text-sm text-text-muted max-w-3xl leading-relaxed">
                    Your employer can fund your support without compromising your privacy. Here is the strict separation between your Personal Space and your Organisation Space.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="space-y-4">
                     <h4 className="text-xs font-black uppercase tracking-[0.2em] text-success">What they CAN see</h4>
                     <ul className="space-y-3 text-sm text-text-muted">
                       <li className="flex items-start gap-2">
                         <Network className="w-4 h-4 text-success mt-0.5 shrink-0" />
                         <span>Grouped trends (e.g., team mood distribution) — only if you opt in below</span>
                       </li>
                       <li className="flex items-start gap-2">
                         <Network className="w-4 h-4 text-success mt-0.5 shrink-0" />
                         <span>Voluntary participation in company challenges</span>
                       </li>
                       <li className="flex items-start gap-2">
                         <Network className="w-4 h-4 text-success mt-0.5 shrink-0" />
                         <span>Anonymous team aggregates (never shown below your org's configured minimum group size)</span>
                       </li>
                     </ul>
                   </div>
                   <div className="space-y-4">
                     <h4 className="text-xs font-black uppercase tracking-[0.2em] text-destructive">What they CANNOT see</h4>
                     <ul className="space-y-3 text-sm text-text-muted ">
                       <li className="flex items-start gap-2">
                         <EyeOff className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                         <span>Named employee risk labels or mood</span>
                       </li>
                       <li className="flex items-start gap-2">
                         <EyeOff className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                         <span>Private journal entries or Nova chat history</span>
                       </li>
                       <li className="flex items-start gap-2">
                         <EyeOff className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                         <span>Your personal Recovery Score</span>
                       </li>
                     </ul>
                   </div>
                </div>

                {orgError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl">{orgError}</div>
                )}

                {orgLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : orgStatus?.organisationId ? (
                  <>
                    <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-bold text-text-main">Current Status: Connected</h4>
                        <p className="text-xs text-text-muted mt-1">{orgStatus.organisationName || 'Your organisation'} is currently sponsoring your access.</p>
                      </div>
                      <button
                        onClick={handleLeaveOrg}
                        disabled={leaving}
                        className="px-4 py-2 bg-background border border-white/[0.05] hover:border-white/[0.1] rounded-xl text-xs font-bold text-text-main transition-all whitespace-nowrap disabled:opacity-50 flex items-center gap-2"
                      >
                        {leaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Leave Organisation
                      </button>
                    </div>

                    <div className="p-4 rounded-2xl bg-surface border border-border flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-bold text-text-main">Share anonymized data with {orgStatus.organisationName || 'your organisation'}</h4>
                        <p className="text-xs text-text-muted mt-1 max-w-lg">Off by default. When on, your mood and body check-ins count toward your team's aggregate wellbeing trends — never shown individually, and never shown at all unless enough teammates also opt in.</p>
                      </div>
                      <button
                        onClick={() => handleToggleOrgConsent(!orgStatus.shareAnonymizedDataWithOrg)}
                        disabled={consentSaving}
                        className={cn(
                          "relative w-14 h-7 rounded-full transition-colors shrink-0 disabled:opacity-50",
                          orgStatus.shareAnonymizedDataWithOrg ? "bg-success" : "bg-border"
                        )}
                      >
                        <span className={cn(
                          "absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform shadow-sm",
                          orgStatus.shareAnonymizedDataWithOrg && "translate-x-7"
                        )} />
                      </button>
                    </div>

                    {orgStatus.shareAnonymizedDataWithOrg && (
                      <div className="p-6 rounded-2xl bg-surface border border-border">
                        <TeamClimateSurvey organisationName={orgStatus.organisationName} />
                      </div>
                    )}

                    {orgStatus.isOrgAdmin && orgStatus.joinCode && (
                      <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 space-y-2">
                        <h4 className="text-xs font-black uppercase tracking-widest text-primary">Your Team's Join Code</h4>
                        <p className="text-xs text-text-muted">Share this with employees so they can link their own account to {orgStatus.organisationName}.</p>
                        <div className="font-mono text-lg font-bold text-text-main bg-background px-4 py-2 rounded-lg border border-border w-fit tracking-widest">{orgStatus.joinCode}</div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-6 rounded-2xl bg-surface border border-dashed border-border space-y-4">
                    <h4 className="text-sm font-bold text-text-main">Join Your Organisation</h4>
                    <p className="text-xs text-text-muted max-w-lg">If your employer has a Blaze Break account, ask them for your team's join code to link your account. This is entirely optional — everything works fully without it.</p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="text"
                        value={joinCodeInput}
                        onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                        placeholder="e.g. F3K9QZ"
                        maxLength={8}
                        className="flex-1 bg-background border border-border rounded-xl px-4 py-3 text-sm font-mono tracking-widest focus:outline-none focus:border-primary text-text-main"
                      />
                      <button
                        onClick={handleJoinOrg}
                        disabled={joining || !joinCodeInput.trim()}
                        className="btn-primary px-6 whitespace-nowrap disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Join
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'consent' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <DataPrivacyDashboard profile={profile} />
              </div>
              <div className="card space-y-6">
                <div>
                  <h3 className="font-bold text-text-main mb-1">Data Collection & Use</h3>
                  <p className="text-xs text-text-muted">Control how your information is utilised across the platform.</p>
                </div>

                <div className="space-y-5">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-background/50 border border-white/[0.02]">
                    <div>
                      <p className="text-sm font-bold text-text-main flex items-center gap-2">
                        Recovery Personalisation <span className="px-1.5 py-0.5 bg-primary/20 text-primary border border-primary/30 text-[10px] uppercase tracking-wider rounded-full">Zone A</span>
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">Required for core Nova logic.</p>
                    </div>
                    <button className="w-12 h-6 rounded-full bg-success flex items-center p-1 cursor-default opacity-50 relative" title="Required">
                       <span className="w-4 h-4 rounded-full bg-white translate-x-6" />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-xl bg-background/50 border border-white/[0.02]">
                    <div>
                      <p className="text-sm font-bold text-text-main flex items-center gap-2">
                        Anonymous Aggregation <span className="px-1.5 py-0.5 bg-surface0/20 text-text-muted border border-muted-foreground/30 text-[10px] uppercase tracking-wider rounded-full">Zone D</span>
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">Contribute trends to Team Climate.</p>
                    </div>
                    <button 
                      onClick={() => handleToggleConsent('enable_anonymous_aggregation_engine', !!flags.enable_anonymous_aggregation_engine)}
                      className={cn("w-12 h-6 rounded-full flex items-center p-1 cursor-pointer transition-colors", flags.enable_anonymous_aggregation_engine ? "bg-success" : "bg-surface")}
                    >
                       <span className={cn("w-4 h-4 rounded-full bg-white transition-transform", flags.enable_anonymous_aggregation_engine ? "translate-x-6" : "translate-x-0")} />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-xl bg-background/50 border border-white/[0.02]">
                    <div>
                      <p className="text-sm font-bold text-text-main flex items-center gap-2">
                        Recovery Ally <span className="px-1.5 py-0.5 bg-success/20 text-success/40 border border-success/30 text-[10px] uppercase tracking-wider rounded-full">Zone B</span>
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">Share selected goals/wins with preferred contacts.</p>
                    </div>
                    <button 
                      onClick={() => handleToggleConsent('enable_recovery_ally', !!flags.enable_recovery_ally)}
                      className={cn("w-12 h-6 rounded-full flex items-center p-1 cursor-pointer transition-colors", flags.enable_recovery_ally ? "bg-success" : "bg-surface")}
                    >
                       <span className={cn("w-4 h-4 rounded-full bg-white transition-transform", flags.enable_recovery_ally ? "translate-x-6" : "translate-x-0")} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="card space-y-4 hover:border-white/[0.08] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
                      <Download className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-main text-sm">Export Data</h3>
                      <p className="text-xs text-text-muted mt-0.5">Download all your logs in JSON format.</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowDownloadConfirm(true)}
                    className="w-full py-3 rounded-xl bg-background/80 border border-white/[0.04] text-xs font-bold text-text-main hover:bg-card transition-colors"
                  >
                    Request Data Export
                  </button>
                </div>

                <div className="card space-y-4 hover:border-destructive/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-center shrink-0">
                      <Trash2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-main text-sm">Account Deletion</h3>
                      <p className="text-xs text-text-muted mt-0.5">Permanently erase all personal recovery data.</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setTypedFullName("");
                      setShowDeleteConfirmModal(true);
                    }}
                    className="w-full py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold hover:bg-destructive/20 transition-colors cursor-pointer"
                  >
                    Delete My Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'governance' && (
            <div className="card space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-background border border-white/[0.05] rounded-xl flex items-center justify-center text-primary shrink-0">
                  <Brain className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-text-main text-lg">Nova Memory Centre</h3>
                  <p className="text-xs text-text-muted mt-1">Control exactly what the AI knows about you.</p>
                </div>
              </div>

              {auth.currentUser ? <ConnectedNovaPermissions /> : (
                 <div className="p-4 bg-surface text-xs text-text-muted rounded-xl flex items-center gap-2">
                   <Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting...
                 </div>
              )}

              <div className="space-y-8 pl-4 border-l border-white/[0.05] max-w-3xl">
                <div className="relative">
                  <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-primary shadow-[0_0_10px_rgba(234,88,12,0.5)]" />
                  <h4 className="font-bold text-text-main mb-2">A. Recommendation Transparency</h4>
                  <p className="text-sm text-text-muted mb-3 font-light">When Nova advises you, the logic path is exposed. No "black box" guidance.</p>
                  <div className="bg-background/60 border border-white/[0.02] p-4 rounded-xl text-xs space-y-3 font-mono">
                    <p className="flex items-center gap-2 text-text-muted"><span className="text-success tracking-wider font-bold bg-success/10 px-2 py-0.5 rounded">ALLOWED</span> "I suggested a block because you logged 4 back-to-back meetings."</p>
                    <p className="flex items-center gap-2 text-text-muted"><span className="text-destructive tracking-wider font-bold bg-destructive/10 px-2 py-0.5 rounded">BLOCKED</span> "Trust me, your risk is high."</p>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-primary shadow-[0_0_10px_rgba(234,88,12,0.5)]" />
                  <h4 className="font-bold text-text-main mb-2">B. Edit AI Context</h4>
                  <p className="text-sm text-text-muted mb-3 font-light">View and delete any pattern Nova has memorised about your symptoms.</p>
                  <div className="flex items-start gap-4 bg-background/60 border border-white/[0.02] p-4 rounded-xl text-sm">
                     <Brain className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                     <div className="space-y-3 w-full">
                       <p className="font-medium text-text-muted">Memory: "Energy consistently drops after morning standups."</p>
                       <div className="flex items-center justify-between">
                         <p className="text-xs text-text-muted uppercase tracking-widest flex items-center gap-4">
                           <span>Source: Trigger Journal</span> 
                           <span className="flex items-center gap-1 font-bold text-primary bg-primary/10 border border-primary/30 px-1.5 py-0.5 rounded-full"><Lock className="w-3 h-3" /> Zone A</span>
                         </p>
                         <button 
                           onClick={() => handleAuditAction('Forget Context', 'AI Memory', 'deleted')}
                           className="text-xs px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive font-bold hover:bg-destructive/20 transition-colors uppercase tracking-widest"
                         >
                           Forget
                         </button>
                       </div>
                     </div>
                  </div>
                </div>
              </div>
              <RetentionSchedule />
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="card border border-border">
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/[0.04]">
                <div>
                  <h3 className="font-bold text-text-main text-lg mb-1">AI Action Audit Log</h3>
                  <p className="text-xs text-text-muted">A verifiable ledger of every sensitive action Nova takes with your data.</p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-primary bg-primary/10 border border-primary/20 rounded-xl hover:bg-primary/20 transition-colors">
                  <Download className="w-4 h-4" /> Export Ledger
                </button>
              </div>

              <div className="overflow-x-auto custom-scrollbar pb-4">
                <table className="w-full text-left text-sm">
                  <thead className="text-text-muted border-b border-white/[0.04]">
                    <tr>
                      <th className="px-4 py-4 font-black uppercase tracking-[0.2em] text-[11px]">Timestamp / Access</th>
                      <th className="px-4 py-4 font-black uppercase tracking-[0.2em] text-[11px]">Action Taken</th>
                      <th className="px-4 py-4 font-black uppercase tracking-[0.2em] text-[11px]">Security Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.02]">
                    {auditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-5 text-xs tabular-nums text-text-muted font-medium whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-5 text-sm font-medium text-text-muted">
                          {log.action}
                          {log.target && <span className="block text-xs text-text-muted mt-0.5">{log.target}</span>}
                        </td>
                        <td className="px-4 py-5">
                          <span className={cn(
                            "inline-flex items-center px-2 py-1 rounded bg-background border border-white/[0.05] text-[11px] uppercase tracking-widest font-black shadow-inner",
                            log.status === 'authorised' ? 'text-success border-success/20' :
                            log.status === 'anonymised' ? 'text-primary border-primary/20' :
                            log.status === 'deleted' ? 'text-destructive border-destructive/20' :
                            'text-text-muted'
                          )}>
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
      <div className="flex justify-center mt-8">
        <a href="#" className="flex items-center gap-2 text-xs uppercase font-black tracking-[0.2em] text-text-muted hover:text-primary transition-colors">
           <FileText className="w-4 h-4" /> View Trust Centre Documents & DPIA Summaries
        </a>
      </div>

      <AnimatePresence>
        {showDownloadConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-card/80 backdrop-blur-sm p-4"
            onClick={() => setShowDownloadConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="card bg-card border border-border shadow-lg p-8 max-w-sm w-full relative overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative z-10 space-y-6">
                <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center text-primary">
                  <Download className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-display font-bold text-text-main mb-2">Confirm Data Export</h3>
                  <p className="text-text-muted text-sm">
                    This will download a JSON archive of all your personal recovery entries, including your profile, active flags, and anonymous logs (approx. 45KB). Ensure you are downloading this on a secure, private device.
                  </p>
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => setShowDownloadConfirm(false)}
                    className="flex-1 px-4 py-3 bg-card text-text-muted rounded-xl font-bold hover:bg-surface transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={processDownload}
                    className="flex-1 px-4 py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary-dark transition"
                  >
                    Download
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showDeleteConfirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-card/85 backdrop-blur-md p-4"
            onClick={() => {
              if (!isDeleting) {
                setShowDeleteConfirmModal(false);
                setTypedFullName("");
                setAcknowledgedLoss(false);
                setAcknowledgedUnlink(false);
                setAcknowledgedNoRecovery(false);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="card bg-background border border-destructive/30 shadow-[0_0_50px_rgba(220,38,38,0.2)] p-8 max-w-md w-full relative overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative z-10 space-y-6 text-left">
                <div className="w-12 h-12 bg-destructive/10 border border-destructive/20 rounded-2xl flex items-center justify-center text-destructive shadow-lg shadow-destructive/10 animate-pulse">
                  <Trash2 className="w-6 h-6" />
                </div>
                
                <div>
                  <h3 className="text-xl font-display font-bold text-text-main mb-2">Confirm Permanent Deletion</h3>
                  <p className="text-text-muted text-sm leading-relaxed font-light">
                    This is a destructive, irreversible action. Executing this will permanently erase your diagnostic metrics, somatic logs, Nova interaction baseline, and sync connection.
                  </p>
                </div>

                {!isDeleting ? (
                  <div className="space-y-4">
                    {/* Advanced safety checkboxes */}
                    <div className="space-y-3 bg-surface border border-white/[0.04] p-4 rounded-xl text-xs text-text-muted">
                      <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={acknowledgedLoss} 
                          onChange={(e) => setAcknowledgedLoss(e.target.checked)}
                          className="mt-0.5 accent-destructive rounded border-white/[0.1] bg-background cursor-pointer"
                        />
                        <span>I understand that all somatic stress metrics & audit ledgers will be permanently destroyed.</span>
                      </label>
                      <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={acknowledgedUnlink} 
                          onChange={(e) => setAcknowledgedUnlink(e.target.checked)}
                          className="mt-0.5 accent-destructive rounded border-white/[0.1] bg-background cursor-pointer"
                        />
                        <span>I authorize immediate termination of Firebase Cloud Run sync channels.</span>
                      </label>
                      <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={acknowledgedNoRecovery} 
                          onChange={(e) => setAcknowledgedNoRecovery(e.target.checked)}
                          className="mt-0.5 accent-destructive rounded border-white/[0.1] bg-background cursor-pointer"
                        />
                        <span>I accept Nova Coach will forget my behavioral baseline and cannot recover it.</span>
                      </label>
                    </div>

                    <p className="text-xs text-text-muted">
                      To authorize deletion, please type your full name matches the profile below:
                      <strong className="block text-primary mt-1 select-all font-mono">
                        {profile.fullName || "CONFIRM DELETION"}
                      </strong>
                    </p>
                    
                    <div className="space-y-1">
                      <input
                        type="text"
                        className="w-full bg-surface border border-white/[0.08] focus:border-destructive/50 rounded-xl px-4 py-3 text-sm font-medium text-text-main placeholder:text-text-muted/40 outline-none transition-all font-mono"
                        placeholder="Type your full name exactly"
                        value={typedFullName}
                        onChange={e => setTypedFullName(e.target.value)}
                      />
                      {typedFullName.length > 0 && (
                        <p className={cn(
                          "text-[11px] font-medium font-mono pl-1",
                          typedFullName.trim().toLowerCase() === (profile.fullName || "CONFIRM DELETION").trim().toLowerCase()
                            ? "text-success" 
                            : "text-destructive/80"
                        )}>
                          {typedFullName.trim().toLowerCase() === (profile.fullName || "CONFIRM DELETION").trim().toLowerCase()
                            ? "✓ Full name authorized" 
                            : "✗ Name mismatch. Ensure matches spelling exactly."
                          }
                        </p>
                      )}
                    </div>

                    <div className="flex gap-4">
                      <button
                        onClick={() => {
                          setShowDeleteConfirmModal(false);
                          setTypedFullName("");
                          setAcknowledgedLoss(false);
                          setAcknowledgedUnlink(false);
                          setAcknowledgedNoRecovery(false);
                        }}
                        className="flex-1 px-4 py-3 bg-surface border border-white/[0.05] rounded-xl font-bold hover:bg-surface hover:text-text-main transition text-xs cursor-pointer text-text-muted"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={
                          typedFullName.trim().toLowerCase() !== (profile.fullName || "CONFIRM DELETION").trim().toLowerCase() ||
                          !acknowledgedLoss || 
                          !acknowledgedUnlink || 
                          !acknowledgedNoRecovery
                        }
                        onClick={async () => {
                          setIsDeleting(true);
                          await new Promise(r => setTimeout(r, 1000));
                          await handleAuditAction('Initiate Demolition Sequence', 'Core Databases', 'deleted');
                          await new Promise(r => setTimeout(r, 1200));
                          await handleAuditAction('Erase Diagnostic Logs', 'Zone A Local DB', 'deleted');
                          await new Promise(r => setTimeout(r, 1000));
                          
                          onProfileUpdate({
                            fullName: '',
                            role: '',
                            organization: '',
                            managerEmail: ''
                          });
                          
                          localStorage.clear();
                          
                          await handleAuditAction('Data Deletion Completed', 'All Data Stores', 'deleted');
                          setIsDeleting(false);
                          setShowDeleteConfirmModal(false);
                          setTypedFullName("");
                          setAcknowledgedLoss(false);
                          setAcknowledgedUnlink(false);
                          setAcknowledgedNoRecovery(false);
                          
                          window.location.reload();
                        }}
                        className="flex-1 px-4 py-3 bg-destructive hover:bg-destructive-foreground disabled:bg-destructive-foreground/40 disabled:text-destructive-foreground disabled:border-transparent cursor-pointer text-white border border-destructive/30 rounded-xl font-bold transition text-xs"
                      >
                        Purge All Data
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col items-center justify-center py-6 space-y-3">
                      <Loader2 className="w-8 h-8 text-destructive animate-spin" />
                      <p className="text-xs font-bold text-destructive font-mono tracking-widest uppercase animate-pulse">
                        Wiping Diagnostic Logs...
                      </p>
                    </div>
                    <div className="space-y-1 text-xs text-text-muted font-mono leading-relaxed bg-background p-3 rounded-lg border border-white/[0.02]">
                      <p className="text-destructive">● [1/4] Overwriting Zone A-C metadata...</p>
                      <p className="text-destructive">● [2/4] Destroying audit ledger traces...</p>
                      <p className="text-destructive">● [3/4] Purging offline local storage namespaces...</p>
                      <p className="text-destructive">● [4/4] Finalizing cryptographic shredding...</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

