import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Shield, Database, Plus, Search, Cpu, Brain, Network, Lock, ZapOff, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';
import { FEATURE_REGISTRY, FeatureDefinition } from '../lib/feature-registry';
import { useFeatureFlags, setFeatureFlag, FeatureFlag } from '../lib/feature-flags';
import { getNovaBrain, NovaMemory, deleteNovaMemory } from '../lib/nova-brain';
import { cn } from '../lib/utils';

export const EvolutionEngine = () => {
  const flags = useFeatureFlags();
  const [activeTab, setActiveTab] = useState<'registry' | 'brain' | 'scanner' | 'connectors'>('registry');
  const [brainMemories, setBrainMemories] = useState<NovaMemory[]>([]);

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
      <div className="flex items-center gap-2 border-b border-border/40 pb-px">
        {[
          { id: 'registry', label: 'Feature Registry & Flags', icon: Database },
          { id: 'scanner', label: 'Change Impact Scanner', icon: Search },
          { id: 'brain', label: 'Nova Context Brain', icon: Brain },
          { id: 'connectors', label: 'Connector Layer', icon: Network },
        ].map(tab => (
          <button
            key={tab.id}
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
              <Lock className="w-5 h-5 text-text-muted" /> Core Protected List
            </h3>
            <span className="text-xs uppercase tracking-widest font-black text-text-muted">Foundation</span>
          </div>
          <div className="flex flex-wrap gap-2 mb-10">
            {['app_navigation', 'user_profile', 'nova_identity_rules', 'ship_framework', 'safety_rules', 'blame_method'].map(core => (
              <div key={core} className="px-3 py-1.5 bg-surface/50 rounded-lg text-xs font-mono font-bold text-text-muted border border-border/40 flex items-center gap-1.5 ">
                <Shield className="w-3 h-3 text-text-muted" /> {core}
              </div>
            ))}
          </div>

          <h3 className="text-xl font-bold flex items-center gap-2 mb-4 text-text-main">
            <Database className="w-5 h-5 text-text-muted" /> Registered Features
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.values(FEATURE_REGISTRY).map(feature => (
              <div key={feature.id} className="bg-card border border-border/40 rounded-2xl p-6 relative">
                 <div className="flex items-start justify-between mb-2">
                   <h4 className="font-bold text-lg text-text-main">{feature.name}</h4>
                   <span className={cn(
                     "text-xs uppercase font-black tracking-widest px-2 py-0.5 rounded-full",
                     feature.status === 'active' ? "bg-success/10 text-success" :
                     feature.status === 'planned' ? "bg-primary/10 text-primary" :
                     "bg-surface/50 text-text-muted"
                   )}>{feature.status}</span>
                 </div>
                 <p className="text-sm text-text-muted mb-4 h-10">{feature.purpose}</p>
                 
                 <div className="space-y-2 mb-6">
                    <div className="flex items-center justify-between text-xs font-medium text-text-muted bg-surface/30 p-2 rounded-lg">
                      <span>Feature Flag:</span>
                      <code className="text-xs bg-card px-1.5 py-0.5 rounded border border-border/40">{feature.featureFlagName}</code>
                    </div>
                    {feature.data_zone && (
                      <div className="flex items-center justify-between text-xs font-medium text-text-muted bg-surface/30 p-2 rounded-lg">
                        <span>Data Zone:</span>
                        <span className="text-xs uppercase font-black text-primary tracking-wider">
                          {feature.data_zone.replace(/_/g, ' ')}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs font-medium text-text-muted bg-surface/30 p-2 rounded-lg">
                      <span>Risk Level:</span>
                      <span className={cn(
                        "uppercase font-black tracking-wider text-xs",
                        feature.riskLevel === 'high' ? 'text-destructive' :
                        feature.riskLevel === 'medium' ? 'text-warning' : 'text-success'
                      )}>{feature.riskLevel}</span>
                    </div>
                 </div>

                 <div className="flex items-end justify-between border-t border-border/20 pt-4 mt-auto">
                    <div className="flex gap-2">
                      {feature.usesAI && <Cpu className="w-4 h-4 text-primary" />}
                      {feature.usesSensitiveData && <Lock className="w-4 h-4 text-warning" />}
                    </div>
                    
                    {feature.status === 'active' && (
                      <button 
                        onClick={() => handleToggleFlag(feature.featureFlagName as FeatureFlag, flags[feature.featureFlagName as FeatureFlag] || false)}
                        className={cn(
                          "text-xs font-bold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all text-text-muted hover:text-text-main border-border/40 cursor-pointer"
                        )}
                      >
                        {flags[feature.featureFlagName as FeatureFlag] ? (
                          <><ZapOff className="w-3.5 h-3.5 text-primary" /> Disable Flag</>
                        ) : (
                          <><Plus className="w-3.5 h-3.5" /> Enable Flag</>
                        )}
                      </button>
                    )}
                 </div>

                 {/* Absolute corner indicator if running */}
                 {flags[feature.featureFlagName as FeatureFlag] && feature.status === 'active' && (
                   <div className="absolute -top-1 -right-1 w-3 h-3 bg-success rounded-full border-2 border-white shadow-sm" />
                 )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Brain Tab */}
      {activeTab === 'brain' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="p-6 bg-primary/5 border border-primary/20 rounded-2xl mb-8 flex gap-4">
             <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center shrink-0">
               <Brain className="w-6 h-6 text-text-main" />
             </div>
             <div>
               <h3 className="font-bold text-lg text-text-main">Nova Personal Context Brain</h3>
               <p className="text-sm text-text-muted mt-1">Structured memory system for accurate, non-clinical AI coaching. No spontaneous hallucinations. Memories are source-tagged and confidence-rated.</p>
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
                       mem.confidence === 'verified' && "text-success",
                       mem.confidence === 'high' && "text-primary"
                     )}>
                       {mem.confidence === 'verified' ? <CheckCircle2 className="w-3 h-3" /> : null}
                       {mem.confidence} Match
                     </span>
                   </div>
                   {mem.canEdit && (
                     <button onClick={() => deleteNovaMemory(mem.id)} className="text-xs text-destructive hover:text-rose-700 font-medium cursor-pointer">Forget</button>
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
          
          <div className="bg-card text-text-main p-8 rounded-3xl relative overflow-hidden border border-border/40">
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
                   <div className="text-xs text-primary uppercase font-black tracking-widest">AFFECTED ROOMS</div>
                   <div className="flex gap-2 font-mono text-xs">
                     <span className="px-2 py-1 bg-surface rounded text-text-main border border-border/10">Home</span>
                     <span className="px-2 py-1 bg-surface rounded text-text-main border border-border/10">Energy Budget</span>
                     <span className="px-2 py-1 bg-surface rounded text-text-main border border-border/10">Nova</span>
                   </div>
                 </div>
                 <div className="space-y-2">
                   <div className="text-xs text-success uppercase font-black tracking-widest">PROTECTED CORE (DO NOT TOUCH)</div>
                   <div className="flex gap-2 font-mono text-xs">
                     <span className="px-2 py-1 bg-card border border-border/40 rounded text-text-muted line-through">Guardian Protocol</span>
                     <span className="px-2 py-1 bg-card border border-border/40 rounded text-text-muted line-through">SHIP Logic</span>
                   </div>
                 </div>
                 <div className="pt-4 mt-4 border-t border-border/20 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-warning" />
                      <span className="text-xs font-bold text-warning">Risk: MEDIUM</span>
                    </div>
                    <span className="text-xs font-mono bg-primary/20 text-primary px-2 py-1 rounded">Flag: enable_overload_shield</span>
                 </div>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* Connectors Tab */}
      {activeTab === 'connectors' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="bg-surface/50 border border-border/40 p-8 rounded-3xl text-center space-y-4">
            <Network className="w-12 h-12 text-text-muted mx-auto" />
            <h3 className="text-xl font-bold text-text-main">Safe Connector Layer</h3>
            <p className="text-text-muted max-w-lg mx-auto text-sm">Features share context without directly modifying each other's state machines.</p>
            
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
               <div className="bg-card p-4 rounded-xl shadow-sm border border-border/40">
                 <div className="text-xs font-black uppercase text-primary mb-2">Calendar Scanner</div>
                 <p className="text-sm text-text-main">"User has 7 meetings today."</p>
               </div>
               <div className="bg-card p-4 rounded-xl shadow-sm border border-border/40 border-x-4 border-l-primary/0 border-r-primary/0 md:border-y-0 md:border-x">
                 <div className="text-xs font-black uppercase text-destructive mb-2">Energy Budget</div>
                 <p className="text-sm text-text-main">"That costs 90 energy credits. Overload risk threshold passed."</p>
               </div>
               <div className="bg-card p-4 rounded-xl shadow-sm border border-border/40">
                 <div className="text-xs font-black uppercase text-success mb-2">Nova Change Interpreter</div>
                 <p className="text-sm text-text-main">"Suggesting Recovery Mode protocol."</p>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
