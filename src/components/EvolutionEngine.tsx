import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Database, Plus, Search, Brain, Network, ZapOff, CheckCircle2, AlertTriangle, Layers, RefreshCw, Loader2, ShieldCheck } from 'lucide-react';
import { useFeatureFlags, setFeatureFlag, FeatureFlag } from '../lib/feature-flags';
import { getNovaBrain, NovaMemory, deleteNovaMemory } from '../lib/nova-brain';
import { cn } from '../lib/utils';
import { secureApiFetch } from '../lib/secure-api';
import { useAuth } from '../lib/auth';

// Server-backed Protected Core invariant (platform_protected_core via
// GET /api/admin/evolution/protected-core) - see protected-core.ts.
// Supersedes the old "Core Protected List" (six bare strings in JSX,
// removed in Evolution Engine PR1) with real, evidence-cited governance.
interface ProtectedCoreInvariant {
  invariantId: string;
  title: string;
  rule: string;
  scope: string;
  owner: string | null;
  requiredApproval: string;
  testStatus: string;
  evidence: string;
  allowedChangeProcess: string;
  notes: string | null;
}

const TEST_STATUS_BADGE_STYLES: Record<string, string> = {
  machine_tested: 'bg-success/10 text-success dark:text-[#4ade80]',
  manual_only: 'bg-warning/10 text-[#9a3412] dark:text-warning',
  untested: 'bg-destructive/10 text-destructive dark:text-[#f87171]',
};

// Server-backed unified connector view (platform + organisation) via
// GET /api/admin/evolution/connectors - see connector-layer.ts.
// Supersedes the old "Safe Connector Layer" tab's three hardcoded example
// cards with invented sample output.
interface UnifiedConnectorView {
  connectorId: string;
  scope: 'platform' | 'organisation';
  orgId: string | null;
  provider: string;
  status: string;
  authenticationState: string;
  capabilities: string[];
  dataZones: string[];
  mutationAllowed: boolean;
  fallback: string;
  lastSuccessfulSync: string | null;
  owner: string | null;
}

const CONNECTOR_STATUS_BADGE_STYLES: Record<string, string> = {
  configured: 'bg-success/10 text-success dark:text-[#4ade80]',
  not_configured: 'bg-destructive/10 text-destructive dark:text-[#f87171]',
  active: 'bg-success/10 text-success dark:text-[#4ade80]',
  disabled: 'bg-surface/50 text-text-muted',
  revoked: 'bg-destructive/10 text-destructive dark:text-[#f87171]',
};

// Platform-wide, metadata-only aggregate via
// GET /api/admin/evolution/context-brain/health - see
// nova-memory-governance.ts. Never includes any memory's `content`.
interface ContextBrainHealthSummary {
  totalMemories: number;
  usersScanned: number;
  byType: Record<string, number>;
  byConfidence: Record<string, number>;
  duplicateCandidateGroups: number;
  duplicateCandidateMemories: number;
  memoriesWithoutCanonicalKey: number;
  capped: boolean;
}

// Server-backed registry entry shape (platform_feature_registry via
// GET /api/admin/evolution/registry) - see feature-registry-v2.ts for
// the authoritative schema. This is the canonical source now; the old
// client-only FEATURE_REGISTRY static object (src/lib/feature-registry.ts)
// is migrated into this collection by the one-time seed route rather than
// imported directly here, so there is exactly one place this screen reads
// governance data from.
interface RegistryEntry {
  featureId: string;
  displayName: string;
  description: string;
  lifecycleState: string;
  enforcementState: string;
  featureFlag: string | null;
  dataZones: string[];
  dependencies: string[];
  productOwner: string | null;
  technicalOwner: string | null;
  notes: string | null;
}

const LIFECYCLE_BADGE_STYLES: Record<string, string> = {
  draft: 'bg-surface/50 text-text-muted',
  shadow: 'bg-surface/50 text-text-muted',
  internal_beta: 'bg-primary/10 text-[#9a3412] dark:text-primary',
  private_beta: 'bg-primary/10 text-[#9a3412] dark:text-primary',
  public_beta: 'bg-primary/10 text-[#9a3412] dark:text-primary',
  live: 'bg-success/10 text-success dark:text-[#4ade80]',
  frozen: 'bg-warning/10 text-[#9a3412] dark:text-warning',
  deprecated: 'bg-destructive/10 text-destructive dark:text-[#f87171]',
  removed: 'bg-destructive/10 text-destructive dark:text-[#f87171]',
};

const ENFORCEMENT_BADGE_STYLES: Record<string, string> = {
  fully_enforced: 'bg-success/10 text-success dark:text-[#4ade80]',
  partially_enforced: 'bg-warning/10 text-[#9a3412] dark:text-warning',
  frontend_only: 'bg-warning/10 text-[#9a3412] dark:text-warning',
  backend_only: 'bg-warning/10 text-[#9a3412] dark:text-warning',
  not_wired: 'bg-destructive/10 text-destructive dark:text-[#f87171]',
  unknown: 'bg-surface/50 text-text-muted',
};

export const EvolutionEngine = () => {
  const { appRole } = useAuth();
  const isPlatformOwner = appRole === 'platform_owner';
  const flags = useFeatureFlags();
  const [activeTab, setActiveTab] = useState<'registry' | 'protected-core' | 'brain' | 'scanner' | 'connectors'>('registry');
  const [brainMemories, setBrainMemories] = useState<NovaMemory[]>([]);
  const [registry, setRegistry] = useState<RegistryEntry[] | null>(null);
  const [isLoadingRegistry, setIsLoadingRegistry] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [protectedCore, setProtectedCore] = useState<ProtectedCoreInvariant[] | null>(null);
  const [isLoadingProtectedCore, setIsLoadingProtectedCore] = useState(false);
  const [isSeedingProtectedCore, setIsSeedingProtectedCore] = useState(false);
  const [protectedCoreError, setProtectedCoreError] = useState<string | null>(null);

  const fetchProtectedCore = async () => {
    setIsLoadingProtectedCore(true);
    setProtectedCoreError(null);
    try {
      const res = await secureApiFetch('/api/admin/evolution/protected-core');
      if (res.ok) {
        const data = await res.json();
        setProtectedCore(data.invariants || []);
      } else {
        const err = await res.json();
        setProtectedCoreError(err.error || "Couldn't load Protected Core.");
      }
    } catch (e) {
      setProtectedCoreError("Couldn't load Protected Core.");
    } finally {
      setIsLoadingProtectedCore(false);
    }
  };

  const handleSeedProtectedCore = async () => {
    setIsSeedingProtectedCore(true);
    try {
      const res = await secureApiFetch('/api/admin/evolution/protected-core/seed', { method: 'POST' });
      if (res.ok) {
        await fetchProtectedCore();
      } else {
        const err = await res.json();
        setProtectedCoreError(err.error || "Couldn't seed Protected Core.");
      }
    } catch (e) {
      setProtectedCoreError("Couldn't seed Protected Core.");
    } finally {
      setIsSeedingProtectedCore(false);
    }
  };

  useEffect(() => {
    fetchProtectedCore();
  }, []);

  const [connectors, setConnectors] = useState<UnifiedConnectorView[] | null>(null);
  const [isLoadingConnectors, setIsLoadingConnectors] = useState(false);
  const [connectorsError, setConnectorsError] = useState<string | null>(null);

  const fetchConnectors = async () => {
    setIsLoadingConnectors(true);
    setConnectorsError(null);
    try {
      const res = await secureApiFetch('/api/admin/evolution/connectors');
      if (res.ok) {
        const data = await res.json();
        setConnectors(data.connectors || []);
      } else {
        const err = await res.json();
        setConnectorsError(err.error || "Couldn't load the Connector Layer.");
      }
    } catch (e) {
      setConnectorsError("Couldn't load the Connector Layer.");
    } finally {
      setIsLoadingConnectors(false);
    }
  };

  useEffect(() => {
    fetchConnectors();
  }, []);

  const [contextBrainHealth, setContextBrainHealth] = useState<ContextBrainHealthSummary | null>(null);
  const [isLoadingContextBrainHealth, setIsLoadingContextBrainHealth] = useState(false);
  const [contextBrainHealthError, setContextBrainHealthError] = useState<string | null>(null);

  const fetchContextBrainHealth = async () => {
    setIsLoadingContextBrainHealth(true);
    setContextBrainHealthError(null);
    try {
      const res = await secureApiFetch('/api/admin/evolution/context-brain/health');
      if (res.ok) {
        setContextBrainHealth(await res.json());
      } else {
        const err = await res.json();
        setContextBrainHealthError(err.error || "Couldn't load Context Brain Health.");
      }
    } catch (e) {
      setContextBrainHealthError("Couldn't load Context Brain Health.");
    } finally {
      setIsLoadingContextBrainHealth(false);
    }
  };

  useEffect(() => {
    fetchContextBrainHealth();
  }, []);

  const fetchRegistry = async () => {
    setIsLoadingRegistry(true);
    setRegistryError(null);
    try {
      const res = await secureApiFetch('/api/admin/evolution/registry');
      if (res.ok) {
        const data = await res.json();
        setRegistry(data.entries || []);
      } else {
        const err = await res.json();
        setRegistryError(err.error || "Couldn't load the feature registry.");
      }
    } catch (e) {
      setRegistryError("Couldn't load the feature registry.");
    } finally {
      setIsLoadingRegistry(false);
    }
  };

  const handleSeedRegistry = async () => {
    setIsSeeding(true);
    try {
      const res = await secureApiFetch('/api/admin/evolution/registry/seed', { method: 'POST' });
      if (res.ok) {
        await fetchRegistry();
      } else {
        const err = await res.json();
        setRegistryError(err.error || "Couldn't seed the registry.");
      }
    } catch (e) {
      setRegistryError("Couldn't seed the registry.");
    } finally {
      setIsSeeding(false);
    }
  };

  useEffect(() => {
    fetchRegistry();
  }, []);

  useEffect(() => {
    setBrainMemories(getNovaBrain());
    const handleBrainUpdate = () => setBrainMemories(getNovaBrain());
    window.addEventListener('nova-brain-updated', handleBrainUpdate);
    return () => window.removeEventListener('nova-brain-updated', handleBrainUpdate);
  }, []);

  const handleToggleFlag = (flag: FeatureFlag, currentVal: boolean) => {
    setFeatureFlag(flag, !currentVal);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-24">
      {/* Header */}
      <div className="flex items-center gap-6 mb-10">
        <div className="w-16 h-16 bg-card rounded-2xl flex items-center justify-center shadow-xl border border-border/40">
          <Layers className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-4xl font-display font-black text-text-main flex items-center gap-3">
            Blaze Break Evolution Engine
          </h1>
          <p className="text-text-muted font-medium tracking-wide">
            Safe Architecture Governance • Feature Registry • Context Memory
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border/40 pb-px" role="tablist">
        {[
          { id: 'registry', label: 'Feature Registry & Flags', icon: Database },
          { id: 'protected-core', label: 'Protected Core', icon: ShieldCheck },
          { id: 'scanner', label: 'Change Impact Scanner', icon: Search },
          { id: 'brain', label: 'Nova Context Brain', icon: Brain },
          { id: 'connectors', label: 'Connector Layer', icon: Network },
        ].map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "px-5 py-3 text-sm font-bold flex items-center gap-2 transition-all relative",
              activeTab === tab.id 
                ? "text-text-main" 
                : "text-text-muted hover:text-text-main hover:bg-surface/50 rounded-t-lg"
            )}
          >
            <tab.icon className={cn("w-4 h-4", activeTab === tab.id && "text-primary")} />
            {tab.label}
            {activeTab === tab.id && (
              <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* Registry Tab */}
      {activeTab === 'registry' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between border-b border-border/20 pb-4">
            <h3 className="text-xl font-bold flex items-center gap-2 text-text-main">
              <Database className="w-5 h-5 text-text-muted" /> Canonical Feature Registry
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchRegistry}
                disabled={isLoadingRegistry}
                className="text-xs font-bold px-3 py-1.5 rounded-lg border border-border/40 text-text-muted hover:text-text-main flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isLoadingRegistry && "animate-spin")} /> Refresh
              </button>
              <button
                onClick={handleSeedRegistry}
                disabled={isSeeding}
                title="Create-if-absent migration from the legacy static registry and feature-flags.ts - safe to re-run, never overwrites an existing entry."
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary/10 text-[#9a3412] dark:text-primary hover:bg-primary/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSeeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Sync from legacy sources
              </button>
            </div>
          </div>

          <p className="text-sm text-text-muted max-w-3xl">
            Server-persisted (platform_feature_registry) - this replaces the old static, client-only registry. <strong className="text-text-main">Lifecycle</strong> describes maturity; <strong className="text-text-main">Enforcement</strong> describes whether the feature's behaviour is actually, verifiably gated end-to-end. A feature can be Live while its enforcement is Unknown - that distinction is the point.
          </p>

          {registryError && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive dark:text-[#f87171]">{registryError}</div>
          )}

          {isLoadingRegistry && !registry ? (
            <p className="text-sm text-text-muted italic">Loading registry...</p>
          ) : registry && registry.length === 0 ? (
            <div className="p-8 text-center bg-surface/30 border border-border/40 rounded-2xl">
              <p className="text-sm text-text-muted mb-3">The registry is empty - no entries have been seeded yet.</p>
              <p className="text-xs text-text-muted">Click "Sync from legacy sources" above to migrate the real existing feature-registry.ts and feature-flags.ts data in.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(registry || []).map(feature => (
                <div key={feature.featureId} className="bg-card border border-border/40 rounded-2xl p-6 relative">
                   <div className="flex items-start justify-between gap-3 mb-2">
                     <h4 className="font-bold text-lg text-text-main">{feature.displayName}</h4>
                     <code className="text-[10px] text-text-muted shrink-0 mt-1">{feature.featureId}</code>
                   </div>
                   <p className="text-sm text-text-muted mb-4 min-h-[2.5rem]">{feature.description}</p>

                   <div className="flex flex-wrap gap-2 mb-4">
                     <span className={cn("text-xs uppercase font-black tracking-widest px-2 py-0.5 rounded-full", LIFECYCLE_BADGE_STYLES[feature.lifecycleState] || 'bg-surface/50 text-text-muted')}>
                       {feature.lifecycleState.replace(/_/g, ' ')}
                     </span>
                     <span
                       title="Enforcement describes whether this feature's behaviour is actually, verifiably gated - separate from lifecycle maturity."
                       className={cn("text-xs uppercase font-black tracking-widest px-2 py-0.5 rounded-full", ENFORCEMENT_BADGE_STYLES[feature.enforcementState] || 'bg-surface/50 text-text-muted')}
                     >
                       {feature.enforcementState.replace(/_/g, ' ')}
                     </span>
                   </div>

                   <div className="space-y-2 mb-4">
                      {feature.featureFlag && (
                        <div className="flex items-center justify-between text-xs font-medium text-text-muted bg-surface/30 p-2 rounded-lg">
                          <span>Feature Flag:</span>
                          <code className="text-xs bg-card px-1.5 py-0.5 rounded border border-border/40">{feature.featureFlag}</code>
                        </div>
                      )}
                      {feature.dataZones.length > 0 && (
                        <div className="flex items-center justify-between text-xs font-medium text-text-muted bg-surface/30 p-2 rounded-lg">
                          <span>Data Zone:</span>
                          <span className="text-xs uppercase font-black text-[#9a3412] dark:text-primary tracking-wider text-right">
                            {feature.dataZones.map(z => z.replace(/_/g, ' ')).join(', ')}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs font-medium text-text-muted bg-surface/30 p-2 rounded-lg">
                        <span>Owner:</span>
                        <span className={cn("text-xs font-bold", !feature.productOwner && !feature.technicalOwner && "text-warning")}>
                          {feature.productOwner || feature.technicalOwner || 'Nobody owns this'}
                        </span>
                      </div>
                   </div>

                   {feature.notes && (
                     <p className="text-[11px] text-text-muted italic leading-relaxed border-t border-border/20 pt-3">{feature.notes}</p>
                   )}

                   {/* Only enable_overload_shield is actually wired to gate
                       anything (App.tsx checks it before rendering
                       NovaOverloadShield) - a real Enable/Disable control
                       for any other flag here would be a lie, so the
                       toggle is shown only where it's real. */}
                   {feature.featureFlag === 'enable_overload_shield' && (
                     <div className="flex justify-end border-t border-border/20 pt-3 mt-3">
                       <button
                         onClick={() => handleToggleFlag(feature.featureFlag as FeatureFlag, flags[feature.featureFlag as FeatureFlag] || false)}
                         aria-pressed={flags[feature.featureFlag as FeatureFlag] || false}
                         className="text-xs font-bold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all text-text-muted hover:text-text-main border-border/40 cursor-pointer"
                       >
                         {flags[feature.featureFlag as FeatureFlag] ? (
                           <><ZapOff className="w-3.5 h-3.5 text-primary" /> Disable Flag</>
                         ) : (
                           <><Plus className="w-3.5 h-3.5" /> Enable Flag</>
                         )}
                       </button>
                     </div>
                   )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Protected Core Tab */}
      {activeTab === 'protected-core' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between border-b border-border/20 pb-4">
            <h3 className="text-xl font-bold flex items-center gap-2 text-text-main">
              <ShieldCheck className="w-5 h-5 text-text-muted" /> Protected Core
            </h3>
            {isPlatformOwner && (
              <button
                onClick={handleSeedProtectedCore}
                disabled={isSeedingProtectedCore}
                title="Create-if-absent migration of the real, evidence-backed invariant set - safe to re-run, never overwrites an existing entry."
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary/10 text-[#9a3412] dark:text-primary hover:bg-primary/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSeedingProtectedCore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Seed real invariants
              </button>
            )}
          </div>

          <p className="text-sm text-text-muted max-w-3xl">
            Boundaries that must survive any feature rewrite touching them. Each invariant cites real evidence - where it's genuinely enforced today - rather than being a goal. Changing one requires the approval tier shown; most require a Platform Owner.
          </p>

          {protectedCoreError && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive dark:text-[#f87171]">{protectedCoreError}</div>
          )}

          {isLoadingProtectedCore && !protectedCore ? (
            <p className="text-sm text-text-muted italic">Loading...</p>
          ) : protectedCore && protectedCore.length === 0 ? (
            <div className="p-8 text-center bg-surface/30 border border-border/40 rounded-2xl">
              <p className="text-sm text-text-muted mb-1">No invariants have been seeded yet.</p>
              {isPlatformOwner ? (
                <p className="text-xs text-text-muted">Click "Seed real invariants" above to load the evidence-backed starting set.</p>
              ) : (
                <p className="text-xs text-text-muted">Ask a Platform Owner to seed the real invariant set.</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {(protectedCore || []).map(inv => (
                <div key={inv.invariantId} className="bg-card border border-border/40 rounded-2xl p-6">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h4 className="font-bold text-lg text-text-main">{inv.title}</h4>
                    <code className="text-[10px] text-text-muted shrink-0 mt-1">{inv.invariantId}</code>
                  </div>
                  <p className="text-sm text-text-main leading-relaxed mb-3">{inv.rule}</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className={cn("text-xs uppercase font-black tracking-widest px-2 py-0.5 rounded-full", TEST_STATUS_BADGE_STYLES[inv.testStatus] || 'bg-surface/50 text-text-muted')}>
                      {inv.testStatus.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs uppercase font-black tracking-widest px-2 py-0.5 rounded-full bg-surface/50 text-text-muted">
                      Approval: {inv.requiredApproval.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-background text-text-muted border border-border/40">{inv.scope}</span>
                  </div>
                  <div className="p-3 bg-surface/30 rounded-lg mb-2">
                    <span className="text-[10px] uppercase font-black tracking-widest text-text-muted block mb-1">Evidence</span>
                    <p className="text-xs text-text-muted font-mono leading-relaxed">{inv.evidence}</p>
                  </div>
                  <p className="text-[11px] text-text-muted italic leading-relaxed">{inv.allowedChangeProcess}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Brain Tab */}
      {activeTab === 'brain' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <h3 className="text-xl font-bold flex items-center gap-2 text-text-main border-b border-border/20 pb-4">
            <Brain className="w-5 h-5 text-text-muted" /> Context Brain Health
          </h3>
          <p className="text-sm text-text-muted max-w-3xl">
            Platform-wide, every user's memory store - metadata only (type, confidence, duplicate-candidate counts). Never shows what any memory actually says; that stays private to each user's own Nova conversation.
          </p>

          {contextBrainHealthError && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive dark:text-[#f87171]">{contextBrainHealthError}</div>
          )}

          {isLoadingContextBrainHealth && !contextBrainHealth ? (
            <p className="text-sm text-text-muted italic">Loading...</p>
          ) : contextBrainHealth && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-card border border-border/40 rounded-xl p-4">
                  <span className="text-[10px] uppercase font-black tracking-widest text-text-muted block mb-1">Total Memories</span>
                  <span className="text-2xl font-display font-black text-text-main">{contextBrainHealth.totalMemories}</span>
                  {contextBrainHealth.capped && <span className="text-[10px] text-warning block mt-1">Capped scan - real total may be higher</span>}
                </div>
                <div className="bg-card border border-border/40 rounded-xl p-4">
                  <span className="text-[10px] uppercase font-black tracking-widest text-text-muted block mb-1">Users With Memories</span>
                  <span className="text-2xl font-display font-black text-text-main">{contextBrainHealth.usersScanned}</span>
                </div>
                <div className="bg-card border border-border/40 rounded-xl p-4">
                  <span className="text-[10px] uppercase font-black tracking-widest text-text-muted block mb-1">Duplicate Candidates</span>
                  <span className={cn("text-2xl font-display font-black", contextBrainHealth.duplicateCandidateGroups > 0 ? "text-destructive dark:text-[#f87171]" : "text-text-main")}>
                    {contextBrainHealth.duplicateCandidateGroups}
                  </span>
                  <span className="text-[10px] text-text-muted block mt-1">groups ({contextBrainHealth.duplicateCandidateMemories} memories)</span>
                </div>
                <div className="bg-card border border-border/40 rounded-xl p-4">
                  <span className="text-[10px] uppercase font-black tracking-widest text-text-muted block mb-1">No Canonical Key</span>
                  <span className="text-2xl font-display font-black text-text-main">{contextBrainHealth.memoriesWithoutCanonicalKey}</span>
                  <span className="text-[10px] text-text-muted block mt-1">freeform writes - not structurally dedupable</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-card border border-border/40 rounded-xl p-4">
                  <span className="text-[10px] uppercase font-black tracking-widest text-text-muted block mb-2">By Type</span>
                  <div className="space-y-1">
                    {Object.entries(contextBrainHealth.byType).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between text-xs">
                        <span className="text-text-main">{type}</span>
                        <span className="text-text-muted font-mono">{count}</span>
                      </div>
                    ))}
                    {Object.keys(contextBrainHealth.byType).length === 0 && <p className="text-xs text-text-muted italic">No memories recorded anywhere yet.</p>}
                  </div>
                </div>
                <div className="bg-card border border-border/40 rounded-xl p-4">
                  <span className="text-[10px] uppercase font-black tracking-widest text-text-muted block mb-2">By Confidence</span>
                  <div className="space-y-1">
                    {Object.entries(contextBrainHealth.byConfidence).map(([confidence, count]) => (
                      <div key={confidence} className="flex items-center justify-between text-xs">
                        <span className="text-text-main">{confidence}</span>
                        <span className="text-text-muted font-mono">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="p-6 bg-primary/5 border border-primary/20 rounded-2xl mt-8 flex gap-4">
             <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center shrink-0">
               <Brain className="w-6 h-6 text-text-main" />
             </div>
             <div>
               <h3 className="font-bold text-lg text-text-main">My Own Nova Memories</h3>
               <p className="text-sm text-text-muted mt-1">This admin account's own personal Nova memory, not any other user's - the only memory content any Evolution Engine screen ever shows in full.</p>
             </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {brainMemories.map(mem => (
              <div key={mem.id} className="bg-card border border-border/40 rounded-xl p-5 flex flex-col justify-between hover:border-primary/30 transition-colors">
                 <div className="flex items-start justify-between mb-3">
                   <div className="flex items-center gap-2">
                     <span className="text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-surface/50 text-text-muted">
                       {mem.type}
                     </span>
                     <span className={cn(
                       "text-xs font-black uppercase tracking-widest text-text-muted flex items-center gap-1",
                       mem.confidence === 'verified' && "text-success dark:text-[#4ade80]",
                       mem.confidence === 'high' && "text-[#9a3412] dark:text-primary"
                     )}>
                       {mem.confidence === 'verified' ? <CheckCircle2 className="w-3 h-3" /> : null}
                       {mem.confidence} Match
                     </span>
                   </div>
                   {mem.canEdit && (
                     <button onClick={() => deleteNovaMemory(mem.id)} className="text-xs text-destructive dark:text-[#f87171] hover:opacity-80 font-medium cursor-pointer">Forget</button>
                   )}
                 </div>
                 <p className="text-sm font-medium text-text-main leading-relaxed font-mono">
                   "{mem.content}"
                 </p>
                 <div className="mt-4 pt-3 border-t border-border/40 text-xs text-text-muted uppercase tracking-wider font-bold">
                   Source: {mem.source}
                 </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scanner Tab */}
      {activeTab === 'scanner' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          
          <div className="bg-card text-text-main p-8 rounded-xl relative overflow-hidden border border-border/40">
             <Search className="w-48 h-48 absolute right-[-5%] top-[-10%] text-text-muted opacity-10" />
             <div className="relative z-10 max-w-2xl">
               <h3 className="text-2xl font-display font-bold mb-2">Change Impact Scanner</h3>
               <p className="text-text-muted text-sm mb-6">Before applying any AI update, the engine generates an impact report to ensure core foundations are not overwritten.</p>
               
               <div className="bg-surface/50 border border-border/20 p-6 rounded-2xl space-y-4">
                 <div className="flex items-center justify-between text-xs text-text-muted font-mono border-b border-border/20 pb-2">
                   <span>TARGET FEATURE</span>
                   <span className="text-text-main font-bold">Nova Overload Shield</span>
                 </div>
                 <div className="space-y-2">
                   <div className="text-xs text-[#9a3412] dark:text-primary uppercase font-black tracking-widest">AFFECTED ROOMS</div>
                   <div className="flex gap-2 font-mono text-xs">
                     <span className="px-2 py-1 bg-surface rounded text-text-main border border-border/10">Home</span>
                     <span className="px-2 py-1 bg-surface rounded text-text-main border border-border/10">Energy Budget</span>
                     <span className="px-2 py-1 bg-surface rounded text-text-main border border-border/10">Nova</span>
                   </div>
                 </div>
                 <div className="space-y-2">
                   <div className="text-xs text-[#166534] dark:text-[#4ade80] uppercase font-black tracking-widest">PROTECTED CORE (DO NOT TOUCH)</div>
                   <div className="flex gap-2 font-mono text-xs">
                     <span className="px-2 py-1 bg-card border border-border/40 rounded text-text-muted line-through">Guardian Protocol</span>
                     <span className="px-2 py-1 bg-card border border-border/40 rounded text-text-muted line-through">SHIP Logic</span>
                   </div>
                 </div>
                 <div className="pt-4 mt-4 border-t border-border/20 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-warning" />
                      <span className="text-xs font-bold text-[#9a3412] dark:text-warning">Risk: MEDIUM</span>
                    </div>
                    <span className="text-xs font-mono bg-primary/20 text-[#9a3412] dark:text-primary px-2 py-1 rounded">Flag: enable_overload_shield</span>
                 </div>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* Connectors Tab */}
      {activeTab === 'connectors' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between border-b border-border/20 pb-4">
            <h3 className="text-xl font-bold flex items-center gap-2 text-text-main">
              <Network className="w-5 h-5 text-text-muted" /> Connector Layer
            </h3>
            <button
              onClick={fetchConnectors}
              disabled={isLoadingConnectors}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-border/40 text-text-muted hover:text-text-main flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoadingConnectors && "animate-spin")} /> Refresh
            </button>
          </div>

          <p className="text-sm text-text-muted max-w-3xl">
            A real, unified view over two genuine connector systems - the platform's own third-party dependencies (Twilio, Brevo, Gemini, Vertex, Claude, Web Push), and every organisation's registered connectors. "Configured" means credentials are present, not that a live connection was just verified - no connectivity probe exists for any of these.
          </p>

          {connectorsError && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive dark:text-[#f87171]">{connectorsError}</div>
          )}

          {isLoadingConnectors && !connectors ? (
            <p className="text-sm text-text-muted italic">Loading...</p>
          ) : (
            <>
              <h4 className="text-sm font-black uppercase tracking-widest text-text-muted">Platform Dependencies</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(connectors || []).filter(c => c.scope === 'platform').map(c => (
                  <div key={c.connectorId} className="bg-card border border-border/40 rounded-xl p-5">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span className="font-bold text-text-main">{c.provider}</span>
                      <span className={cn("text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded-full shrink-0", CONNECTOR_STATUS_BADGE_STYLES[c.status] || 'bg-surface/50 text-text-muted')}>
                        {c.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted mb-2">{c.capabilities.join(', ')}</p>
                    <div className="flex items-center gap-2 mb-3">
                      {c.mutationAllowed && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning/10 text-[#9a3412] dark:text-warning">Can mutate external state</span>
                      )}
                      {c.dataZones.map(z => (
                        <span key={z} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface/50 text-text-muted">{z.replace(/_/g, ' ')}</span>
                      ))}
                    </div>
                    <p className="text-[11px] text-text-muted italic leading-relaxed border-t border-border/20 pt-2">{c.fallback}</p>
                  </div>
                ))}
              </div>

              <h4 className="text-sm font-black uppercase tracking-widest text-text-muted pt-2">Organisation Connectors (all orgs)</h4>
              {(connectors || []).filter(c => c.scope === 'organisation').length === 0 ? (
                <div className="p-6 bg-surface/30 border border-border/40 rounded-xl text-sm text-text-muted">
                  No organisation has registered a connector yet. The backend for this (org-connectors.ts, /api/org/:orgId/connectors) is real and tested, but no dedicated org-admin management screen exists in the app yet - this is a platform-wide read-only view over whatever gets registered once one does.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(connectors || []).filter(c => c.scope === 'organisation').map(c => (
                    <div key={c.connectorId} className="bg-card border border-border/40 rounded-xl p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <span className="font-bold text-text-main">{c.provider}</span>
                        <span className={cn("text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded-full shrink-0", CONNECTOR_STATUS_BADGE_STYLES[c.status] || 'bg-surface/50 text-text-muted')}>
                          {c.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-[10px] text-text-muted font-mono mb-2">org: {c.orgId}</p>
                      <p className="text-xs text-text-muted mb-2">{c.capabilities.join(', ')}</p>
                      <p className="text-[11px] text-text-muted italic leading-relaxed border-t border-border/20 pt-2">{c.fallback}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
